import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { AccountInviteService, type SendResult } from "../auth/account-invites.service.js";
import { PasswordService } from "../auth/password.service.js";
import { PlatformUserDirectory } from "../auth/platform-user-directory.js";
import { AuditService } from "../common/audit.service.js";
import { EmailCheckService } from "../common/real-email.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateTeamMemberDto, UpdateTeamMemberDto } from "./dto/team.dto.js";
import { checkRemove, checkReset, checkTeamChange, type TeamRole } from "./team-rules.js";
import { generateTemporaryPassword } from "./temporary-password.js";

/** Everything about a person that may leave the server. Never the password hash. */
const PUBLIC = {
  id: true, email: true, fullName: true, role: true, isActive: true,
  lastLoginAt: true, lockedUntil: true, mustChangePassword: true, createdAt: true, passwordSetAt: true,
} as const;

type Actor = { id: string };

/** The platform's own staff. Only a SUPER_ADMIN gets here. */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly directory: PlatformUserDirectory,
    private readonly audit: AuditService,
    private readonly emailCheck: EmailCheckService,
    private readonly invites: AccountInviteService,
  ) {}

  async list() {
    const users = await this.prisma.platformUser.findMany({ select: PUBLIC, orderBy: { createdAt: "asc" } });
    const waiting = users.filter((u) => u.passwordSetAt === null).map((u) => u.id);
    const live = waiting.length
      ? await this.prisma.accountToken.findMany({ where: { realm: "PLATFORM", userId: { in: waiting }, usedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true } })
      : [];
    const hasLink = new Set(live.map((t) => t.userId));
    return users.map(({ passwordSetAt, ...u }) => ({
      ...u,
      /** none: they have a password. pending: an invitation is out. expired: it ran out and needs sending again. */
      invitation: passwordSetAt !== null ? ("none" as const) : hasLink.has(u.id) ? ("pending" as const) : ("expired" as const),
    }));
  }

  /** Makes the account and emails a link to choose their own password. Nobody, including us, ever knows one for it. */
  async create(dto: CreateTeamMemberDto, actor: Actor, req?: Request) {
    const email = dto.email.trim().toLowerCase();
    await this.emailCheck.assertReal(email);
    if (await this.prisma.platformUser.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException(`${email} already has a platform account`);
    }
    const user = await this.prisma.platformUser
      .create({
        data: { email, role: dto.role, fullName: dto.fullName?.trim() || null, passwordHash: await this.passwords.hash(generateTemporaryPassword(32)), passwordSetAt: null },
        select: PUBLIC,
      })
      .catch((e: { code?: string }) => {
        if (e?.code === "P2002") throw new ConflictException(`${email} already has a platform account`);
        throw e;
      });
    await this.audit.record(
      { actorType: "PLATFORM_USER", actorId: actor.id, action: "platform_user.create", entityType: "PlatformUser", entityId: user.id, after: { email: user.email, role: user.role } },
      req,
    );
    const { passwordSetAt: _p, ...safe } = user;
    return { user: safe, invitation: await this.sendLink("INVITE", user) };
  }

  async update(id: string, dto: UpdateTeamMemberDto, actor: Actor, req?: Request) {
    const before = await this.require(id);
    const activeSuperAdmins = await this.prisma.platformUser.count({ where: { role: "SUPER_ADMIN", isActive: true } });
    checkTeamChange(actor.id, { id, role: before.role as TeamRole, isActive: before.isActive }, { isActive: dto.isActive, role: dto.role }, activeSuperAdmins);

    await this.prisma.$transaction([
      this.prisma.platformUser.update({
        where: { id },
        data: {
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() || null } : {}),
        },
      }),
      // Switching someone off ends the sessions they already have.
      ...(dto.isActive === false ? [this.revokeSessions(id)] : []),
    ]);
    this.directory.invalidate(id);

    const after = await this.require(id);
    await this.audit.record(
      {
        actorType: "PLATFORM_USER", actorId: actor.id, entityType: "PlatformUser", entityId: id,
        action: dto.isActive === false ? "platform_user.deactivate" : dto.isActive === true && !before.isActive ? "platform_user.reactivate" : dto.role !== undefined && dto.role !== before.role ? "platform_user.role_change" : "platform_user.update",
        before: { email: before.email, role: before.role, isActive: before.isActive },
        after: { email: after.email, role: after.role, isActive: after.isActive },
      },
      req,
    );
    return after;
  }

  /**
   * "Reset password": the old password stops working at once, every session ends, the account unlocks, and the person is
   * emailed a link to choose a new one. Nobody is shown a password.
   */
  async resetPassword(id: string, actor: Actor, req?: Request) {
    checkReset(actor.id, id);
    const user = await this.require(id);
    await this.prisma.$transaction([
      this.prisma.platformUser.update({
        where: { id },
        data: { passwordHash: await this.passwords.hash(generateTemporaryPassword(32)), passwordSetAt: null, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
      }),
      this.revokeSessions(id),
    ]);
    this.directory.invalidate(id);
    await this.audit.record(
      { actorType: "PLATFORM_USER", actorId: actor.id, action: "platform_user.password_reset", entityType: "PlatformUser", entityId: id, after: { email: user.email } },
      req,
    );
    return { invitation: await this.sendLink("RESET", user) };
  }

  /** The email went missing, or the link ran out: send a fresh one. Only for someone who has not chosen a password yet. */
  async resendInvitation(id: string, actor: Actor, req?: Request) {
    const user = await this.require(id);
    if (user.passwordSetAt !== null) throw new BadRequestException("They have already chosen a password. If they cannot sign in, use Reset password.");
    await this.audit.record(
      { actorType: "PLATFORM_USER", actorId: actor.id, action: "platform_user.invite_resent", entityType: "PlatformUser", entityId: id, after: { email: user.email } },
      req,
    );
    return { invitation: await this.sendLink("INVITE", user) };
  }

  private sendLink(kind: "INVITE" | "RESET", user: { id: string; email: string; fullName: string | null }): Promise<SendResult> {
    return this.invites.sendLink({ realm: "PLATFORM", kind, user });
  }

  /**
   * Removes a person for good: their account, sessions and waiting links go, and their address is free to use again.
   * What they did stays in the history, under their name as it was.
   */
  async remove(id: string, actor: Actor, req?: Request) {
    const user = await this.require(id);
    const others = await this.prisma.platformUser.count({ where: { role: "SUPER_ADMIN", isActive: true, id: { not: id } } });
    checkRemove(actor.id, { id, role: user.role as TeamRole, isActive: user.isActive }, others);

    await this.prisma.$transaction([
      this.prisma.accountToken.deleteMany({ where: { realm: "PLATFORM", userId: id } }),
      this.prisma.platformUser.delete({ where: { id } }),   // their sessions go with them
    ]);
    this.directory.invalidate(id);
    await this.audit.record(
      { actorType: "PLATFORM_USER", actorId: actor.id, action: "platform_user.delete", entityType: "PlatformUser", entityId: id, before: { email: user.email, role: user.role } },
      req,
    );
    return { removed: true };
  }

  /** Who changed the team, newest first. */
  async activity(take = 30) {
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType: "PlatformUser" },
      orderBy: { createdAt: "desc" }, take,
      select: { id: true, createdAt: true, actorId: true, action: true, entityId: true, before: true, after: true },
    });
    const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.entityId]).filter((x): x is string => Boolean(x)))];
    const people = await this.prisma.platformUser.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
    const emailOf = new Map(people.map((p) => [p.id, p.email]));
    return rows.map((r) => ({
      id: r.id, at: r.createdAt, action: r.action,
      actor: (r.actorId ? emailOf.get(r.actorId) : undefined) ?? "someone who has since been removed",
      // A person who has been deleted is no longer in the table: the history kept their address.
      target: (r.entityId ? emailOf.get(r.entityId) : undefined) ?? ((r.before as { email?: string } | null)?.email ?? (r.after as { email?: string } | null)?.email ?? null),
    }));
  }

  private revokeSessions(userId: string) {
    return this.prisma.platformSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async require(id: string) {
    const u = await this.prisma.platformUser.findUnique({ where: { id }, select: PUBLIC });
    if (!u) throw new NotFoundException("Team member not found");
    return u;
  }
}

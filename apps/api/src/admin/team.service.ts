import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { PasswordService } from "../auth/password.service.js";
import { PlatformUserDirectory } from "../auth/platform-user-directory.js";
import { AuditService } from "../common/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateTeamMemberDto, UpdateTeamMemberDto } from "./dto/team.dto.js";
import { checkReset, checkTeamChange, type TeamRole } from "./team-rules.js";
import { generateTemporaryPassword } from "./temporary-password.js";

/** Everything about a person that may leave the server. Never the password hash. */
const PUBLIC = {
  id: true, email: true, fullName: true, role: true, isActive: true,
  lastLoginAt: true, lockedUntil: true, mustChangePassword: true, createdAt: true,
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
  ) {}

  list() {
    return this.prisma.platformUser.findMany({ select: PUBLIC, orderBy: { createdAt: "asc" } });
  }

  /** Creates the account with a random password, shown once. They must choose their own at first sign-in. */
  async create(dto: CreateTeamMemberDto, actor: Actor, req?: Request) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.platformUser.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException(`${email} already has a platform account`);
    }
    const temporaryPassword = generateTemporaryPassword();
    const user = await this.prisma.platformUser
      .create({
        data: { email, role: dto.role, fullName: dto.fullName?.trim() || null, passwordHash: await this.passwords.hash(temporaryPassword), mustChangePassword: true },
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
    return { user, temporaryPassword };
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

  /** A new random password, shown once; the old one stops working, the account unlocks and every session ends. */
  async resetPassword(id: string, actor: Actor, req?: Request) {
    checkReset(actor.id, id);
    const user = await this.require(id);
    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.platformUser.update({
        where: { id },
        data: { passwordHash: await this.passwords.hash(temporaryPassword), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      }),
      this.revokeSessions(id),
    ]);
    this.directory.invalidate(id);
    await this.audit.record(
      { actorType: "PLATFORM_USER", actorId: actor.id, action: "platform_user.password_reset", entityType: "PlatformUser", entityId: id, after: { email: user.email } },
      req,
    );
    return { temporaryPassword };
  }

  /** Who changed the team, newest first. */
  async activity(take = 30) {
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType: "PlatformUser" },
      orderBy: { createdAt: "desc" }, take,
      select: { id: true, createdAt: true, actorId: true, action: true, entityId: true },
    });
    const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.entityId]).filter((x): x is string => Boolean(x)))];
    const people = await this.prisma.platformUser.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
    const emailOf = new Map(people.map((p) => [p.id, p.email]));
    return rows.map((r) => ({
      id: r.id, at: r.createdAt, action: r.action,
      actor: (r.actorId ? emailOf.get(r.actorId) : undefined) ?? "someone who has since been removed",
      target: (r.entityId ? emailOf.get(r.entityId) : undefined) ?? null,
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

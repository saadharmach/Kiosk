import { BadRequestException, ConflictException } from "@nestjs/common";

export type TeamRole = "SUPER_ADMIN" | "SUPPORT";
export interface Member { id: string; role: TeamRole; isActive: boolean }

/**
 * What a platform admin may not do to the team, so nobody locks the platform out of itself:
 *  - not switch themselves off or change their own role (ask another super admin);
 *  - not leave the platform without a single active super admin.
 */
export function checkTeamChange(
  actorId: string,
  target: Member,
  change: { isActive?: boolean; role?: TeamRole },
  activeSuperAdmins: number,
): void {
  const switchingOff = change.isActive === false && target.isActive;
  const changingRole = change.role !== undefined && change.role !== target.role;

  if (target.id === actorId && (switchingOff || changingRole)) {
    throw new BadRequestException("You cannot switch yourself off or change your own role. Ask another super admin to do it.");
  }

  const losesSuperAdmin = target.isActive && target.role === "SUPER_ADMIN" && (switchingOff || (changingRole && change.role !== "SUPER_ADMIN"));
  if (losesSuperAdmin && activeSuperAdmins <= 1) {
    throw new ConflictException("There must always be at least one active super admin.");
  }
}

/** You choose your own password with "Change password", which asks for the current one. */
export function checkReset(actorId: string, targetId: string): void {
  if (actorId === targetId) throw new BadRequestException("To change your own password, use Change password.");
}

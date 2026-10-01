import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const ROLES = ["SUPER_ADMIN", "SUPPORT"] as const;

export class CreateTeamMemberDto {
  @IsEmail() @MaxLength(320)
  email!: string;

  @IsOptional() @IsString() @MaxLength(120)
  fullName?: string;

  @IsIn(ROLES)
  role!: (typeof ROLES)[number];
}

/** The email is the login and never changes; a password is only replaced through the reset or by its owner. */
export class UpdateTeamMemberDto {
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @IsOptional() @IsString() @MaxLength(120)
  fullName?: string;
}

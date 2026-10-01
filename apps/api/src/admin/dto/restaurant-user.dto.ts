import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const ROLES = ["OWNER", "MANAGER", "STAFF"] as const;
export type RestaurantUserRoleName = (typeof ROLES)[number];

export class CreateRestaurantUserDto {
  @IsEmail() @MaxLength(320)
  email!: string;

  @IsOptional() @IsString() @MaxLength(120)
  fullName?: string;

  @IsIn(ROLES)
  role!: RestaurantUserRoleName;
}

/** The email never changes (it is the login) and a password is only ever replaced through the reset. */
export class UpdateRestaurantUserDto {
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsIn(ROLES)
  role?: RestaurantUserRoleName;

  @IsOptional() @IsString() @MaxLength(120)
  fullName?: string;
}

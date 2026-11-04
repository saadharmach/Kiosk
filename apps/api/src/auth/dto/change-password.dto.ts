import { IsString, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsString() @MaxLength(200)
  currentPassword!: string;

  /** At least 12 characters, the same bar the command-line tool applies. */
  @IsString() @MinLength(12, { message: "The new password must be at least 12 characters" }) @MaxLength(200)
  newPassword!: string;
}

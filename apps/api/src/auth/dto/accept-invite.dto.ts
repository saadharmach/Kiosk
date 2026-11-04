import { IsString, MaxLength, MinLength } from "class-validator";

export class AcceptInviteDto {
  @IsString() @MaxLength(200)
  token!: string;

  @IsString() @MinLength(12, { message: "The password must be at least 12 characters" }) @MaxLength(200)
  password!: string;
}

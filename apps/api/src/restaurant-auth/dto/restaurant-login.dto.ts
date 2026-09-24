import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RestaurantLoginDto {
  @IsString()
  @Matches(/^[a-z0-9-]{2,60}$/, { message: "slug must be lowercase letters, digits and dashes" })
  slug!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
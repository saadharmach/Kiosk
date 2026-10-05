import { Transform } from "class-transformer";
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RestaurantLoginDto {
  // A phone keyboard capitalises the first letter: the restaurant address is not case sensitive.
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
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
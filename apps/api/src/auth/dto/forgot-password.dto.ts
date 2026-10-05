import { Transform } from "class-transformer";
import { IsEmail, IsString, Matches, MaxLength } from "class-validator";

export class ForgotPasswordDto {
  @IsEmail() @MaxLength(320)
  email!: string;
}

/** A restaurant's email is only unique within that restaurant, so the address of the restaurant is part of the question. */
export class RestaurantForgotPasswordDto extends ForgotPasswordDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString() @Matches(/^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/, { message: "slug must be lowercase letters, digits and dashes" })
  slug!: string;
}

import {
  IsEmail, IsHexColor, IsOptional, IsString, Length, Matches, MaxLength,
} from "class-validator";

export class CreateRestaurantDto {
  @Matches(/^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/, {
    message: "slug must be lowercase letters, digits and dashes",
  })
  slug!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional() @IsString() @Length(3, 3)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(64)
  timezone?: string;

  @IsOptional() @IsString() @Length(2, 5)
  locale?: string;

  @IsOptional() @IsEmail() @MaxLength(320)
  contactEmail?: string;

  @IsOptional() @IsString() @MaxLength(40)
  contactPhone?: string;

  @IsOptional() @IsString() @MaxLength(200)
  addressLine?: string;

  @IsOptional() @IsString() @MaxLength(120)
  city?: string;

  @IsOptional() @IsString() @Length(2, 2)
  country?: string;

  @IsOptional() @IsHexColor()
  primaryColor?: string;
}
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";

export class WelcomeSlideDto {
  @IsString() @MaxLength(300)
  path!: string;

  /** An unTill article id: the product shown on the slide, with its menu price. */
  @IsOptional() @IsString() @Matches(/^\d{1,19}$/)
  productId?: string | null;
}

export class TaglineDto {
  @IsOptional() @IsString() @MaxLength(120) fr?: string;
  @IsOptional() @IsString() @MaxLength(120) en?: string;
  @IsOptional() @IsString() @MaxLength(120) ar?: string;
}

/**
 * For each field: undefined = leave as it is, null (or "") = clear it.
 * Image paths must come from a signed upload for this restaurant.
 */
export class UpdateBrandingDto {
  @IsOptional() @ValidateNested() @Type(() => TaglineDto)
  tagline?: TaglineDto | null;

  @IsOptional() @IsString() @MaxLength(300)
  logoPath?: string | null;

  /** The whole list of welcome slides, in the order they are shown. [] removes them all. */
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => WelcomeSlideDto)
  welcomeSlides?: WelcomeSlideDto[];

  @IsOptional() @ValidateNested() @Type(() => TaglineDto)
  subtitle?: TaglineDto | null;
}

export class SignBrandingUploadDto {
  // Videos are refused by the storage for anything but the welcome slides.
  @IsIn(["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm"])
  contentType!: string;
}

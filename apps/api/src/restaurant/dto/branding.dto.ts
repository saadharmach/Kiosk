import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

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

  /** The whole list, in the order they are shown. [] removes them all. */
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(300, { each: true })
  welcomeImagePaths?: string[];
}

export class SignBrandingUploadDto {
  @IsIn(["image/jpeg", "image/png", "image/webp", "image/avif"])
  contentType!: string;
}

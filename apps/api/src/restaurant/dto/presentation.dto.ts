import { Type } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString,
  Matches, MaxLength, Min, ValidateNested,
} from "class-validator";

/** An empty string clears that language; an absent key leaves it untouched. */
export class I18nShortDto {
  @IsOptional() @IsString() @MaxLength(200) fr?: string;
  @IsOptional() @IsString() @MaxLength(200) en?: string;
  @IsOptional() @IsString() @MaxLength(200) ar?: string;
}

export class I18nLongDto {
  @IsOptional() @IsString() @MaxLength(2000) fr?: string;
  @IsOptional() @IsString() @MaxLength(2000) en?: string;
  @IsOptional() @IsString() @MaxLength(2000) ar?: string;
}

export class UpdateProductPresentationDto {
  @IsOptional() @ValidateNested() @Type(() => I18nShortDto) displayName?: I18nShortDto;
  @IsOptional() @ValidateNested() @Type(() => I18nLongDto) description?: I18nLongDto;
  @IsOptional() @IsString() @MaxLength(500) imagePath?: string;
  @IsOptional() @IsBoolean() isVisible?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsString() @MaxLength(40) badgeText?: string;
}

export class UpdateCategoryPresentationDto {
  @IsOptional() @ValidateNested() @Type(() => I18nShortDto) displayName?: I18nShortDto;
  @IsOptional() @ValidateNested() @Type(() => I18nLongDto) description?: I18nLongDto;
  @IsOptional() @IsString() @MaxLength(500) imagePath?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, { message: "color must be #RRGGBB or #RRGGBBAA" })
  color?: string;
  @IsOptional() @IsBoolean() isVisible?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class SetAllergensDto {
  @IsArray() @ArrayMaxSize(40)
  @Matches(/^[0-9]{1,19}$/, { each: true, message: "allergenIds must be numeric ids" })
  allergenIds!: string[];
}

export const PRESENTATION_SCOPES = ["GROUP", "DEPARTMENT"] as const;

export class ScopeParamDto {
  @IsIn(PRESENTATION_SCOPES) scope!: "GROUP" | "DEPARTMENT";
}
export class SignImageUploadDto {
  @IsIn(["image/jpeg", "image/png", "image/webp", "image/avif"])
  contentType!: string;
}
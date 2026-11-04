import { Type } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateNested,
} from "class-validator";

/**
 * One card per order type on the settings screen.
 * Absent field = leave the column alone. Explicit null = clear it.
 */
export class UpdateOrderTypeMappingDto {
  @IsIn(["EAT_IN", "TAKE_AWAY", "DELIVERY"])
  orderType!: "EAT_IN" | "TAKE_AWAY" | "DELIVERY";

  @IsOptional() @IsBoolean() isEnabled?: boolean;

  /** unTill sales area id. Sent as a string: BigInt does not survive JSON. */
  @IsOptional()
  @Matches(/^\d{1,19}$/, { message: "salesAreaId must be a positive integer, sent as a string" })
  salesAreaId?: string;

  @IsOptional() @IsInt() @Min(1) @Max(999999) fixedTableNumber?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(999999) tableRangeFrom?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(999999) tableRangeTo?: number | null;

  /** unTill rejects an empty TablePart with ReturnCode 3. */
  @IsOptional()
  @Matches(/^[a-f]$/, { message: "tablePart must be a single lowercase letter a-f" })
  tablePart?: string | null;
}

/**
 * Order-type on/off is NOT here on purpose: it lives on the order-type card
 * so there is only one switch per order type. See SettingsService.update().
 */
export class UpdateRestaurantSettingsDto {
  @IsOptional() @IsBoolean() askTableForEatIn?: boolean;
  @IsOptional() @IsInt() @Min(15) @Max(600) kioskIdleTimeoutSec?: number;
  @IsOptional() @IsInt() @Min(3) @Max(120) kioskResetDelaySec?: number;
  @IsOptional() @IsBoolean() showAllergens?: boolean;
  @IsOptional() @IsBoolean() showProductImages?: boolean;
  @IsOptional() @IsString() @MaxLength(500) ticketFooterText?: string | null;
}

export class UpdateSettingsDto {
  @IsOptional() @ValidateNested() @Type(() => UpdateRestaurantSettingsDto)
  settings?: UpdateRestaurantSettingsDto;

  @IsOptional() @IsArray() @ArrayMaxSize(3)
  @ValidateNested({ each: true }) @Type(() => UpdateOrderTypeMappingDto)
  orderTypes?: UpdateOrderTypeMappingDto[];
}
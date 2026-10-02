import { Type } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, ValidateNested,
} from "class-validator";

const ID = /^[0-9]{1,19}$/;   // unTill ids arrive as strings

export class CartOptionDto {
  @Matches(ID) optionGroupId!: string;
  @Matches(ID) articleId!: string;
}

export class CartLineDto {
  @Matches(ID) articleId!: string;

  @IsInt() @Min(1) @Max(99)
  quantity!: number;

  @IsOptional() @Matches(ID)
  sizeItemId?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => CartOptionDto)
  options?: CartOptionDto[];

  @IsOptional() @IsString() @MaxLength(120)
  note?: string;
}

export class PriceCartDto {
  @IsEnum(["EAT_IN", "TAKE_AWAY", "DELIVERY"])
  orderType!: "EAT_IN" | "TAKE_AWAY" | "DELIVERY";

  @IsOptional() @Matches(ID)
  salesAreaId?: string;

  /** The language the customer was reading, so the order records the names they saw. */
  @IsOptional() @IsIn(["fr", "en", "ar"])
  locale?: "fr" | "en" | "ar";

  @IsArray() @ArrayMaxSize(60)
  @ValidateNested({ each: true }) @Type(() => CartLineDto)
  lines!: CartLineDto[];
}

export class CreateOrderDto extends PriceCartDto {
  /** Same value on a retry → the same order, never a duplicate. */
  @IsUUID()
  clientOrderId!: string;

  @IsOptional() @IsInt() @Min(1) @Max(9999)
  tableNumber?: number;

  @IsOptional() @IsString() @MaxLength(80)
  customerName?: string;

  /** Which borne this is (K1, K2...), from the address the kiosk page was opened with. */
  @IsOptional() @Matches(/^[A-Za-z0-9]{1,4}$/, { message: "borneCode must be 1 to 4 letters or digits" })
  borneCode?: string;

  /** What the kiosk displayed. Used only to detect a price change. */
  @IsOptional() @IsInt() @Min(0)
  displayedTotalCents?: number;
}
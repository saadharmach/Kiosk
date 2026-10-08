import { IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class AddPeriodDto {
  @IsString() @Matches(DAY, { message: "startsOn must be a date like 2026-11-01" }) startsOn!: string;
  @IsString() @Matches(DAY, { message: "endsOn must be a date like 2026-11-30" }) endsOn!: string;
  /** What was paid for it, in the restaurant's currency. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) amount?: number | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class ChangePeriodDto {
  @IsOptional() @IsString() @Matches(DAY, { message: "startsOn must be a date like 2026-11-01" }) startsOn?: string;
  @IsOptional() @IsString() @Matches(DAY, { message: "endsOn must be a date like 2026-11-30" }) endsOn?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) amount?: number | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class CancelPeriodDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ListRestaurantsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;

  @IsOptional() @IsString() @MaxLength(80)
  q?: string;

  @IsOptional() @IsEnum(["ACTIVE", "SUSPENDED", "ARCHIVED"])
  status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}

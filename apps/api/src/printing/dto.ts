import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { CODEPAGE_NAMES } from "./printer-config.js";

/** A LAN address: an IPv4 or a host name. No scheme, no path, no port. */
const HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)$/;

export class SavePrinterDto {
  @IsString() @MaxLength(80)
  name!: string;

  @IsString() @Matches(HOST, { message: "address must be an IP address or a host name, without http:// or a port" })
  address!: string;

  @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsBoolean()
  isEnabled!: boolean;

  @IsOptional() @IsBoolean()
  autoPrint?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(3)
  copies?: number;

  @IsOptional() @IsBoolean()
  cut?: boolean;

  @IsOptional() @IsIn(CODEPAGE_NAMES)
  codepage?: string;
}

export class JobResultDto {
  @IsBoolean()
  ok!: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  error?: string;
}

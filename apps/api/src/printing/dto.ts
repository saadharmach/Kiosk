import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { CODEPAGE_NAMES } from "./printer-config.js";

/** A LAN address: an IPv4 or a host name. No scheme, no path, no port. */
export const HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)$/;

export const PRINTER_CONNECTIONS = ["NETWORK", "USB"] as const;
export type PrinterConnectionName = (typeof PRINTER_CONNECTIONS)[number];
const isNetwork = (o: { connection?: string }) => (o.connection ?? "NETWORK") === "NETWORK";
/** What a network printer's address must look like (checked by the service, since a USB printer's is a name). */
export const NETWORK_ADDRESS_MESSAGE = "address must be an IP address or a host name, without http:// or a port";

export class SavePrinterDto {
  @IsString() @MaxLength(80)
  name!: string;

  /** NETWORK (the default): reached at its IP. USB: a Windows printer on the computer that runs the helper. */
  @IsOptional() @IsIn(PRINTER_CONNECTIONS)
  connection?: PrinterConnectionName;

  /** NETWORK: an IP or a host name. USB: the Windows printer's name (empty until the helper has listed them). */
  @IsString() @MaxLength(200)
  address!: string;

  @ValidateIf(isNetwork) @IsInt() @Min(1) @Max(65535)
  port?: number;

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

/** The printers installed in Windows on the helper's computer. */
export class HelperPrintersDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true })
  names!: string[];
}

export class PairDto {
  @IsString() @MaxLength(40)
  code!: string;
}

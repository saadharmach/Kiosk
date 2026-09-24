import {
  IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
} from "class-validator";

export class UpsertTpapiDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9.-]{3,253}$/, { message: "host must be a hostname or IP" })
  host!: string;

  @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsOptional() @IsBoolean()
  useTls?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  soapPath?: string;

  @IsOptional() @IsString() @MaxLength(200)
  wsdlPath?: string;

  @IsOptional() @IsString() @MaxLength(60)
  appName?: string;

  @IsOptional() @IsInt() @Min(1000) @Max(120000)
  timeoutMs?: number;

  @IsOptional() @IsBoolean()
  isEnabled?: boolean;

  /** Credentials are optional on update: leave them out to keep the stored ones. */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  userName?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  password?: string;

  @IsOptional() @IsString() @MaxLength(400)
  appToken?: string;
}
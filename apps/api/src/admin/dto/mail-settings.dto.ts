import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

/** An SMTP server: a host name or an IP, without a scheme or a port. */
const HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)$/;
export const MAIL_SECURITY = ["NONE", "SSL", "STARTTLS"] as const;

/** The email settings form (Settings › Email in the admin). */
export class MailSettingsDto {
  /** Off: no email at all is sent. */
  @IsBoolean() enabled!: boolean;

  @IsEmail({}, { message: "The sender address is not a valid email address" }) @MaxLength(200)
  fromEmail!: string;

  @IsOptional() @IsString() @MaxLength(100)
  fromName?: string | null;

  @IsString() @Matches(HOST, { message: "The SMTP server must be a host name or an IP address, without smtp:// or a port" })
  host!: string;

  @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsIn(MAIL_SECURITY)
  security!: (typeof MAIL_SECURITY)[number];

  @IsBoolean() authEnabled!: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  username?: string | null;

  /** Left empty: the saved password is kept (a browser is never given it back). */
  @IsOptional() @IsString() @MaxLength(500)
  password?: string;
}

/** The form as it is (saved or not), and where to send the test email. */
export class SendTestMailDto extends MailSettingsDto {
  @IsEmail({}, { message: "The test address is not a valid email address" }) @MaxLength(200)
  to!: string;
}

import { IsBoolean, IsIn, IsOptional, Matches, ValidateIf } from "class-validator";

const ID = /^[0-9]{1,19}$/;

/** How customers pay at the kiosk. An unTill payment type is one of the restaurant's own (Settings › synced from unTill). */
export class UpdatePaymentSettingsDto {
  @IsBoolean() cardEnabled!: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(ID, { message: "cardUntillPaymentId must be an unTill id" })
  cardUntillPaymentId?: string | null;
  @IsBoolean() cashEnabled!: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(ID, { message: "cashUntillPaymentId must be an unTill id" })
  cashUntillPaymentId?: string | null;
  /** Cash: close the order in unTill at once (true), or leave it open to be paid at the counter (false, as before). */
  @IsBoolean() cashClosesOrder!: boolean;
}

/** A borne's card terminal. provider null: this borne takes no cards. */
export class UpdateTerminalDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(["SIMULATOR"])
  provider?: string | null;
  @IsBoolean() isEnabled!: boolean;
}

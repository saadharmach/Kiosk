import { SetMetadata } from "@nestjs/common";

export const ALLOW_WHILE_PASSWORD_CHANGE = "allowWhilePasswordChangeRequired";

/** Marks the few routes a person may use before they have chosen their own password (to do exactly that). */
export const AllowWhilePasswordChangeRequired = () => SetMetadata(ALLOW_WHILE_PASSWORD_CHANGE, true);

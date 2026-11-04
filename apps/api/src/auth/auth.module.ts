import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";
import { AccountTokenService } from "../common/account-tokens.service.js";
import { AuditService } from "../common/audit.service.js";
import { MailerService } from "../common/mailer.service.js";
import { AccountInviteService } from "./account-invites.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { PlatformUserDirectory } from "./platform-user-directory.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, JwtAuthGuard, PlatformUserDirectory, AuditService, AccountTokenService, MailerService, AccountInviteService],
  exports: [TokenService, PasswordService, JwtAuthGuard, PlatformUserDirectory, AccountTokenService, MailerService, AccountInviteService],
})
export class AuthModule {}
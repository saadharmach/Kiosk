import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, JwtAuthGuard],
  exports: [TokenService, PasswordService, JwtAuthGuard],
})
export class AuthModule {}
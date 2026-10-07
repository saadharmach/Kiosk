import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import express from "express";
import { AppModule } from "./app.module.js";
import { corsOrigins, env } from "./config/env.js";
import { MEDIA_URL_PREFIX, StorageService } from "./common/storage.service.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["log", "warn", "error"] });

  app.setGlobalPrefix("api");
  // Photos and logos. In production nginx serves this folder itself and requests never get here.
  // The paths are unique per upload, so a file never changes: cache it for good.
  app.use(MEDIA_URL_PREFIX, express.static(new StorageService().dir, {
    // A missing file falls through to the router's plain 404 (fallthrough: false turned it into a logged 500).
    index: false, dotfiles: "deny", fallthrough: true, immutable: true, maxAge: "365d",
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }));
  app.use(cookieParser());
  app.set("trust proxy", 1);
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  await app.listen(env.PORT, "0.0.0.0");
  new Logger("Bootstrap").log(`API listening on http://localhost:${env.PORT}/api`);
}

void bootstrap();
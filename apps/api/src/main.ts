import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { corsOrigins, env } from "./config/env.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["log", "warn", "error"] });

  app.setGlobalPrefix("api");
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
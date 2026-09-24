import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { TpapiClient, type TpapiBaseResponse } from "@kiosk/tpapi";
import { AuditService } from "../common/audit.service.js";
import { CryptoService, type Sealed } from "../common/crypto.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpsertTpapiDto } from "./dto/upsert-tpapi.dto.js";

type Credentials = { userName: string; password: string; appToken: string };

/** Everything the admin UI may see. Credentials are never included. */
const PUBLIC = {
  id: true, restaurantId: true, host: true, port: true, useTls: true,
  wsdlPath: true, soapPath: true, appName: true, timeoutMs: true, isEnabled: true,
  lastSuccessAt: true, lastFailureAt: true, lastErrorMessage: true,
  lastLatencyMs: true, lastSyncAt: true, updatedAt: true,
} as const;

@Injectable()
export class TpapiConnectionService {
  private readonly logger = new Logger(TpapiConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async get(restaurantId: string) {
    const conn = await this.prisma.tpapiConnection.findUnique({
      where: { restaurantId },
      select: { ...PUBLIC, credentialsCiphertext: true },
    });
    if (!conn) throw new NotFoundException("No TPAPI configuration for this restaurant");
    const { credentialsCiphertext, ...rest } = conn;
    return { ...rest, hasCredentials: Boolean(credentialsCiphertext) };
  }

  async upsert(restaurantId: string, dto: UpsertTpapiDto, actorId: string, req: Request) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const existing = await this.prisma.tpapiConnection.findUnique({ where: { restaurantId } });

    // Credentials: all three together, or none at all.
    const given = [dto.userName, dto.password, dto.appToken].filter((v) => v !== undefined).length;
    let sealed: Sealed | null = null;
    if (given > 0) {
      if (!dto.userName || !dto.password) {
        throw new BadRequestException("userName and password are required together");
      }
      sealed = this.crypto.sealJson({
        userName: dto.userName,
        password: dto.password,
        appToken: dto.appToken ?? "",
      } satisfies Credentials);
    } else if (!existing?.credentialsCiphertext) {
      throw new BadRequestException("Credentials are required the first time");
    }

    const base = {
      host: dto.host,
      port: dto.port,
      useTls: dto.useTls ?? false,
      soapPath: dto.soapPath ?? "/soap/ITPAPIPOS",
      wsdlPath: dto.wsdlPath ?? "/wsdl/ITPAPIPOS",
      appName: dto.appName ?? "KioskPlatform",
      timeoutMs: dto.timeoutMs ?? 15000,
      isEnabled: dto.isEnabled ?? true,
      ...(sealed
        ? {
            credentialsCiphertext: sealed.ciphertext,
            credentialsIv: sealed.iv,
            credentialsAuthTag: sealed.authTag,
          }
        : {}),
    };

    const conn = await this.prisma.tpapiConnection.upsert({
      where: { restaurantId },
      create: { restaurantId, ...base },
      update: base,
      select: PUBLIC,
    });

    await this.audit.record(
      {
        restaurantId,
        actorType: "PLATFORM_USER",
        actorId,
        action: existing ? "tpapi.update" : "tpapi.create",
        entityType: "TpapiConnection",
        entityId: conn.id,
        // host/port only — never the credentials, not even encrypted
        before: existing ? { host: existing.host, port: existing.port } : undefined,
        after: { host: conn.host, port: conn.port, credentialsChanged: Boolean(sealed) },
      },
      req,
    );

    return conn;
  }

  /** A real TPAPI round trip: Ping, then GetVersion when Ping succeeds. */
  async test(restaurantId: string, actorId?: string) {
    const conn = await this.prisma.tpapiConnection.findUnique({ where: { restaurantId } });
    if (!conn) throw new NotFoundException("No TPAPI configuration for this restaurant");
    if (!conn.credentialsCiphertext || !conn.credentialsIv || !conn.credentialsAuthTag) {
      throw new BadRequestException("No credentials stored");
    }

    const creds = this.crypto.openJson<Credentials>({
      ciphertext: conn.credentialsCiphertext,
      iv: conn.credentialsIv,
      authTag: conn.credentialsAuthTag,
    });

    const endpoint = `${conn.useTls ? "https" : "http"}://${conn.host}:${conn.port}${conn.soapPath}`;
    const correlationId = randomUUID();
    const client = new TpapiClient({
      endpoint,
      timeoutMs: conn.timeoutMs,
      credentials: {
        userName: creds.userName,
        password: creds.password,
        appToken: creds.appToken,
        appName: conn.appName,
      },
    });

    const ping = await client.ping({ correlationId });

    let version: string | undefined;
    if (ping.ok) {
      try {
        const v = await client.call<TpapiBaseResponse & { Major: number; Minor: number }>("GetVersion", {}, { correlationId });
        version = `${v.Major}.${v.Minor}`;
      } catch (e) {
        this.logger.warn(`GetVersion failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    await this.prisma.tpapiConnection.update({
      where: { restaurantId },
      data: ping.ok
        ? { lastSuccessAt: new Date(), lastLatencyMs: ping.durationMs, lastErrorMessage: null }
        : {
            lastFailureAt: new Date(),
            lastLatencyMs: ping.durationMs,
            lastErrorMessage: ping.error ?? `ReturnCode ${ping.returnCode}: ${ping.message ?? ""}`,
          },
    });

    await this.prisma.integrationLog.create({
      data: {
        restaurantId,
        kind: "TPAPI",
        operation: "Ping",
        correlationId,
        level: ping.ok ? "INFO" : "ERROR",
        ok: ping.ok,
        returnCode: ping.returnCode ?? null,
        message: ping.error ?? ping.message ?? null,
        durationMs: ping.durationMs,
        requestSummary: { endpoint, testedBy: actorId ?? null },
      },
    });

    this.logger.log(`TPAPI test ${restaurantId}: ${ping.ok ? "OK" : "FAIL"} in ${ping.durationMs}ms`);

    return {
      ok: ping.ok,
      endpoint,
      durationMs: ping.durationMs,
      returnCode: ping.returnCode,
      message: ping.message,
      error: ping.error,
      version,
      correlationId,
    };
  }
}
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TpapiClient } from "@kiosk/tpapi";
import { CryptoService } from "./crypto.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type Credentials = { userName: string; password: string; appToken: string };

@Injectable()
export class TpapiClientFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async forRestaurant(restaurantId: string): Promise<{ client: TpapiClient; endpoint: string }> {
    const conn = await this.prisma.tpapiConnection.findUnique({ where: { restaurantId } });
    if (!conn) throw new NotFoundException("No TPAPI configuration for this restaurant");
    if (!conn.isEnabled) throw new BadRequestException("TPAPI connection is disabled");
    if (!conn.credentialsCiphertext || !conn.credentialsIv || !conn.credentialsAuthTag) {
      throw new BadRequestException("No credentials stored");
    }

    const creds = this.crypto.openJson<Credentials>({
      ciphertext: conn.credentialsCiphertext,
      iv: conn.credentialsIv,
      authTag: conn.credentialsAuthTag,
    });

    const endpoint = `${conn.useTls ? "https" : "http"}://${conn.host}:${conn.port}${conn.soapPath}`;
    return {
      endpoint,
      client: new TpapiClient({
        endpoint,
        timeoutMs: Math.max(conn.timeoutMs, 60_000),
        credentials: { ...creds, appName: conn.appName },
      }),
    };
  }
}
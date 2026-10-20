import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireOrderable } from "./availability.js";
import { redeemScreenCode } from "./screen.js";

/** The kiosk side of registering a screen: the back office gives the code, the screen trades it here for its secret. */
@Injectable()
export class KioskScreenService {
  constructor(private readonly prisma: PrismaService) {}

  async register(slug: string, code: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true, status: true } });
    requireOrderable(restaurant);
    return redeemScreenCode(this.prisma, restaurant.id, code);
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { availableProviders, providerFor } from "../payments/payment-providers.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdatePaymentSettingsDto, UpdateTerminalDto } from "./dto/payment-settings.dto.js";

/**
 * The back office's Payment page: which ways to pay the kiosk offers, which unTill payment type each closes the order
 * with, and each borne's card terminal. Every read and write is scoped by the restaurant.
 */
@Injectable()
export class PaymentSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(restaurantId: string) {
    const [s, payments, kiosks, terminals] = await Promise.all([
      this.prisma.restaurantSettings.findUnique({ where: { restaurantId } }),
      this.prisma.tpapiPayment.findMany({ where: { restaurantId }, orderBy: { number: "asc" }, select: { untillId: true, number: true, name: true, kind: true } }),
      this.prisma.kiosk.findMany({ where: { restaurantId }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, isEnabled: true } }),
      this.prisma.paymentTerminal.findMany({ where: { restaurantId, kioskId: { not: null } }, select: { kioskId: true, provider: true, isEnabled: true } }),
    ]);
    const termOf = new Map(terminals.map((t) => [t.kioskId!, t]));
    const settings = {
      cardEnabled: s?.cardPaymentEnabled ?? false,
      cardUntillPaymentId: s?.cardUntillPaymentId?.toString() ?? null,
      cashEnabled: s?.cashPaymentEnabled ?? true,
      cashUntillPaymentId: s?.cashUntillPaymentId?.toString() ?? null,
      cashClosesOrder: s?.cashClosesOrder ?? false,
    };
    const bornes = kiosks.map((k) => {
      const t = termOf.get(k.id);
      return {
        kioskId: k.id, code: k.code, name: k.name, borneEnabled: k.isEnabled,
        terminal: t ? { provider: t.provider, isEnabled: t.isEnabled, usable: t.isEnabled && Boolean(providerFor(t.provider)) } : null,
      };
    });
    const warnings: string[] = [];
    if (settings.cardEnabled && !bornes.some((b) => b.terminal?.usable)) {
      warnings.push("Le paiement par carte est activé, mais aucune borne n’a de terminal de carte en service : les bornes ne proposent que les espèces.");
    }
    if (payments.length === 0) warnings.push("Aucun moyen de paiement d’unTill pour l’instant : lancez une synchronisation du menu (l’administrateur), ou attendez la prochaine.");
    return {
      settings,
      untillPayments: payments.map((p) => ({ untillId: p.untillId.toString(), number: p.number, name: p.name, kind: p.kind })),
      providers: availableProviders(),
      bornes,
      warnings,
    };
  }

  async update(restaurantId: string, dto: UpdatePaymentSettingsDto) {
    if (!dto.cardEnabled && !dto.cashEnabled) throw new BadRequestException("Keep at least one way to pay, otherwise the kiosk cannot take any order.");
    const ids = [dto.cardUntillPaymentId, dto.cashUntillPaymentId].filter((x): x is string => Boolean(x));
    const known = new Set((await this.prisma.tpapiPayment.findMany({ where: { restaurantId, untillId: { in: ids.map((i) => BigInt(i)) } }, select: { untillId: true } })).map((p) => p.untillId.toString()));
    for (const id of ids) if (!known.has(id)) throw new BadRequestException(`unTill payment type ${id} is not one of this restaurant's`);
    if (dto.cardEnabled && !dto.cardUntillPaymentId) throw new BadRequestException("Card: choose the unTill payment type card orders are closed with.");
    if (dto.cashEnabled && dto.cashClosesOrder && !dto.cashUntillPaymentId) throw new BadRequestException("Cash: choose the unTill payment type to close cash orders with, or leave them open.");
    const data = {
      cardPaymentEnabled: dto.cardEnabled,
      cardUntillPaymentId: dto.cardUntillPaymentId ? BigInt(dto.cardUntillPaymentId) : null,
      cashPaymentEnabled: dto.cashEnabled,
      cashUntillPaymentId: dto.cashUntillPaymentId ? BigInt(dto.cashUntillPaymentId) : null,
      cashClosesOrder: dto.cashEnabled && dto.cashClosesOrder,
    };
    await this.prisma.restaurantSettings.upsert({ where: { restaurantId }, create: { restaurantId, ...data }, update: data });
    return this.get(restaurantId);
  }

  async setTerminal(restaurantId: string, kioskId: string, dto: UpdateTerminalDto) {
    const kiosk = await this.prisma.kiosk.findFirst({ where: { id: kioskId, restaurantId }, select: { id: true, name: true } });
    if (!kiosk) throw new NotFoundException("Borne not found");
    const provider = dto.provider ?? null;
    if (provider && !availableProviders().some((p) => p.name === provider)) throw new BadRequestException(`${provider} is not available on this server`);
    const existing = await this.prisma.paymentTerminal.findFirst({ where: { restaurantId, kioskId }, select: { id: true } });
    const data = { provider, isEnabled: Boolean(provider) && dto.isEnabled, status: provider && dto.isEnabled ? ("ONLINE" as const) : ("DISABLED" as const) };
    if (existing) await this.prisma.paymentTerminal.updateMany({ where: { id: existing.id, restaurantId }, data });
    else await this.prisma.paymentTerminal.create({ data: { restaurantId, kioskId, name: `${kiosk.name} TPE`, ...data } });
    return this.get(restaurantId);
  }
}

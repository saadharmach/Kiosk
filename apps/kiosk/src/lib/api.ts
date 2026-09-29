export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (Array.isArray(body?.message) ? body.message.join(", ") : body?.message) ??
      `Request failed with ${res.status}`;
    throw new ApiError(message, res.status, body?.code);
  }
  return body as T;
}

export type OrderTypeName = "EAT_IN" | "TAKE_AWAY" | "DELIVERY";

/** The sync stores TPAPI's shape; accept either casing rather than guess. */
export interface TableRange {
  FromTable?: number;
  ToTable?: number;
  fromTable?: number;
  toTable?: number;
}

export interface OrderTypeOption {
  orderType: OrderTypeName;
  configured: boolean;
  salesAreaId: string | null;
  salesAreaName: string | null;
  askTable: boolean;
  tableRanges: TableRange[];
  fixedTableNumber: number | null;
}

export interface Bootstrap {
  restaurant: {
    slug: string;
    name: string;
    currency: string;
    locale: string;
    logoPath: string | null;
    primaryColor: string | null;
  };
  ordering: {
    eatIn: boolean;
    takeAway: boolean;
    delivery: boolean;
    askTableForEatIn: boolean;
    idleTimeoutSec: number;
    resetDelaySec: number;
    showAllergens: boolean;
    showProductImages: boolean;
  };
  salesAreas: { untillId: string; name: string }[];
  orderTypes: OrderTypeOption[];
  pos: { connected: boolean; lastSyncAt: string | null };
  catalogReady: boolean;
}

export const api = {
  bootstrap: (slug: string) => request<Bootstrap>(`/kiosk/${slug}/bootstrap`),
};

export function tableInRanges(n: number, ranges: TableRange[]): boolean {
  return ranges.some((r) => {
    const from = Number(r.FromTable ?? r.fromTable);
    const to = Number(r.ToTable ?? r.toTable);
    return Number.isFinite(from) && Number.isFinite(to) && n >= from && n <= to;
  });
}

export type Pricing = "BASE" | "SIZE" | "MENU" | "UNPRICED";

export interface CatalogSize { sizeItemId: string; name: string; price: number }
export interface CatalogOptionItem { articleId: string; name: string; price: number }
export interface CatalogOptionGroup {
  id: string;
  name: string;
  requiredChoices: number | null;
  isFree: boolean;
  items: CatalogOptionItem[];
}

export interface CatalogProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  badgeText: string | null;
  sortOrder: number;
  visible: boolean;
  pricing: Pricing;
  price: number | null;
  sizes: CatalogSize[];
  optionGroups: CatalogOptionGroup[];
  isMenu: boolean;
  promo: boolean;
}

export interface CatalogCategory {
  id: string;
  groupName: string | null;
  name: string;
  sortOrder: number;
  visible: boolean;
}

export interface Catalog {
  currency: string;
  categories: CatalogCategory[];
  products: CatalogProduct[];
}

export const getCatalog = (slug: string, salesAreaId: string, locale: string) =>
  request<Catalog>(
    `/kiosk/${slug}/catalog?salesAreaId=${encodeURIComponent(salesAreaId)}&locale=${encodeURIComponent(locale)}`,
  );


export interface PricedLine {
  articleId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PricedCart {
  currency: string;
  lines: PricedLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  itemCount: number;
}

export interface WireCartLine {
  articleId: string;
  quantity: number;
  sizeItemId?: string;
  options?: { optionGroupId: string; articleId: string }[];
}

export interface PlacedOrder {
  reference: string;
  status: string;
  tableNumber: number | null;
  total: number;
  currency: string;
  itemCount: number;
  items: { name: string; quantity: number; total: number }[];
}

export const priceCart = (
  slug: string,
  body: { orderType: string; salesAreaId: string; lines: WireCartLine[] },
) => request<PricedCart>(`/kiosk/${slug}/cart/price`, { method: "POST", body: JSON.stringify(body) });

export const createOrder = (
  slug: string,
  body: {
    clientOrderId: string;
    orderType: string;
    salesAreaId: string;
    tableNumber?: number;
    displayedTotalCents?: number;
    lines: WireCartLine[];
  },
) => request<PlacedOrder>(`/kiosk/${slug}/orders`, { method: "POST", body: JSON.stringify(body) });
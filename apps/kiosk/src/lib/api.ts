export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly restaurantName?: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** The restaurant exists but is not taking orders right now (switched off by the platform). */
export const isUnavailableError = (e: unknown): boolean => e instanceof ApiError && e.code === "RESTAURANT_UNAVAILABLE";

/** The request never reached the API, or an intermediary answered instead of it. */
export const isConnectionError = (e: unknown): boolean => e instanceof ApiError && e.code === "NETWORK";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("The server cannot be reached", 0, "NETWORK");
  }
  const body = await res.json().catch(() => null);
  // Our API always answers with JSON, even for errors. A non-JSON 5xx is a proxy or
  // gateway speaking, which means the API itself is down.
  if (!res.ok && res.status >= 500 && body === null) {
    throw new ApiError("The server cannot be reached", res.status, "NETWORK");
  }
  if (!res.ok) {
    const message =
      (Array.isArray(body?.message) ? body.message.join(", ") : body?.message) ??
      `Request failed with ${res.status}`;
    throw new ApiError(message, res.status, body?.code, typeof body?.restaurantName === "string" ? body.restaurantName : undefined);
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

export interface WelcomeSlide {
  url: string;
  kind: "image" | "video";
  product: { id: string; name: string; names: Partial<Record<"fr" | "en" | "ar", string>>; price: number; fromPrice: boolean } | null;
}

export interface Bootstrap {
  /** Which borne this machine is, as the restaurant named it (null when it is not one of its bornes). */
  borne?: { code: string; name: string } | null;
  restaurant: {
    slug: string;
    name: string;
    currency: string;
    locale: string;
    logoPath: string | null;
    /** Public URLs; null until the restaurant uploads them. */
    logoUrl: string | null;
    /** Welcome-screen adverts (photos or videos), shown in turn; a slide may show a product with its menu price. */
    welcomeSlides: WelcomeSlide[];
    /** Only the languages that have text. */
    tagline: Partial<Record<"fr" | "en" | "ar", string>>;
    subtitle?: Partial<Record<"fr" | "en" | "ar", string>>;
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
  bootstrap: (slug: string, borne?: string | null) =>
    request<Bootstrap>(`/kiosk/${slug}/bootstrap${borne ? `?borne=${encodeURIComponent(borne)}` : ""}`),
};

export function tableInRanges(n: number, ranges: TableRange[]): boolean {
  return ranges.some((r) => {
    const from = Number(r.FromTable ?? r.fromTable);
    const to = Number(r.ToTable ?? r.toTable);
    return Number.isFinite(from) && Number.isFinite(to) && n >= from && n <= to;
  });
}

export type Pricing = "BASE" | "SIZE" | "MENU" | "UNPRICED";

export interface CatalogAllergen { id: string; number: number; name: string }
export interface CatalogSize { sizeItemId: string; name: string; price: number }
export interface CatalogOptionItem { articleId: string; name: string; price: number }
/**
 * unTill's kinds of option. A menu's components (type 5) are chosen inside a menu article and are
 * not offered yet, because menus have no prices in unTill.
 */
export type OptionKind = "MUST_HAVE" | "FREE_OPTION" | "SUPPLEMENT" | "CONDIMENT";

/** A group as a product uses it, joined with the group's name and choices (see hydrateCatalog). */
export interface CatalogOptionGroup {
  id: string;
  kind: OptionKind;
  name: string;
  requiredChoices: number | null;
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
  allergens: CatalogAllergen[];
}

export interface CatalogCategory {
  id: string;
  groupName: string | null;
  name: string;
  /** The category's photo, set in the back office. */
  imageUrl?: string | null;
  sortOrder: number;
  visible: boolean;
}

export interface Catalog {
  currency: string;
  categories: CatalogCategory[];
  products: CatalogProduct[];
  /** Per department: the products to offer after something from it is added, first first. */
  suggestions: Record<string, string[]>;
}

/** What the API sends: each option group's name and choices once, products only list which they use. */
export interface RawCatalog extends Omit<Catalog, "products"> {
  products: (Omit<CatalogProduct, "optionGroups"> & {
    optionGroups: { id: string; kind: OptionKind; requiredChoices: number | null }[];
  })[];
  groupDefs: Record<string, { name: string; items: CatalogOptionItem[] }>;
}

/** Joins each product's groups with the shared definitions. The same objects are reused, so it costs no memory. */
export function hydrateCatalog(raw: RawCatalog): Catalog {
  return {
    ...raw,
    products: raw.products.map((p) => ({
      ...p,
      optionGroups: p.optionGroups.flatMap((g) => {
        const def = raw.groupDefs[g.id];
        return def ? [{ ...g, name: def.name, items: def.items }] : [];
      }),
    })),
  };
}

export const getCatalog = async (slug: string, salesAreaId: string, locale: string) =>
  hydrateCatalog(
    await request<RawCatalog>(
      `/kiosk/${slug}/catalog?salesAreaId=${encodeURIComponent(salesAreaId)}&locale=${encodeURIComponent(locale)}`,
    ),
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
  body: { orderType: string; salesAreaId: string; locale?: string; lines: WireCartLine[] },
) => request<PricedCart>(`/kiosk/${slug}/cart/price`, { method: "POST", body: JSON.stringify(body) });

export const createOrder = (
  slug: string,
  body: {
    clientOrderId: string;
    orderType: string;
    salesAreaId: string;
    /** The language the customer was reading; the order records the names in it. */
    locale?: string;
    tableNumber?: number;
    displayedTotalCents?: number;
    /** Which borne placed the order (its code): the ticket prints on that borne's printer. */
    borneCode?: string;
    lines: WireCartLine[];
  },
) => request<PlacedOrder>(`/kiosk/${slug}/orders`, { method: "POST", body: JSON.stringify(body) });
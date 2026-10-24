import { request } from "./api";

export interface DashboardBorne { code: string; name: string; enabled: boolean; registered: boolean; online: boolean; lastSeenAt: string | null }
export type OrderStatus = "AWAITING_PAYMENT" | "DRAFT" | "PENDING" | "SENT" | "CONFIRMED" | "PAID" | "FAILED" | "CANCELLED";

export interface Dashboard {
  today: string;
  currency: string;
  /** online / offline are null when no borne has a registered screen: nobody can say. */
  bornes: { configured: number; online: number | null; offline: number | null; list: DashboardBorne[] };
  orders: { count: number; revenue: number };
  /** null: the restaurant has no till connection set up. */
  till: { reachable: boolean; lastSyncAt: string | null } | null;
  lastSync: { status: string; at: string; error: string | null } | null;
  recentOrders: { reference: string; status: OrderStatus; total: number; orderType: string; at: string }[];
}

export const getDashboard = (slug: string) => request<Dashboard>(`/restaurant/${slug}/dashboard`);

/** How an order's state reads, and the badge it wears. */
export const ORDER_STATUS: Record<OrderStatus, [string, string]> = {
  AWAITING_PAYMENT: ["Paiement en attente", "badge-warn"],
  DRAFT: ["Brouillon", "badge-muted"],
  PENDING: ["En attente", "badge-info"],
  SENT: ["Envoyée", "badge-info"],
  CONFIRMED: ["Confirmée", "badge-ok"],
  PAID: ["Payée", "badge-ok"],
  FAILED: ["Échec", "badge-err"],
  CANCELLED: ["Annulée", "badge-muted"],
};

export const mad = (amount: number, currency: string) =>
  new Intl.NumberFormat("fr-MA", { style: "currency", currency }).format(amount);

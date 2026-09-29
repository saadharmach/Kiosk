import { request } from "./api";

export const ORDER_STATUSES = [
  "DRAFT", "PENDING", "SENT", "CONFIRMED", "PAID", "FAILED", "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderRow {
  id: string;
  reference: string;
  status: OrderStatus;
  orderType: string;
  tableNumber: number | null;
  covers: number | null;
  itemCount: number;
  total: number;
  currency: string;
  businessDate: string;
  createdAt: string;
  sentAt: string | null;
  tpapiLastError: string | null;
}

export interface OrderPage {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  orders: OrderRow[];
}

export interface OrderDetailItem {
  lineNumber: number;
  parentLineNumber: number | null;
  kind: string;
  /** BigInt on the server; string or number depending on the serializer. */
  articleId: string | number | null;
  articleName: string;
  displayName: string | null;
  sizeName: string | null;
  optionGroupName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  text: string | null;
}

/** Tolerant on purpose: the timeline renders whichever of these the server sends. */
export interface OrderHistoryEntry {
  id?: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  status?: string | null;
  actor?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  reason?: string | null;
  createdAt?: string;
  at?: string;
}

export interface OrderDetail {
  id: string;
  reference: string;
  status: OrderStatus;
  allowedTransitions: OrderStatus[];
  orderType: string;
  salesAreaId: string | number | null;
  tableNumber: number | null;
  tablePart: string | null;
  covers: number | null;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  itemCount: number;
  businessDate: string;
  createdAt: string;
  sentAt: string | null;
  confirmedAt: string | null;
  paidDetectedAt: string | null;
  cancelledAt: string | null;
  tpapi: {
    attempts: number;
    returnCode: number | null;
    lastError: string | null;
    correlationId: string | null;
  };
  items: OrderDetailItem[];
  history: OrderHistoryEntry[];
}

export interface OrderListParams {
  status?: string;
  from?: string;
  to?: string;
  reference?: string;
  page?: string;
  pageSize?: string;
}

export function listOrders(slug: string, p: OrderListParams) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
  const q = qs.toString();
  return request<OrderPage>(`/restaurant/${slug}/orders${q ? `?${q}` : ""}`);
}

export const getOrder = (slug: string, id: string) =>
  request<OrderDetail>(`/restaurant/${slug}/orders/${id}`);

export const cancelOrder = (slug: string, id: string, reason?: string) =>
  request<unknown>(`/restaurant/${slug}/orders/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });

export const retryOrder = (slug: string, id: string) =>
  request<unknown>(`/restaurant/${slug}/orders/${id}/retry`, { method: "POST" });


export const submitOrder = (slug: string, id: string) =>
  request<unknown>(`/restaurant/${slug}/orders/${id}/submit`, { method: "POST" });

export const verifyOrder = (slug: string, id: string) =>
  request<unknown>(`/restaurant/${slug}/orders/${id}/verify`, { method: "POST" });

export const money = (n: number, currency: string) => `${n.toFixed(2)} ${currency}`;
export const when = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString() : "—";
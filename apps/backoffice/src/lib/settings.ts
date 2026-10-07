import { request } from "./api";

export const ORDER_TYPES = ["EAT_IN", "TAKE_AWAY", "DELIVERY"] as const;
export type OrderTypeName = (typeof ORDER_TYPES)[number];

export const ORDER_TYPE_LABEL: Record<OrderTypeName, string> = {
  EAT_IN: "Eat in",
  TAKE_AWAY: "Take away",
  DELIVERY: "Delivery",
};

export interface TableRange { fromTable: number; toTable: number }

export interface SettingsPayload {
  eatInEnabled: boolean;
  takeAwayEnabled: boolean;
  deliveryEnabled: boolean;
  askTableForEatIn: boolean;
  kioskIdleTimeoutSec: number;
  kioskResetDelaySec: number;
  showAllergens: boolean;
  showProductImages: boolean;
  ticketFooterText: string | null;
}

export interface OrderTypePayload {
  orderType: OrderTypeName;
  configured: boolean;
  isEnabled: boolean;
  salesAreaId: string | null;
  fixedTableNumber: number | null;
  tableRangeFrom: number | null;
  tableRangeTo: number | null;
  tablePart: string | null;
}

export interface SalesAreaPayload {
  untillId: string;
  number: number;
  name: string;
  tableRanges: TableRange[];
}

export interface SettingsWarning {
  code: string;
  /** error: the kiosk will not offer it, or unTill will refuse its orders. warning: works, not as meant. info. */
  severity: "error" | "warning" | "info";
  orderType?: OrderTypeName;
  message: string;
}

export interface SettingsResponse {
  settings: SettingsPayload;
  orderTypes: OrderTypePayload[];
  salesAreas: SalesAreaPayload[];
  warnings: SettingsWarning[];
}

export interface OrderTypePatch {
  orderType: OrderTypeName;
  isEnabled?: boolean;
  salesAreaId?: string;
  fixedTableNumber?: number | null;
  tableRangeFrom?: number | null;
  tableRangeTo?: number | null;
  tablePart?: string | null;
}

/** The three *Enabled flags are written by the server from each order type's
 *  own switch, so they are deliberately absent here. */
export type SettingsFieldsPatch = Partial<
  Omit<SettingsPayload, "eatInEnabled" | "takeAwayEnabled" | "deliveryEnabled">
>;

export interface SettingsPatch {
  settings?: SettingsFieldsPatch;
  orderTypes?: OrderTypePatch[];
}

export const getSettings = (slug: string) =>
  request<SettingsResponse>(`/restaurant/${slug}/settings`);

export const updateSettings = (slug: string, body: SettingsPatch) =>
  request<SettingsResponse>(`/restaurant/${slug}/settings`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
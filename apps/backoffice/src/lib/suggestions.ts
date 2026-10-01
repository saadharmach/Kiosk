import { request } from "./api";

export interface SuggestionItem {
  articleId: string;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  /** False when unTill has retired or removed the product: it is not offered until it comes back. */
  available: boolean;
}

export interface DepartmentSuggestions {
  departmentId: string;
  posName: string;
  name: string;
  suggestions: SuggestionItem[];
}

/** A department holds at most this many; the kiosk shows four at a time. */
export const MAX_SUGGESTIONS = 12;

export const listSuggestions = (slug: string) =>
  request<{ departments: DepartmentSuggestions[] }>(`/restaurant/${slug}/suggestions`);

export const saveSuggestions = (slug: string, departmentId: string, articleIds: string[]) =>
  request<{ articleIds: string[] }>(`/restaurant/${slug}/suggestions/${departmentId}`, {
    method: "PUT",
    body: JSON.stringify({ articleIds }),
  });

/** Moves the item at `from` by `by` places (−1 up, +1 down); out of range leaves the list as it is. */
export function moved<T>(list: T[], from: number, by: number): T[] {
  const to = from + by;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * GA4 Enhanced Ecommerce 이벤트 헬퍼.
 *
 * gtag 가 로드 안 됐어도 안전 — typeof 가드.
 * 단가/수량 등은 KRW 기준.
 */
type GtagFn = (...args: unknown[]) => void;

function gtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { gtag?: GtagFn };
  return w.gtag ?? null;
}

interface EcomItem {
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
  item_category?: string;
  item_brand?: string;
}

export function gaViewItem(item: EcomItem): void {
  const g = gtag();
  if (!g) return;
  g("event", "view_item", {
    currency: "KRW",
    value: item.price ?? 0,
    items: [item],
  });
}

export function gaAddToCart(item: EcomItem): void {
  const g = gtag();
  if (!g) return;
  g("event", "add_to_cart", {
    currency: "KRW",
    value: (item.price ?? 0) * (item.quantity ?? 1),
    items: [item],
  });
}

export function gaBeginCheckout(items: EcomItem[], totalValue: number): void {
  const g = gtag();
  if (!g) return;
  g("event", "begin_checkout", {
    currency: "KRW",
    value: totalValue,
    items,
  });
}

export function gaPurchase(params: {
  transaction_id: string;
  value: number;
  shipping?: number;
  tax?: number;
  coupon?: string;
  items?: EcomItem[];
}): void {
  const g = gtag();
  if (!g) return;

  const { items, ...purchase } = params;
  const payload: Record<string, unknown> = {
    currency: "KRW",
    ...purchase,
  };
  if (items && items.length > 0) {
    payload.items = items;
  }
  g("event", "purchase", payload);
}

function normalizeSearchTerm(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function isSensitiveSearchTerm(query: string): boolean {
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(query)) return true;
  const digits = query.replace(/\D/g, "");
  return digits.length >= 7;
}

export function gaSearch(query: string): void {
  const searchTerm = normalizeSearchTerm(query);
  if (Array.from(searchTerm).length < 2 || isSensitiveSearchTerm(searchTerm)) return;

  const g = gtag();
  if (!g) return;
  g("event", "search", { search_term: searchTerm });
}

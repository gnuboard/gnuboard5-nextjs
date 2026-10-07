import type { ShopCartItem } from "@/lib/api";
import { getShopCartShippingPaymentLabel } from "@/lib/shop-shipping-label";
import { formatCartOption, formatPrice } from "@/lib/utils";

/**
 * 장바구니 화면의 한 칸 — 영카트 cart.php 처럼 같은 상품의 줄(선택옵션 · 추가옵션)을 묶는다.
 * 숫자는 cart.php 의 상품별 합계와 같다: 총수량 Σ수량, 판매가 = 담을 때의 상품 가격,
 * 포인트 Σ(줄 포인트 × 수량), 소계 Σ줄 금액(쿠폰 할인 전).
 */
export interface CartGroup {
  itId: string;
  /** 이름 · 그림 · 링크에 쓰는 대표 줄(첫 줄). */
  item: ShopCartItem;
  /** 본품 줄 먼저, 그다음 담은 순서(cart.php 의 옵션 목록 순서). */
  lines: ShopCartItem[];
  ctIds: string[];
  totalQty: number;
  salePrice: number;
  point: number;
  subtotal: number;
  couponDiscount: number;
  shippingLabel: "선불" | "착불" | "무료";
}

function lineTotal(line: ShopCartItem): number {
  return typeof line.line_total === "number" ? line.line_total : line.ct_price * line.ct_qty;
}

function byLineOrder(a: ShopCartItem, b: ShopCartItem): number {
  const typeDiff = Number(a.io_type ?? 0) - Number(b.io_type ?? 0);
  return typeDiff !== 0 ? typeDiff : Number(a.ct_id) - Number(b.ct_id);
}

function firstCtId(lines: ShopCartItem[]): number {
  return Math.min(...lines.map((line) => Number(line.ct_id)));
}

export function groupCartItems(items: ShopCartItem[]): CartGroup[] {
  const linesByItem = new Map<string, ShopCartItem[]>();
  for (const item of items) {
    linesByItem.set(item.it_id, [...(linesByItem.get(item.it_id) ?? []), item]);
  }

  return Array.from(linesByItem.entries())
    .map(([itId, unsorted]) => ({ itId, unsorted, first: firstCtId(unsorted) }))
    .sort((a, b) => a.first - b.first)
    .map(({ itId, unsorted }) => {
      const lines = [...unsorted].sort(byLineOrder);
      const item = lines[0];
      return {
        itId,
        item,
        lines,
        ctIds: lines.map((line) => line.ct_id),
        totalQty: lines.reduce((sum, line) => sum + line.ct_qty, 0),
        salePrice: item.ct_base_price ?? item.it_basic_price,
        point: lines.reduce((sum, line) => sum + (line.ct_point ?? 0) * line.ct_qty, 0),
        subtotal: lines.reduce((sum, line) => sum + lineTotal(line), 0),
        couponDiscount: lines.reduce((sum, line) => sum + (line.cp_price ?? 0), 0),
        shippingLabel: getShopCartShippingPaymentLabel(item, items),
      };
    });
}

/** cart.php 의 옵션 줄 — "옵션 수량개 (+옵션금액)". 옵션 없는 줄은 영카트가 상품명을 옵션 자리에 담으므로 상품명. */
export function formatCartLineOption(line: ShopCartItem): string {
  const label = formatCartOption(line.ct_option) || line.it_name;
  const ioPrice = Number(line.io_price ?? 0);
  return `${label} ${line.ct_qty}개 (${ioPrice >= 0 ? "+" : ""}${formatPrice(ioPrice)})`;
}

export function selectedGroupCtIds(groups: CartGroup[], selected: ReadonlySet<string>): string[] {
  return groups.filter((group) => selected.has(group.itId)).flatMap((group) => group.ctIds);
}

/**
 * 주문하기 — 모두 골랐으면 그냥 주문서(장바구니 전체 · 다른 기기에 담은 것도 모은다), 일부만 골랐으면 그 줄만
 * (주문서가 ct_ids 로 받는다). 아무것도 안 골랐으면 빈 글자.
 */
export function cartOrderHref(groups: CartGroup[], selected: ReadonlySet<string>): string {
  const ctIds = selectedGroupCtIds(groups, selected);
  if (ctIds.length === 0) return "";
  const allCount = groups.reduce((sum, group) => sum + group.ctIds.length, 0);
  if (ctIds.length === allCount) return "/shop/order";
  return `/shop/order?ct_ids=${encodeURIComponent(ctIds.join(","))}`;
}

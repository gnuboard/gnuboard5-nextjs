/**
 * 선택사항수정 창(영카트 cartoption.php 자리)이 서버에 보내기 전에 보는 것.
 * 고친 뒤의 목록은 한 번에 보내고(POST /shop/cart/options), 서버가 고친 뒤의 모습(최소 · 최대 구매수량 합계 · 재고 ·
 * 본품)을 먼저 다 검사한 뒤 달라진 줄만 고친다(api/v1/shop/cart_option_replace.php). 여기서는 바로 알 수 있는 것만 본다 —
 * 본품(선택옵션)이 하나는 있는가, 담긴 것과 달라졌는가(그대로면 보내지 않는다).
 */

export interface CartOptionLineRef {
  ct_id: string;
  io_id: string;
  io_type: number;
  ct_qty: number;
}

export interface DesiredCartOption {
  io_id: string;
  ioType: number;
  qty: number;
}

const NO_BASE_OPTION = "선택옵션을 하나 이상 선택해 주십시오.";

function optionKey(ioType: number, ioId: string): string {
  return `${ioType === 1 ? 1 : 0}:${ioId}`;
}

/** 옵션마다 수량 합 — 같은 옵션은 합치고 수량 0 은 뺀다(서버와 같은 정리). */
function totalsByOption(entries: Array<{ ioId: string; ioType: number; qty: number }>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.qty < 1) continue;
    const key = optionKey(entry.ioType, entry.ioId);
    totals.set(key, (totals.get(key) ?? 0) + entry.qty);
  }
  return totals;
}

/** 고친 뒤에 본품(선택옵션)이 하나도 없으면 그 안내, 있으면 빈 글자. */
export function cartOptionsError(desired: DesiredCartOption[]): string {
  return desired.some((option) => option.ioType !== 1 && option.qty > 0) ? "" : NO_BASE_OPTION;
}

/** 고친 뒤의 목록이 지금 담긴 것과 같은가 — 같으면 보낼 것이 없다. */
export function isSameAsCart(lines: CartOptionLineRef[], desired: DesiredCartOption[]): boolean {
  const now = totalsByOption(lines.map((line) => ({ ioId: line.io_id, ioType: line.io_type, qty: line.ct_qty })));
  const next = totalsByOption(desired.map((option) => ({ ioId: option.io_id, ioType: option.ioType, qty: option.qty })));
  if (now.size !== next.size) return false;
  for (const [key, qty] of next) {
    if (now.get(key) !== qty) return false;
  }
  return true;
}

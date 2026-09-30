export interface ShopShippingLabelItem {
  it_id?: string;
  ct_send_cost?: number;
  it_sc_type?: number;
  it_sc_minimum?: number;
  ct_price?: number;
  ct_qty?: number;
  io_type?: number;
  io_price?: number;
  line_total?: number;
}

function lineTotal(item: ShopShippingLabelItem): number {
  if (typeof item.line_total === "number") {
    return Math.max(0, item.line_total);
  }

  const qty = Math.max(0, Number(item.ct_qty || 0));
  const optionPrice = Number(item.io_price || 0);
  const unit =
    Number(item.io_type || 0) === 1
      ? optionPrice
      : Number(item.ct_price || 0) + optionPrice;

  return Math.max(0, unit * qty);
}

function groupedLineTotal(
  item: ShopShippingLabelItem,
  items: ShopShippingLabelItem[]
): number {
  const itId = String(item.it_id || "");
  if (!itId) {
    return lineTotal(item);
  }

  const peers = items.filter((peer) => String(peer.it_id || "") === itId);
  if (peers.length === 0) {
    return lineTotal(item);
  }

  return peers.reduce((sum, peer) => sum + lineTotal(peer), 0);
}

export function getShopCartShippingPaymentLabel(
  item: ShopShippingLabelItem,
  items: ShopShippingLabelItem[] = [item]
): "선불" | "착불" | "무료" {
  const sendCost = Number(item.ct_send_cost ?? 0);
  const scType = Number(item.it_sc_type ?? 0);

  if (scType === 1 || sendCost === 2) {
    return "무료";
  }

  if (scType === 2) {
    const minimum = Number(item.it_sc_minimum ?? 0);
    if (minimum <= 0 || groupedLineTotal(item, items) >= minimum) {
      return "무료";
    }
  }

  if (sendCost === 1) {
    return "착불";
  }

  return "선불";
}

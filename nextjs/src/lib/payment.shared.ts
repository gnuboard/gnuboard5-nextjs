import { api } from "@/lib/api";
import { apiBaseUrlForRuntime } from "@/lib/config";
import type { PreparedOrder, PaymentRequest } from "./payment.types";

export type PaymentResultPayload =
  | { status: "success"; orderId: string }
  | { status: "error" | "cancelled"; message?: string };

/**
 * Detect mobile device
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function normalizePaymentAmount(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

export function paymentTaxAmounts(order: PreparedOrder) {
  const enabled = normalizePaymentAmount(order.tax_flag) > 0;
  const tax = enabled ? normalizePaymentAmount(order.comm_tax_mny) : 0;
  const vat = enabled ? normalizePaymentAmount(order.comm_vat_mny) : 0;
  const free = enabled ? normalizePaymentAmount(order.comm_free_mny) : 0;

  return {
    enabled,
    tax,
    vat,
    free,
    supply: tax + free,
  };
}

export function urlOrigin(value?: string) {
  if (!value) return "";
  try {
    return new URL(value, window.location.origin).origin;
  } catch {
    return "";
  }
}

export function paymentMessageOrigins(...urls: Array<string | undefined>) {
  const origins = new Set<string>([window.location.origin]);
  const apiOrigin = urlOrigin(apiBaseUrlForRuntime());
  if (apiOrigin) origins.add(apiOrigin);
  urls.forEach((url) => {
    const origin = urlOrigin(url);
    if (origin) origins.add(origin);
  });
  return origins;
}

export function postPaymentResult(payload: PaymentResultPayload) {
  window.postMessage(
    {
      type: "shop-payment-result",
      ...payload,
    },
    window.location.origin
  );
}

export async function cancelPreparedPayment(req: PaymentRequest, reason: string) {
  try {
    await api.post("/shop/payment/cancel", {
      order_id: req.order.order_id,
      reason,
    });
  } catch {
    // The next cart read also repairs pending direct-buy rows by ct_ids.
  }
}

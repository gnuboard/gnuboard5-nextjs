/**
 * Shop Payment Gateway dispatcher
 *
 * Supports: toss, inicis, kakaopay, kcp, nicepay
 *
 * Each PG has its own JS SDK or browser flow. This module provides a unified
 * `requestPayment()` function that delegates to the right PG implementation
 * based on `pg_service`. PC vs Mobile is handled internally by each PG SDK.
 */

import { requestInicisPayment } from "./payment.inicis";
import { requestKcpInlinePayment } from "./payment.kcp";
import { requestNicepayPayment } from "./payment.nicepay";
import { requestTossPayment } from "./payment.toss";
import type { PaymentRequest } from "./payment.types";

export { isMobileDevice } from "./payment.shared";

// Re-exported so existing `@/lib/payment` consumers keep their imports.
export type {
  PgService,
  PaymentMethod,
  InicisExtra,
  KcpExtra,
  NicepayExtra,
  PreparedOrder,
  PaymentRequest,
} from "./payment.types";

/**
 * Main entry point: dispatch payment request to the right PG implementation
 */
export async function requestPayment(req: PaymentRequest): Promise<void> {
  switch (req.pg_service) {
    case "toss":
      return requestTossPayment(req);
    case "inicis":
      return requestInicisPayment(req);
    case "kakaopay":
      return requestInicisPayment({
        ...req,
        method: "kakaopay",
        order: {
          ...req.order,
          pg_extra: {
            ...req.order.pg_extra,
            inicis: req.order.pg_extra?.inicis
              ? {
                  ...req.order.pg_extra.inicis,
                  direct_method: "kakaopay",
                }
              : req.order.pg_extra?.inicis,
          },
        },
      });
    case "kcp":
      return requestKcpInlinePayment(req);
    case "nicepay":
      return requestNicepayPayment(req);
    default:
      throw new Error("지원하지 않는 결제 수단입니다: " + req.pg_service);
  }
}

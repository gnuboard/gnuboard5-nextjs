import { expect, test } from "@playwright/test";
import type { PaymentRequest, PreparedOrder } from "../src/lib/payment.types";
import {
  TOSS_CANCELLED_MESSAGE,
  TOSS_FALLBACK_ERROR_MESSAGE,
  createTossCommonPaymentRequest,
  normalizeTossError,
  tossCustomerKey,
} from "../src/lib/payment.toss";

function paymentRequest(orderOverrides: Partial<PreparedOrder> = {}): PaymentRequest {
  return {
    pg_service: "toss",
    client_key: "client-key",
    method: "card",
    order: {
      order_id: "order-1",
      order_name: "Test order",
      amount: 10000,
      buyer_name: "Buyer",
      buyer_email: "buyer+shop@example.com",
      buyer_tel: "010-1234-5678",
      ...orderOverrides,
    },
    success_url: "https://shop.example.com/payment/success",
    fail_url: "https://shop.example.com/payment/fail",
  };
}

test.describe("Toss payment helpers", () => {
  test("builds non-PII Toss customer keys within Toss length limits", () => {
    expect(tossCustomerKey("order-1", "550e8400-e29b-41d4-a716-446655440000")).toBe(
      "customer-550e8400-e29b-41d4-a716-446655440000"
    );
    expect(tossCustomerKey("order+unsafe@example.com", "")).toBe(
      "customer-order_unsafe_example.com"
    );
    expect(tossCustomerKey("", "")).toBe("customer-anonymous");
    expect(tossCustomerKey("a".repeat(100), "")).toHaveLength(50);
  });

  test("builds common Toss payment request fields", () => {
    expect(createTossCommonPaymentRequest(paymentRequest())).toEqual({
      amount: { currency: "KRW", value: 10000 },
      orderId: "order-1",
      orderName: "Test order",
      successUrl: "https://shop.example.com/payment/success?pg=toss",
      failUrl: "https://shop.example.com/payment/fail",
      customerEmail: "buyer+shop@example.com",
      customerName: "Buyer",
      customerMobilePhone: "01012345678",
      taxFreeAmount: 0,
    });
  });

  test("includes tax-free amount only when tax flag is enabled", () => {
    expect(
      createTossCommonPaymentRequest(
        paymentRequest({
          tax_flag: 1,
          comm_tax_mny: 7000,
          comm_vat_mny: 700,
          comm_free_mny: 3000,
        })
      ).taxFreeAmount
    ).toBe(3000);

    expect(
      createTossCommonPaymentRequest(
        paymentRequest({
          tax_flag: 0,
          comm_free_mny: 3000,
        })
      ).taxFreeAmount
    ).toBe(0);
  });

  test("normalizes Toss cancellation errors from code or message", () => {
    expect(normalizeTossError({ code: "USER_CANCEL" })).toEqual({
      cancelled: true,
      message: TOSS_CANCELLED_MESSAGE,
    });
    expect(
      normalizeTossError({
        errorCode: "PAY_PROCESS_CANCELED",
        errorMessage: "user closed the payment window",
      })
    ).toEqual({
      cancelled: true,
      message: "user closed the payment window",
    });
    expect(normalizeTossError({ message: "사용자가 결제를 취소했습니다." })).toEqual({
      cancelled: true,
      message: "사용자가 결제를 취소했습니다.",
    });
  });

  test("normalizes Toss failure messages with fallbacks", () => {
    expect(normalizeTossError(new Error("network failed"))).toEqual({
      cancelled: false,
      message: "network failed",
    });
    expect(normalizeTossError({ errorMessage: "authorization failed" })).toEqual({
      cancelled: false,
      message: "authorization failed",
    });
    expect(normalizeTossError({})).toEqual({
      cancelled: false,
      message: TOSS_FALLBACK_ERROR_MESSAGE,
    });
  });
});

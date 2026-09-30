import { expect, test } from "@playwright/test";
import {
  PAYMENT_FAIL_DEFAULT_MESSAGE,
  PAYMENT_REQUIRED_INFO_MESSAGE,
  parsePaymentFailParams,
  parsePaymentSuccessParams,
  paymentErrorHostPayload,
  paymentOrderDetailUrl,
  paymentSuccessHostPayload,
} from "../src/lib/payment-return";

test.describe("payment return helpers", () => {
  test("builds Toss confirm payloads from success query params", () => {
    const parsed = parsePaymentSuccessParams(
      new URLSearchParams(
        "pg=toss&orderId=order-1&amount=12000&paymentKey=pay-1&foo=bar"
      )
    );

    expect(parsed).toMatchObject({
      ok: true,
      pg: "toss",
      orderId: "order-1",
      amount: 12000,
      paymentKey: "pay-1",
      body: {
        pg_service: "toss",
        order_id: "order-1",
        amount: 12000,
        payment_key: "pay-1",
        pg: "toss",
        orderId: "order-1",
        paymentKey: "pay-1",
        foo: "bar",
      },
    });
  });

  test("keeps non-Toss payloads generic while passing through provider fields", () => {
    const parsed = parsePaymentSuccessParams(
      new URLSearchParams(
        "pg=kcp&orderId=order-2&amount=34000&tno=tx-1&res_cd=0000"
      )
    );

    expect(parsed).toMatchObject({
      ok: true,
      pg: "kcp",
      orderId: "order-2",
      amount: 34000,
      paymentKey: "",
      body: {
        pg_service: "kcp",
        order_id: "order-2",
        amount: 34000,
        pg: "kcp",
        orderId: "order-2",
        tno: "tx-1",
        res_cd: "0000",
      },
    });
    expect(parsed.ok && parsed.body.payment_key).toBeUndefined();
  });

  test("rejects missing order id or malformed amount with the existing message", () => {
    expect(parsePaymentSuccessParams(new URLSearchParams("amount=12000"))).toEqual(
      {
        ok: false,
        message: PAYMENT_REQUIRED_INFO_MESSAGE,
      }
    );
    expect(
      parsePaymentSuccessParams(new URLSearchParams("orderId=order-1&amount=abc"))
    ).toEqual({
      ok: false,
      message: PAYMENT_REQUIRED_INFO_MESSAGE,
    });
  });

  test("accepts zero-amount payment callbacks", () => {
    expect(
      parsePaymentSuccessParams(new URLSearchParams("orderId=order-1&amount=0"))
    ).toMatchObject({
      ok: true,
      orderId: "order-1",
      amount: 0,
      body: {
        order_id: "order-1",
        amount: 0,
      },
    });
  });

  test("builds order detail URLs with an encoded uid", () => {
    expect(paymentOrderDetailUrl("order-1")).toBe("/shop/orders/order-1");
    expect(paymentOrderDetailUrl("order-1", "uid value/1")).toBe(
      "/shop/orders/order-1?uid=uid%20value%2F1"
    );
  });

  test("builds host result payloads", () => {
    expect(paymentSuccessHostPayload("order-1", "uid-1")).toEqual({
      status: "success",
      orderId: "order-1",
      uid: "uid-1",
    });
    expect(paymentSuccessHostPayload("order-1")).toEqual({
      status: "success",
      orderId: "order-1",
      uid: "",
    });
    expect(paymentErrorHostPayload("failed")).toEqual({
      status: "error",
      message: "failed",
    });
  });

  test("parses failure query params with the existing fallback message", () => {
    expect(
      parsePaymentFailParams(
        new URLSearchParams("code=USER_CANCEL&message=cancelled")
      )
    ).toEqual({
      code: "USER_CANCEL",
      message: "cancelled",
    });

    expect(parsePaymentFailParams(new URLSearchParams(""))).toEqual({
      code: "",
      message: PAYMENT_FAIL_DEFAULT_MESSAGE,
    });
  });
});

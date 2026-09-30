import { expect, test } from "@playwright/test";
import { easyPayOptions, withEasyPayService } from "../src/app/shop/order/orderPaymentHelpers";

const ALL_SERVICES = [
  "nhnkcp_payco",
  "nhnkcp_naverpay",
  "nhnkcp_kakaopay",
  "used_nhnkcp_naverpay_point",
  "nicepay_samsungpay",
  "nicepay_naverpay",
  "nicepay_lpay",
];

test.describe("easy-pay service options", () => {
  test("lists only the active PG's enabled services, in the server's default order", () => {
    expect(easyPayOptions({ pg_service: "kcp", easy_pay_services: ALL_SERVICES }).map((o) => o.service)).toEqual([
      "nhnkcp_naverpay",
      "nhnkcp_kakaopay",
      "nhnkcp_payco",
    ]);
    expect(easyPayOptions({ pg_service: "nicepay", easy_pay_services: ALL_SERVICES }).map((o) => o.service)).toEqual([
      "nicepay_naverpay",
      "nicepay_samsungpay",
      "nicepay_lpay",
    ]);
  });

  test("offers no per-service tiles for PGs that pick the service in their own window", () => {
    expect(easyPayOptions({ pg_service: "toss", easy_pay_services: ALL_SERVICES })).toEqual([]);
    expect(easyPayOptions({ pg_service: "inicis", easy_pay_services: ALL_SERVICES })).toEqual([]);
    expect(easyPayOptions(null)).toEqual([]);
  });

  test("overrides the PG extra only with a service the server enabled", () => {
    const extra = { kcp: { easy_pay_services: ["nhnkcp_naverpay", "nhnkcp_payco"], easy_pay_service: "nhnkcp_naverpay" } };
    expect(withEasyPayService(extra, "nhnkcp_payco")?.kcp?.easy_pay_service).toBe("nhnkcp_payco");
    expect(withEasyPayService(extra, "nicepay_lpay")?.kcp?.easy_pay_service).toBe("nhnkcp_naverpay");
    expect(withEasyPayService(extra, "")).toBe(extra);
    expect(withEasyPayService(undefined, "nhnkcp_payco")).toBeUndefined();
  });
});

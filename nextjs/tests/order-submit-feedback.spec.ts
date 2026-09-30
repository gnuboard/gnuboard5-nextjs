import { expect, test } from "@playwright/test";
import {
  PAYMENT_PREPARING_NOTICE,
  getCreatedOrderPath,
  getPaymentProgressNotice,
  isPaymentCancelMessage,
} from "../src/app/shop/order/orderSubmitFeedback";

test.describe("order submit feedback", () => {
  test("builds order detail paths from nested or flat order responses", () => {
    expect(
      getCreatedOrderPath({
        order: { od_id: "202606100001", uid: "uid with space" },
      })
    ).toBe("/shop/orders/202606100001?uid=uid%20with%20space");

    expect(
      getCreatedOrderPath({
        od_id: "202606100002",
        uid: "guest/uid",
      })
    ).toBe("/shop/orders/202606100002?uid=guest%2Fuid");

    expect(getCreatedOrderPath({ order: { od_id: "202606100003" } })).toBe(
      "/shop/orders/202606100003"
    );
  });

  test("rejects missing order ids instead of building a broken path", () => {
    expect(() => getCreatedOrderPath(undefined)).toThrow(/주문번호/);
    expect(() => getCreatedOrderPath({})).toThrow(/주문번호/);
  });

  test("keeps payment notices in an informational shape", () => {
    expect(PAYMENT_PREPARING_NOTICE.tone).toBe("info");
    expect(PAYMENT_PREPARING_NOTICE.title.length).toBeGreaterThan(0);
    expect(PAYMENT_PREPARING_NOTICE.message.length).toBeGreaterThan(0);

    const kcp = getPaymentProgressNotice("kcp");
    const kakaopay = getPaymentProgressNotice("kakaopay");
    const inicis = getPaymentProgressNotice("inicis");

    expect(kcp.tone).toBe("info");
    expect(kakaopay.tone).toBe("info");
    expect(inicis.tone).toBe("info");
    expect(kcp.title).not.toBe(kakaopay.title);
    expect(inicis.title).not.toBe(kcp.title);
    expect(inicis.title).not.toBe(kakaopay.title);
  });

  test("detects payment cancellation messages by their Korean keyword", () => {
    const cancelKeyword = "취소";

    expect(isPaymentCancelMessage(`payment ${cancelKeyword}`)).toBe(true);
    expect(isPaymentCancelMessage("payment failed")).toBe(false);
  });
});

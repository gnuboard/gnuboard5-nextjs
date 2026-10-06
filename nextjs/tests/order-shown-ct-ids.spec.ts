import { expect, test } from "@playwright/test";
import {
  MAX_ORDER_CT_IDS,
  buildCartRequestOptions,
  buildShippingQuoteParams,
  shownOrderCtIds,
} from "../src/app/shop/order/orderDataHelpers";
import { isCartChangedError } from "../src/app/shop/order/orderSubmitFeedback";

/*
 * 주문서는 보여 준 줄만 주문한다 — 불러온 줄의 번호를 주문 · 결제 준비 · 배송비 견적에 보낸다(주소에 ct_ids 가 없는
 * 장바구니의 "주문하기"도). 주문서를 띄운 뒤 다른 탭 · 기기에서 장바구니가 바뀌어도 본 것과 다른 주문이 생기지 않게.
 * (그 번호가 주문 본문에 실리는 것은 order-submit.spec.ts 가 본다.)
 */

const rows = (...ids: Array<string | number>) => ids.map((ct_id) => ({ ct_id }));

test.describe("order form sends the rows it showed", () => {
  test("uses the loaded rows when the address has no ct_ids", () => {
    expect(shownOrderCtIds("", rows("31", "29", 30))).toBe("31,29,30");
  });

  test("after a reload only the rows still there are sent, also for a selected order", () => {
    expect(shownOrderCtIds("10,11,12", rows("10", "12"))).toBe("10,12");
  });

  test("before the rows load, keeps the address ct_ids (or nothing)", () => {
    expect(shownOrderCtIds("10,11", [])).toBe("10,11");
    expect(shownOrderCtIds("", [])).toBe("");
  });

  test("falls back to the old request when the server would cut the list", () => {
    const many = rows(...Array.from({ length: MAX_ORDER_CT_IDS + 1 }, (_, index) => index + 1));
    expect(shownOrderCtIds("", many)).toBe("");
    expect(shownOrderCtIds("1,2", many)).toBe("1,2");
    expect(shownOrderCtIds("", many.slice(0, MAX_ORDER_CT_IDS)).split(",")).toHaveLength(MAX_ORDER_CT_IDS);
  });

  test("the whole-cart order form gathers the member's rows; selected or buy-now forms do not", () => {
    expect(buildCartRequestOptions(false, "")).toEqual({ params: { gather: 1 } });
    expect(buildCartRequestOptions(false, "10,11")).toEqual({ params: { ct_ids: "10,11" } });
    expect(buildCartRequestOptions(true, "")).toEqual({ params: { direct: 1 } });
  });

  test("the shipping quote asks for the same rows", () => {
    const ctIds = shownOrderCtIds("", rows("7", "8"));
    expect(buildShippingQuoteParams({ shippingZip: "12345", directCheckout: false, directCtIds: ctIds })).toEqual({
      zip1: "123",
      zip2: "45",
      ct_ids: "7,8",
    });
  });

  test("recognises the server's cart-changed stop by its code only", () => {
    expect(isCartChangedError(Object.assign(new Error("장바구니가 바뀌었습니다."), { code: "CART_CHANGED" }))).toBe(true);
    expect(isCartChangedError(new Error("장바구니가 바뀌었습니다."))).toBe(false);
    expect(isCartChangedError({ code: "CART_CHANGED" })).toBe(false);
  });
});

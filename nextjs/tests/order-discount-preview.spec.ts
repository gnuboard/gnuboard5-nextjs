import { expect, test } from "@playwright/test";
import type { ShopCartItem, ShopPolicy } from "../src/lib/api";
import { orderCouponChoices, sendCouponChoices } from "../src/app/shop/order/orderCouponChoices";
import { buildCouponPreview } from "../src/app/shop/order/orderCouponPreview";
import { buildOrderDiscountPreview } from "../src/app/shop/order/orderDiscountPreview";
import { calculatePointUsage } from "../src/app/shop/order/orderPointUsage";
import {
  calculateCouponDiscount,
  type MyCoupon,
} from "../src/app/shop/order/orderPricingHelpers";

function cartItem(overrides: Partial<ShopCartItem> = {}): ShopCartItem {
  return {
    ct_id: "1",
    it_id: "item-1",
    it_name: "Test item",
    ct_price: 1000,
    ct_qty: 1,
    ct_option: "",
    line_total: 1000,
    it_basic_price: 1000,
    it_stock_qty: 99,
    it_soldout: "0",
    image_url: "",
    ...overrides,
  };
}

function policy(overrides: Partial<ShopPolicy> = {}): ShopPolicy {
  return {
    delivery_company: "",
    send_cost_case: "",
    send_cost_limit: "",
    send_cost_list: "",
    shipping_rules: [],
    base_shipping_cost: 3000,
    free_threshold: 50000,
    delivery_content: "",
    delivery_content_text: "",
    exchange_content: "",
    exchange_content_text: "",
    point_use_enabled: true,
    settle_min_point: 0,
    settle_max_point: 5000,
    settle_point_unit: 100,
    ...overrides,
  };
}

function coupon(overrides: Partial<MyCoupon> = {}): MyCoupon {
  return {
    cp_id: "coupon-1",
    cp_subject: "Test coupon",
    cp_method: 2,
    cp_type: 0,
    cp_price: 0,
    cp_minimum: 0,
    cp_maximum: 0,
    cp_trunc: 0,
    cp_start: "",
    cp_end: "",
    ...overrides,
  };
}

test.describe("order discount preview", () => {
  test("calculates coupon, point, and total amounts in order", () => {
    const preview = buildOrderDiscountPreview({
      items: [
        cartItem({
          ct_id: "1",
          ct_price: 10000,
          ct_qty: 2,
          line_total: 20000,
          cp_price: 1000,
        }),
        cartItem({
          ct_id: "2",
          ct_price: 5000,
          ct_qty: 1,
          line_total: 5000,
        }),
      ],
      shippingPolicy: policy(),
      cartShippingCost: null,
      myCoupons: [
        coupon({
          cp_id: "order",
          cp_method: 2,
          cp_type: 1,
          cp_price: 10,
          cp_minimum: 10000,
          cp_maximum: 1500,
          cp_trunc: 100,
        }),
        coupon({
          cp_id: "shipping",
          cp_method: 3,
          cp_type: 0,
          cp_price: 2000,
          cp_minimum: 20000,
        }),
      ],
      selectedCouponId: "order",
      selectedSendCouponId: "shipping",
      pointUseInput: "800",
      pointBalance: 1000,
    });

    expect(preview.subtotal).toBe(25000);
    expect(preview.shippingCost).toBe(3000);
    expect(preview.cartCoupon).toBe(1000);
    expect(preview.orderCouponBase).toBe(24000);
    expect(preview.couponDiscount).toBe(1500);
    expect(preview.orderAmountAfterCoupons).toBe(22500);
    expect(preview.sendCouponDiscount).toBe(2000);
    expect(preview.pointUse).toBe(800);
    expect(preview.total).toBe(22700);
  });

  test("separates order and shipping coupons before applying selected coupons", () => {
    const orderCoupon = coupon({
      cp_id: "order",
      cp_method: 2,
      cp_price: 5000,
    });
    const shippingCoupon = coupon({
      cp_id: "shipping",
      cp_method: 3,
      cp_price: 2000,
      cp_minimum: 6000,
    });

    const preview = buildCouponPreview({
      myCoupons: [orderCoupon, shippingCoupon, coupon({ cp_method: 0 })],
      selectedCouponId: "order",
      selectedSendCouponId: "shipping",
      orderCouponBase: 12000,
      shippingCost: 1500,
    });

    expect(preview.orderCoupons).toEqual([orderCoupon]);
    expect(preview.sendCoupons).toEqual([shippingCoupon]);
    expect(preview.selectedCoupon).toBe(orderCoupon);
    expect(preview.selectedSendCoupon).toBe(shippingCoupon);
    expect(preview.couponDiscount).toBe(5000);
    expect(preview.orderAmountAfterCoupons).toBe(7000);
    expect(preview.sendCouponDiscount).toBe(1500);
  });

  test("caps percentage coupons with truncation and discount base limits", () => {
    const percentCoupon = coupon({
      cp_type: 1,
      cp_price: 15,
      cp_minimum: 10000,
      cp_maximum: 1800,
      cp_trunc: 100,
    });

    expect(calculateCouponDiscount(percentCoupon, 12345)).toBe(1800);
    expect(calculateCouponDiscount(percentCoupon, 9999)).toBe(0);
    expect(calculateCouponDiscount(coupon({ cp_price: 10000 }), 5000)).toBe(
      5000
    );
  });

  test("clamps point usage to balance, max policy, order amount, and unit", () => {
    const usage = calculatePointUsage({
      pointUseInput: "3999",
      pointBalance: 5000,
      shippingPolicy: policy({
        settle_min_point: 1000,
        settle_max_point: 5000,
        settle_point_unit: 100,
      }),
      orderAmountAfterCoupons: 3750,
    });

    expect(usage.settlePointUnit).toBe(100);
    expect(usage.maxPointUse).toBe(3700);
    expect(usage.pointUse).toBe(3700);
    expect(usage.normalizedPointUseInput).toBe("3700");

    const unitRounded = calculatePointUsage({
      pointUseInput: "3650",
      pointBalance: 5000,
      shippingPolicy: policy({ settle_point_unit: 100 }),
      orderAmountAfterCoupons: 5000,
    });

    expect(unitRounded.pointUse).toBe(3600);
    expect(unitRounded.normalizedPointUseInput).toBe("3600");

    const disabled = calculatePointUsage({
      pointUseInput: "100",
      pointBalance: 5000,
      shippingPolicy: policy({ point_use_enabled: false }),
      orderAmountAfterCoupons: 1000,
    });

    expect(disabled.maxPointUse).toBe(0);
    expect(disabled.pointUse).toBe(0);
    expect(disabled.normalizedPointUseInput).toBe("0");
    expect(disabled.pointWarn.length).toBeGreaterThan(0);
  });

  test("lists order coupons like YoungCart ordercoupon.php — minimum and over-discount are blocked", () => {
    const choices = orderCouponChoices(
      [
        coupon({ cp_id: "ok", cp_price: 1000 }),
        coupon({ cp_id: "min", cp_price: 1000, cp_minimum: 20000 }),
        coupon({ cp_id: "over", cp_price: 10000 }),
        coupon({ cp_id: "pct", cp_type: 1, cp_price: 10, cp_maximum: 500 }),
      ],
      10000
    );

    expect(choices.map((choice) => [choice.coupon.cp_id, choice.discount, choice.blockedReason === ""])).toEqual([
      ["ok", 1000, true],
      ["min", 0, false],
      ["over", 10000, false],
      ["pct", 500, true],
    ]);
    expect(orderCouponChoices([coupon()], 0)[0].blockedReason).not.toBe("");
  });

  test("lists send coupons against the amount after the order coupon and caps them at shipping", () => {
    const sendCoupon = coupon({ cp_id: "send", cp_method: 3, cp_price: 5000, cp_minimum: 9000 });

    expect(sendCouponChoices([sendCoupon], 9000, 3000)[0]).toMatchObject({ discount: 3000, blockedReason: "" });
    expect(sendCouponChoices([sendCoupon], 8000, 3000)[0].blockedReason).not.toBe("");
    expect(sendCouponChoices([sendCoupon], 9000, 0)[0].blockedReason).not.toBe("");
  });
});

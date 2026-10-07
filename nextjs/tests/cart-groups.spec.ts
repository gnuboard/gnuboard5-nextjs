import { expect, test } from "@playwright/test";
import type { ShopCartItem, ShopProduct, ShopProductOption } from "../src/lib/shop-types";
import {
  hasOnlySoldOutBaseOptions,
  isProductDetailSoldOut,
  isShopOptionPurchasable,
} from "../src/components/shop/productDetailHelpers";
import {
  cartOrderHref,
  formatCartLineOption,
  groupCartItems,
  selectedGroupCtIds,
} from "../src/app/shop/cart/cartGroups";
import { cartOptionsError, isSameAsCart } from "../src/app/shop/cart/cartOptionPlan";

/*
 * 장바구니 화면(영카트 cart.php 와 같은 모양) — 줄을 상품마다 한 칸으로 묶고, 고른 상품만 주문하고,
 * 선택사항수정 창에서 고친 것을 서버 요청(삭제 · 수량 · 추가)으로 바꾸는 규칙.
 */

function line(over: Partial<ShopCartItem> & Pick<ShopCartItem, "ct_id" | "it_id">): ShopCartItem {
  return {
    it_name: "상품",
    ct_price: 1000,
    ct_qty: 1,
    ct_option: "",
    io_type: 0,
    io_price: 0,
    line_total: 1000,
    it_basic_price: 1000,
    it_stock_qty: 10,
    it_soldout: "0",
    image_url: "",
    ...over,
  };
}

test.describe("groupCartItems (상품마다 한 칸)", () => {
  const items = [
    // API 는 최근 줄부터 준다(ct_id DESC). 영카트 cart.php 는 먼저 담은 상품부터 보인다.
    line({ ct_id: "30", it_id: "B", it_name: "셔츠", ct_option: "M\x1e블루", io_price: 1100, ct_base_price: 31000, line_total: 32100, ct_point: 10 }),
    line({ ct_id: "22", it_id: "A", it_name: "카메라", ct_option: "32기가", io_type: 1, io_price: 45000, ct_base_price: 690000, line_total: 45000, ct_point: 0 }),
    line({ ct_id: "21", it_id: "A", it_name: "카메라", ct_option: "화이트\x1e100", ct_qty: 2, io_price: 222, ct_base_price: 690000, line_total: 1380444, ct_point: 100, cp_price: 5000 }),
  ];

  test("같은 상품의 줄을 묶고, 먼저 담은 상품부터 · 본품 줄 먼저", () => {
    const groups = groupCartItems(items);
    expect(groups.map((group) => group.itId)).toEqual(["A", "B"]);
    expect(groups[0].lines.map((row) => row.ct_id)).toEqual(["21", "22"]);
    expect(groups[0].ctIds).toEqual(["21", "22"]);
  });

  test("총수량 · 판매가 · 포인트 · 소계 · 쿠폰 할인을 영카트처럼 센다", () => {
    const [camera, shirt] = groupCartItems(items);
    expect(camera.totalQty).toBe(3);
    expect(camera.salePrice).toBe(690000);
    expect(camera.point).toBe(200); // 줄 포인트 × 수량의 합
    expect(camera.subtotal).toBe(1425444);
    expect(camera.couponDiscount).toBe(5000);
    expect(shirt.salePrice).toBe(31000);
    expect(shirt.point).toBe(10);
    expect(shirt.shippingLabel).toBe("선불");
  });

  test("기본가가 없으면 상품 가격을 판매가로 쓴다", () => {
    const [group] = groupCartItems([line({ ct_id: "1", it_id: "C", it_basic_price: 7000 })]);
    expect(group.salePrice).toBe(7000);
    expect(group.point).toBe(0);
  });

  test("빈 장바구니는 빈 목록", () => {
    expect(groupCartItems([])).toEqual([]);
  });
});

test.describe("formatCartLineOption (옵션 줄 글자)", () => {
  test("옵션 · 수량 · 옵션 금액", () => {
    expect(formatCartLineOption(line({ ct_id: "1", it_id: "A", ct_option: "화이트\x1e100", ct_qty: 2, io_price: 222 }))).toBe("화이트 / 100 2개 (+222원)");
    expect(formatCartLineOption(line({ ct_id: "2", it_id: "A", ct_option: "할인", io_price: -500 }))).toBe("할인 1개 (-500원)");
  });

  test("옵션 없는 상품은 상품명을 옵션 자리에 쓴다(영카트가 그렇게 담는다)", () => {
    expect(formatCartLineOption(line({ ct_id: "3", it_id: "E", it_name: "E2E Sample Item" }))).toBe("E2E Sample Item 1개 (+0원)");
  });
});

test.describe("고른 상품만 주문", () => {
  const groups = groupCartItems([
    line({ ct_id: "11", it_id: "A" }),
    line({ ct_id: "12", it_id: "A", io_type: 1, ct_option: "추가" }),
    line({ ct_id: "13", it_id: "B" }),
  ]);

  test("고른 상품의 줄 번호를 모두 모은다", () => {
    expect(selectedGroupCtIds(groups, new Set(["A"]))).toEqual(["11", "12"]);
    expect(selectedGroupCtIds(groups, new Set(["B", "A"]))).toEqual(["11", "12", "13"]);
    expect(selectedGroupCtIds(groups, new Set())).toEqual([]);
  });

  test("모두 고르면 그냥 주문서, 일부면 그 줄만", () => {
    expect(cartOrderHref(groups, new Set(["A", "B"]))).toBe("/shop/order");
    expect(cartOrderHref(groups, new Set(["B"]))).toBe("/shop/order?ct_ids=13");
    expect(cartOrderHref(groups, new Set(["A"]))).toBe("/shop/order?ct_ids=11%2C12");
    expect(cartOrderHref(groups, new Set())).toBe("");
  });
});

test.describe("선택사항수정 — 보내기 전에 보는 것 (고친 뒤의 검사는 서버가 한다)", () => {
  const lines = [
    { ct_id: "1", io_id: "화이트", io_type: 0, ct_qty: 2 },
    { ct_id: "2", io_id: "32기가", io_type: 1, ct_qty: 1 },
  ];

  test("본품(선택옵션)이 하나도 없으면 안내", () => {
    expect(cartOptionsError([{ io_id: "32기가", ioType: 1, qty: 1 }])).toBe("선택옵션을 하나 이상 선택해 주십시오.");
    expect(cartOptionsError([{ io_id: "화이트", ioType: 0, qty: 0 }])).toBe("선택옵션을 하나 이상 선택해 주십시오.");
    expect(cartOptionsError([{ io_id: "", ioType: 0, qty: 1 }])).toBe("");
  });

  test("담긴 것과 같으면 보내지 않는다 — 순서 · 수량 0 · 나눠 담긴 같은 옵션은 상관없다", () => {
    expect(isSameAsCart(lines, [
      { io_id: "32기가", ioType: 1, qty: 1 },
      { io_id: "화이트", ioType: 0, qty: 2 },
      { io_id: "블랙", ioType: 0, qty: 0 },
    ])).toBe(true);
    expect(isSameAsCart([...lines, { ct_id: "3", io_id: "화이트", io_type: 0, ct_qty: 1 }], [
      { io_id: "화이트", ioType: 0, qty: 3 },
      { io_id: "32기가", ioType: 1, qty: 1 },
    ])).toBe(true);
  });

  test("수량 · 옵션 · 본품과 추가옵션의 구분이 다르면 바뀐 것", () => {
    expect(isSameAsCart(lines, [{ io_id: "화이트", ioType: 0, qty: 1 }, { io_id: "32기가", ioType: 1, qty: 1 }])).toBe(false);
    expect(isSameAsCart(lines, [{ io_id: "화이트", ioType: 0, qty: 2 }])).toBe(false);
    expect(isSameAsCart(lines, [{ io_id: "화이트", ioType: 0, qty: 2 }, { io_id: "32기가", ioType: 0, qty: 1 }])).toBe(false);
  });
});

test.describe("isShopOptionPurchasable (옵션 품절 — 영카트와 같다)", () => {
  const option = (over: Partial<ShopProductOption>): ShopProductOption =>
    ({ io_id: "화이트", io_type: "0", io_price: 0, io_stock_qty: 10, io_use: 1, ...over }) as ShopProductOption;

  test("재고가 1 이상이고 쓰는 옵션만 고를 수 있다", () => {
    expect(isShopOptionPurchasable(option({ io_stock_qty: 1 }))).toBe(true);
    expect(isShopOptionPurchasable(option({ io_stock_qty: 0 }))).toBe(false);
    expect(isShopOptionPurchasable(option({ io_stock_qty: -3 }))).toBe(false);
    expect(isShopOptionPurchasable(option({ io_use: 0 }))).toBe(false);
    expect(isShopOptionPurchasable(null)).toBe(false);
  });

  test("선택옵션이 모두 품절이면 상품이 품절 — 추가옵션 · 쓰지 않는 옵션은 세지 않는다", () => {
    expect(hasOnlySoldOutBaseOptions([option({ io_stock_qty: 0 }), option({ io_id: "블랙", io_stock_qty: 0 })])).toBe(true);
    expect(hasOnlySoldOutBaseOptions([option({ io_stock_qty: 0 }), option({ io_id: "블랙", io_stock_qty: 2 })])).toBe(false);
    expect(hasOnlySoldOutBaseOptions([option({ io_stock_qty: 0 }), option({ io_id: "추가", io_type: "1", io_stock_qty: 5 })])).toBe(true);
    expect(hasOnlySoldOutBaseOptions([option({ io_stock_qty: 0 }), option({ io_id: "숨김", io_use: 0, io_stock_qty: 5 })])).toBe(true);
    expect(hasOnlySoldOutBaseOptions([])).toBe(false);
    expect(hasOnlySoldOutBaseOptions(undefined)).toBe(false);
  });

  test("상품 상세의 품절 — 영카트 is_soldout() 처럼: 품절 표시, 선택옵션 모두 품절, 옵션 없는 상품은 재고 0 이하", () => {
    const product = (over: Partial<ShopProduct>): ShopProduct =>
      ({ it_id: "P1", it_name: "상품", it_price: 1000, it_soldout: "0", it_stock_qty: 5, options: [], ...over }) as ShopProduct;
    expect(isProductDetailSoldOut(product({}))).toBe(false);
    expect(isProductDetailSoldOut(product({ it_soldout: "1" }))).toBe(true);
    expect(isProductDetailSoldOut(product({ it_stock_qty: 0 }))).toBe(true);
    expect(isProductDetailSoldOut(product({ it_stock_qty: -2 }))).toBe(true);
    // 선택옵션 상품은 상품 재고(it_stock_qty)가 아니라 옵션 재고로 본다
    expect(isProductDetailSoldOut(product({ it_stock_qty: 0, options: [option({ io_stock_qty: 3 })] }))).toBe(false);
    expect(isProductDetailSoldOut(product({ options: [option({ io_stock_qty: 0 }), option({ io_id: "블랙", io_stock_qty: 0 })] }))).toBe(true);
    // 추가옵션만 있는 상품은 옵션 없는 상품처럼 상품 재고로 본다
    expect(isProductDetailSoldOut(product({ it_stock_qty: 0, options: [option({ io_type: "1", io_stock_qty: 9 })] }))).toBe(true);
  });
});

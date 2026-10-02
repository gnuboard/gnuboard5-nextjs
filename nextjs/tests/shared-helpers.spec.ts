import { expect, test } from "@playwright/test";
import { formatListDate } from "../src/lib/utils";
import {
  formatProductPrice,
  hasProductDiscount,
  isProductSoldOut,
  isTelInquiry,
  productDiscountPercent,
} from "../src/lib/shop-product-state";
import { isSecretPost } from "../src/lib/post-flags";
import { memberAvatarUrl, memberInitial } from "../src/lib/member-avatar";

// 여러 화면이 함께 쓰는 공용 판정 · 표기 함수. 화면마다 따로 계산하던 것을 모았으므로 규칙이 바뀌지 않게 묶어 둔다.

test.describe("formatListDate (목록 줄 날짜, 그누보드 datetime2)", () => {
  test("오늘 글은 시:분, 그 밖에는 월-일", () => {
    const now = new Date(2026, 9, 2, 15, 0); // 현지 2026-10-02 15:00
    expect(formatListDate("2026-10-02 09:05:00", now)).toBe("09:05");
    expect(formatListDate("2026-10-01 23:40:00", now)).toBe("10-01");
    expect(formatListDate("2025-10-02 09:05:00", now)).toBe("10-02");
  });

  test("'오늘'은 현지 날짜로 잰다 — 자정 직후에도 UTC 로 하루 밀리지 않는다", () => {
    const justAfterMidnight = new Date(2026, 9, 2, 0, 10); // 현지 00:10 (UTC 로는 전날일 수 있다)
    expect(formatListDate("2026-10-02 00:05:00", justAfterMidnight)).toBe("00:05");
    expect(formatListDate("2026-10-01 23:55:00", justAfterMidnight)).toBe("10-01");
  });

  test("빈 값은 빈 글자", () => {
    expect(formatListDate("")).toBe("");
    expect(formatListDate(null)).toBe("");
  });
});

test.describe("shop-product-state (상품 판정)", () => {
  test("전화문의", () => {
    expect(isTelInquiry({ it_tel_inq: "1" })).toBe(true);
    expect(isTelInquiry({ it_tel_inq: 1 })).toBe(true);
    expect(isTelInquiry({ it_tel_inq: "0" })).toBe(false);
    expect(isTelInquiry({})).toBe(false);
    expect(isTelInquiry(null)).toBe(false);
  });

  test("할인: 판매가 > 0 이고 정가 > 판매가, 전화문의가 아닐 때만", () => {
    expect(hasProductDiscount({ it_price: 8000, it_cust_price: 10000 })).toBe(true);
    expect(productDiscountPercent({ it_price: 8000, it_cust_price: 10000 })).toBe(20);
    expect(productDiscountPercent({ it_price: 6667, it_cust_price: 10000 })).toBe(33);
    expect(hasProductDiscount({ it_price: 0, it_cust_price: 10000 })).toBe(false);
    expect(productDiscountPercent({ it_price: 0, it_cust_price: 10000 })).toBe(0);
    expect(hasProductDiscount({ it_price: 10000, it_cust_price: 10000 })).toBe(false);
    expect(hasProductDiscount({ it_price: 8000, it_cust_price: 10000, it_tel_inq: "1" })).toBe(false);
  });

  test("가격 칸 글자", () => {
    expect(formatProductPrice({ it_price: 1000, it_tel_inq: "1" })).toBe("전화문의");
    expect(formatProductPrice({ it_price: 1000 })).toContain("1,000");
    expect(formatProductPrice({ it_price: 1000 }, 2500)).toContain("2,500");
  });

  test("품절: 서버 is_soldout 이 있으면 그것, 없으면 옵션 없는 상품의 재고로", () => {
    expect(isProductSoldOut({ it_soldout: "1", it_stock_qty: 99 })).toBe(true);
    // 선택옵션이 모두 품절인 상품 — 목록 API 가 is_soldout 으로 알려 준다
    expect(isProductSoldOut({ it_soldout: "0", it_stock_qty: 99, has_options: true, is_soldout: true })).toBe(true);
    expect(isProductSoldOut({ it_soldout: "0", it_stock_qty: 0, has_options: false, is_soldout: false })).toBe(false);
    // is_soldout 이 없는 응답(상품 상세 · 오래된 API)
    expect(isProductSoldOut({ it_soldout: "0", it_stock_qty: 0, has_options: false })).toBe(true);
    expect(isProductSoldOut({ it_soldout: "0", it_stock_qty: 0, has_options: true })).toBe(false);
    expect(isProductSoldOut({ it_soldout: "0", it_stock_qty: 5 })).toBe(false);
  });
});

test.describe("isSecretPost (비밀글)", () => {
  test("is_secret 또는 wr_option 의 secret", () => {
    expect(isSecretPost({ is_secret: true })).toBe(true);
    expect(isSecretPost({ wr_option: "html1,secret,mail" })).toBe(true);
    expect(isSecretPost({ wr_option: "secret" })).toBe(true);
    expect(isSecretPost({ wr_option: "html1,mail" })).toBe(false);
    expect(isSecretPost({ wr_option: "" })).toBe(false);
    expect(isSecretPost({})).toBe(false);
  });
});

test.describe("member-avatar (아바타 원)", () => {
  test("회원이미지 -> 회원아이콘 -> 없음", () => {
    expect(memberAvatarUrl({ mb_image_path: "/img.gif", mb_icon_path: "/icon.gif" })).toBe("/img.gif");
    expect(memberAvatarUrl({ mb_image_path: null, mb_icon_path: "/icon.gif" })).toBe("/icon.gif");
    expect(memberAvatarUrl({})).toBe("");
    expect(memberAvatarUrl(null)).toBe("");
  });

  test("이니셜은 첫 글자(영문은 대문자), 비면 ?", () => {
    expect(memberInitial("빵야빵야")).toBe("빵");
    expect(memberInitial(" admin")).toBe("A");
    expect(memberInitial("")).toBe("?");
    expect(memberInitial(null)).toBe("?");
  });
});

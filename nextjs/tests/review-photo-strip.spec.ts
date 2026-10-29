import { expect, test } from "@playwright/test";
import type { ShopReview } from "../src/lib/api";
import {
  PHOTO_REVIEW_CAP,
  PHOTO_STRIP_BASE,
  photoReviewTotal,
  photoStripMoreState,
  productReviewsHref,
} from "../src/app/shop/products/[it_id]/review-photo-strip";

/*
 * 상품 상세 사용후기 탭의 포토 후기 줄 셈(review-photo-strip.ts) — 브라우저 없이.
 * 화면 전체는 tests/product-reviews-tab.spec.ts(실제 사이트, REVIEW_SMOKE_ITEM_ID).
 */

function review(isId: number, withPhoto: boolean): ShopReview {
  return {
    is_id: String(isId),
    it_id: "test-item",
    mb_id: "tester",
    mb_nick: "테스터",
    is_name: "테스터",
    is_score: 5,
    is_subject: `후기 ${isId}`,
    is_content: withPhoto ? `<p>좋아요</p><img src="https://example.test/${isId}.jpg">` : "<p>좋아요</p>",
    is_time: "2026-10-29 12:00:00",
  };
}

function reviews(count: number, photoEvery: number): ShopReview[] {
  return Array.from({ length: count }, (_, index) => review(index + 1, index % photoEvery === 0));
}

test.describe("포토 후기 수(photoReviewTotal)", () => {
  test("최근 후기를 아직 못 받았으면 요약의 수", () => {
    expect(photoReviewTotal([], 12)).toBe(12);
  });

  test("한도 미만을 다 받았으면 받은 것 중 사진 후기 수 — 요약(LIKE '%<img%')보다 실제 사진을 믿는다", () => {
    expect(photoReviewTotal(reviews(10, 2), 9)).toBe(5);
  });

  test("화면이 지우는 사진(지금은 없는 데모 호스트)만 있는 후기는 포토 후기가 아니다", () => {
    const dead = { ...review(1, false), is_content: '<p>후기</p><img src="https://demo.sir.kr/gnuboard5/data/editor/a.jpg">' };
    const mixed = { ...review(2, false), is_content: '<img src="https://demo.sir.kr/x.jpg"><img src="/data/editor/b.jpg">' };
    expect(photoReviewTotal([dead, mixed, review(3, false)], 2)).toBe(1);
  });

  test("한도에 걸렸으면 요약의 수와 받은 것 중 큰 쪽", () => {
    expect(photoReviewTotal(reviews(PHOTO_REVIEW_CAP, 2), 40)).toBe(40);
    expect(photoReviewTotal(reviews(PHOTO_REVIEW_CAP, 1), 3)).toBe(PHOTO_REVIEW_CAP);
  });
});

test.describe("사진 줄 [더 보기] · [접기](photoStripMoreState)", () => {
  test("놓을 칸이 처음 칸 수 이하면 단추가 없다", () => {
    expect(photoStripMoreState(PHOTO_STRIP_BASE, PHOTO_STRIP_BASE, 20, true)).toBeNull();
  });

  test("펼칠 칸이 남으면 더 보기와 보이는 칸 / 펼쳐 볼 수 있는 칸 — 전체 포토 후기 수가 아니다", () => {
    expect(photoStripMoreState(8, 14, 35, true)).toEqual({ expanded: false, note: "8 / 14" });
    expect(photoStripMoreState(8, 14, 10, false)).toEqual({ expanded: false, note: "8 / 14" });
  });

  test("다 펼치면 접기 — 한도에 걸려 더 있을 때만 '최근 후기 N건까지'", () => {
    expect(photoStripMoreState(14, 14, 35, true)).toEqual({
      expanded: true,
      note: `최근 후기 ${PHOTO_REVIEW_CAP}건까지`,
    });
    expect(photoStripMoreState(14, 14, 14, true)).toEqual({ expanded: true, note: "" });
    // 못 읽은 사진을 뺀 탓에 칸이 모자란 것은 한도 때문이 아니다.
    expect(photoStripMoreState(12, 12, 14, false)).toEqual({ expanded: true, note: "" });
  });
});

test("이 상품의 후기 전체 보기 — 상품코드 정확히 일치(?it_id=), 주소에 쓸 수 없는 글자는 바꾼다", () => {
  expect(productReviewsHref("1446772772")).toBe("/shop/reviews?it_id=1446772772");
  expect(productReviewsHref("a_b&c")).toBe("/shop/reviews?it_id=a_b%26c");
});

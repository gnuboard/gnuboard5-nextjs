import type { ShopReview } from "@/lib/api";
import { reviewImageUrls } from "@/components/shop/productDetailHelpers";

/*
 * 사용후기 탭의 쪽 크기와 포토 후기 줄 셈 — 레퍼런스 solune itemuse.skin.php. 화면(ProductReviewList)과 따로 두어
 * tests/review-photo-strip.spec.ts 가 브라우저 없이 확인한다.
 */

/** 한 쪽의 후기 수 — 영카트 shop/itemuse.php 의 $rows = 5(레퍼런스도 같다). */
export const REVIEW_PAGE_SIZE = 5;
/** 포토 후기 줄 · 크게 보기 창이 모으는 최근 후기 수 — 레퍼런스 $solune_review_cap. 쪽을 넘겨도 줄은 그대로다. */
export const PHOTO_REVIEW_CAP = 30;
/** 사진 줄이 처음 보이는 칸 수와 [더 보기]가 한 번에 펼치는 칸 수 — 레퍼런스 data-base · data-step. */
export const PHOTO_STRIP_BASE = 8;
export const PHOTO_STRIP_STEP = 16;

/**
 * 포토 후기 수 — 최근 후기를 다 받았으면(한도 미만) 받은 것 중 사진 후기 수, 한도에 걸렸으면 요약의 수와 큰 쪽.
 * 레퍼런스 $solune_photo_total 과 같은 셈 — 요약은 LIKE '%<img%' 로 세어 실제로 읽히는 사진과 조금 다를 수 있다.
 */
export function photoReviewTotal(recent: readonly ShopReview[], summaryCount: number): number {
  if (recent.length === 0) return summaryCount;
  const withPhotos = recent.filter((review) => reviewImageUrls(review.is_content).length > 0).length;
  return recent.length >= PHOTO_REVIEW_CAP ? Math.max(summaryCount, withPhotos) : withPhotos;
}

export type PhotoStripMoreState = {
  /** 다 펼쳤다 — 단추가 [접기]가 된다. */
  expanded: boolean;
  /** 단추 옆 회색 글씨 — 펼칠 때 "8 / 14"(펼쳐 볼 수 있는 칸), 다 펼쳤고 한도 밖에 포토 후기가 더 있으면 "최근 후기 30건까지". */
  note: string;
};

/**
 * 사진 줄 [더 보기] 단추의 모양 — 줄에 놓을 칸이 PHOTO_STRIP_BASE 이하라 단추가 없으면 null.
 *   shown 지금 보이는 칸 · available 줄에 놓을 수 있는 칸 · total 포토 후기 수 · capped 최근 후기가 한도에 걸렸다
 * 펼칠 때의 "8 / N" 은 실제로 펼쳐 볼 수 있는 칸 수 — 전체 포토 후기 수(머리의 "포토 후기 N")를 적으면 눌러도 그만큼
 * 나오지 않는다(줄은 최근 후기에서만 모은다). "최근 후기 N건까지"는 받은 후기가 한도에 걸렸을 때만 — 못 읽은 사진을
 * 뺀 탓에 칸이 모자란 것과 가른다.
 */
export function photoStripMoreState(
  shown: number,
  available: number,
  total: number,
  capped: boolean
): PhotoStripMoreState | null {
  if (available <= PHOTO_STRIP_BASE) return null;
  const expanded = shown >= available;
  if (!expanded) return { expanded, note: `${shown} / ${available}` };
  return { expanded, note: capped && total > available ? `최근 후기 ${PHOTO_REVIEW_CAP}건까지` : "" };
}

/** 이 상품의 후기만 모은 사용후기 목록 — ?it_id= 는 상품코드가 정확히 같은 후기만(검색의 상품코드는 앞부분 일치). */
export function productReviewsHref(itId: string): string {
  return `/shop/reviews?it_id=${encodeURIComponent(itId)}`;
}

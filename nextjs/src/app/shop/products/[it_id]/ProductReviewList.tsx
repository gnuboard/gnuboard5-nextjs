"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { ChevronDown, Star } from "lucide-react";
import type { ShopReview, ShopReviewSummary } from "@/lib/api";
import { SafeHtml } from "@/components/SafeHtml";
import { reviewFocusIdFromSearch, reviewImageUrls } from "@/components/shop/productDetailHelpers";
import { deleteShopReview, getShopProductReviews } from "@/services/shop";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn, formatDate } from "@/lib/utils";
import { ReviewForm } from "./ProductReviewQaForms";
import { ReviewPhotoDialog, type ReviewPhotoProduct } from "./ReviewPhotoDialog";
import {
  PHOTO_REVIEW_CAP,
  PHOTO_STRIP_BASE,
  PHOTO_STRIP_STEP,
  photoStripMoreState,
  productReviewsHref,
} from "./review-photo-strip";

type ReviewScore = NonNullable<ShopReviewSummary["scores"]>[number];

/**
 * 최근 후기 — 받는 중(loading)에는 사진 줄 자리만 잡고, 못 받았으면(failed) 이 쪽 후기로 줄을 채운다.
 * reload 는 후기를 고치거나 지운 뒤 다시 받는다(고쳐도 건수는 그대로라 refreshKey 로는 모른다).
 */
export type RecentPhotoReviews = {
  reviews: ShopReview[];
  status: "loading" | "ready" | "failed";
  reload: () => void;
};

/** 탭을 떠났다 돌아와도 다시 받지 않게, 펼친 사진 줄도 그대로 — 최근 본 몇 상품만 기억한다. */
const REMEMBERED_ITEMS = 8;
const recentByKey = new Map<string, ShopReview[]>();
const stripShownByItem = new Map<string, number>();

function remember<V>(map: Map<string, V>, key: string, value: V) {
  map.delete(key);
  map.set(key, value);
  if (map.size > REMEMBERED_ITEMS) map.delete(map.keys().next().value as string);
}

/**
 * 이 상품의 최근 후기(PHOTO_REVIEW_CAP 건) — 포토 후기 줄의 재료. refreshKey(후기 건수)가 바뀌면 다시 받고,
 * 받는 동안에는 앞서 받은 것을 그대로 보인다(새 후기를 쓰면 요약을 다시 받아 건수가 바뀐다).
 */
export function useRecentPhotoReviews(itId: string, refreshKey: number): RecentPhotoReviews {
  const [nonce, setNonce] = useState(0);
  const key = `${itId}:${refreshKey}:${nonce}`;
  const [loaded, setLoaded] = useState<{ itId: string; key: string; reviews: ShopReview[]; failed: boolean } | null>(
    null
  );
  const reload = () => {
    for (const cachedKey of [...recentByKey.keys()]) {
      if (cachedKey.startsWith(`${itId}:`)) recentByKey.delete(cachedKey);
    }
    setNonce((count) => count + 1);
  };
  useEffect(() => {
    if (recentByKey.has(key)) return;
    let alive = true;
    getShopProductReviews(itId, 1, PHOTO_REVIEW_CAP)
      .then((reviews) => {
        remember(recentByKey, key, reviews);
        if (alive) setLoaded({ itId, key, reviews, failed: false });
      })
      .catch(() => {
        if (alive) setLoaded({ itId, key, reviews: [], failed: true });
      });
    return () => {
      alive = false;
    };
  }, [itId, key]);
  const cached = recentByKey.get(key);
  if (cached) return { reviews: cached, status: "ready", reload };
  if (loaded?.key === key) return { reviews: loaded.reviews, status: loaded.failed ? "failed" : "ready", reload };
  if (loaded?.itId === itId && !loaded.failed) return { reviews: loaded.reviews, status: "ready", reload };
  return { reviews: [], status: "loading", reload };
}

function Stars({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn("flex", className)} aria-label={`5점 만점에 ${score}점`} role="img">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={cn("h-3.5 w-3.5", index < score ? "fill-current" : "fill-transparent opacity-40")}
        />
      ))}
    </span>
  );
}

/** 평점 요약 — 평균 · 별 · 건수(포토 몇) 왼쪽, 점수대 막대 가운데, 쓰기 단추 오른쪽(레퍼런스 solune-review-summary). */
export function ReviewSummaryBox({
  average,
  total,
  photoCount,
  scores,
  action,
}: {
  average: number;
  total: number;
  photoCount: number;
  scores: ReviewScore[];
  action: ReactNode;
}) {
  return (
    <div className="product-review-summary flex flex-wrap items-center gap-x-8 gap-y-5 rounded-lg border px-6 py-6 sm:px-8">
      <div className="product-review-score min-w-[120px] flex-none text-center">
        <p className="product-review-avg text-4xl font-bold tracking-tight">{average.toFixed(1)}</p>
        <Stars score={Math.round(average)} className="product-review-stars mt-1.5 justify-center text-amber-500" />
        <p className="product-review-count mt-1.5 text-xs text-muted-foreground">
          리뷰 {total.toLocaleString()}건 · 포토 {photoCount.toLocaleString()}
        </p>
      </div>
      <ul className="product-review-bars min-w-[200px] flex-1 space-y-1.5">
        {scores.map((item) => (
          <li key={item.score} className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <span className="w-7 flex-none">{item.score}점</span>
            <span className="product-review-bar relative h-1.5 flex-1 overflow-hidden bg-muted">
              <span
                className="absolute inset-y-0 left-0 bg-amber-500"
                style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
              />
            </span>
            <span className="w-8 flex-none text-right tabular-nums">{item.count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <div className="flex-none max-sm:w-full">{action}</div>
    </div>
  );
}

/** 크게 볼 후기 — 어느 목록(사진 줄의 최근 후기 · 이 쪽 후기)의 몇째 후기, 그 후기의 몇째 사진 */
type PhotoView = { source: "recent" | "page"; review: number; photo: number };

/**
 * 후기 목록 — 포토 후기 줄(최근 후기의 사진 후기마다 첫 사진, 8칸 + [더 보기]), "최신순 · N개", 후기마다 접힌 한 줄,
 * 아래 줄에 쪽 번호와 "이 상품의 후기 전체 보기". 사진을 누르면 그 후기의 포토 후기 창(ReviewPhotoDialog) —
 * 사진 줄에서 열면 최근 후기를, 목록에서 열면 이 쪽 후기를 넘겨 본다. ?is_id= 로 가리킨 후기는 펼친 채로 그린다.
 * 상품이 바뀌면 새로 그리도록 부르는 쪽에서 key 를 상품코드로 준다.
 */
export function ReviewList({
  itId,
  reviews,
  recent,
  total,
  photoTotal,
  product,
  pager,
  onChanged,
}: {
  /** 상품코드 — 펼친 사진 줄 기억과 "이 상품의 후기 전체 보기" 주소 */
  itId: string;
  /** 이 쪽 후기 */
  reviews: ShopReview[];
  /** 이 상품의 최근 후기(useRecentPhotoReviews) */
  recent: RecentPhotoReviews;
  total: number;
  /** 포토 후기 수(photoReviewTotal) — 최근 후기를 받는 동안에는 요약의 수라 사진 줄 자리 잡기에 쓴다. */
  photoTotal: number;
  /** 포토 후기 창 머리의 상품 */
  product: ReviewPhotoProduct;
  pager: ReactNode;
  /** 후기를 고치거나 지운 뒤 — 이 쪽 후기 · 요약을 다시 받는다(보던 쪽 그대로). */
  onChanged: () => void;
}) {
  const [photoView, setPhotoView] = useState<PhotoView | null>(null);
  // 고치거나 지우면 사진 줄의 최근 후기도 다시 받는다.
  const handleChanged = () => {
    recent.reload();
    onChanged();
  };
  const deleteReview = async (review: ShopReview, afterChange?: () => void) => {
    if (!window.confirm("상품후기를 삭제하시겠습니까?")) return;
    try {
      await deleteShopReview(review.is_id);
      toastSuccess("상품후기가 삭제되었습니다.");
      afterChange?.();
      handleChanged();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "상품후기를 삭제하지 못했습니다.");
    }
  };
  /**
   * [수정] · [삭제] — 쓴 사람 · 최고관리자에게만(can_edit · can_delete). 목록 한 줄과 포토 후기 창이 함께 쓴다.
   * afterChange 는 고치거나 지운 뒤 먼저 할 일(포토 후기 창은 닫는다 — 다시 받은 목록과 창의 차례가 어긋나므로).
   */
  const renderCommands = (review: ShopReview, afterChange?: () => void): ReactNode =>
    review.can_edit || review.can_delete ? (
      <>
        {review.can_edit && (
          <ReviewForm
            itId={itId}
            itName={product.name}
            itImage={product.image}
            review={review}
            onSubmitted={() => {
              afterChange?.();
              handleChanged();
            }}
            triggerLabel="수정"
            triggerClassName="product-review-edit h-7 px-2.5 text-xs"
          />
        )}
        {review.can_delete && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="product-review-delete h-7 px-2.5 text-xs"
            onClick={() => void deleteReview(review, afterChange)}
          >
            삭제
          </Button>
        )}
      </>
    ) : null;
  const [stripShown, setStripShownState] = useState(() => stripShownByItem.get(itId) ?? PHOTO_STRIP_BASE);
  const setStripShown = (next: number) => {
    remember(stripShownByItem, itId, next);
    setStripShownState(next);
  };
  // 못 읽은 사진 — 본문이 지워진 외부 주소를 가리키면 깨진 칸이 줄에 남는다. 한 번 실패하면 줄 · 썸네일에서 뺀다.
  const [brokenPhotos, setBrokenPhotos] = useState<ReadonlySet<string>>(() => new Set());
  const markBroken = (url: string) =>
    setBrokenPhotos((current) => (current.has(url) ? current : new Set([...current, url])));
  // 이 쪽 후기로 줄을 채우는 것은 최근 후기를 못 받았을 때뿐 — 받는 동안 채우면 다 받은 뒤 줄이 바뀐다.
  const recentReviews = recent.reviews;
  const stripSource = recent.status === "failed" ? "page" : "recent";
  const stripReviews = stripSource === "recent" ? recentReviews : reviews;
  const stripLoading = recent.status === "loading";
  const photosByReview = useMemo(
    () =>
      new Map(
        [...recentReviews, ...reviews].map((review) => [
          review.is_id,
          reviewImageUrls(review.is_content).filter((url) => !brokenPhotos.has(url)),
        ])
      ),
    [recentReviews, reviews, brokenPhotos]
  );
  // 사진 줄 — 사진 후기마다 첫 사진 하나(누르면 그 후기로 창을 연다). 서버의 photo_count 도 사진 후기 수라 단위가 같다.
  const stripPhotos = useMemo(
    () =>
      stripReviews.flatMap((review, reviewIndex) => {
        const first = photosByReview.get(review.is_id)?.[0];
        return first ? [{ url: first, review: reviewIndex, photo: 0 }] : [];
      }),
    [stripReviews, photosByReview]
  );
  const shownPhotos = stripPhotos.slice(0, stripShown);
  const dialogReviews = photoView?.source === "recent" ? recentReviews : reviews;
  // 받는 동안 잡아 둘 칸 — 요약의 포토 후기 수만큼(최대 8칸), [더 보기]가 설 자리도.
  const placeholderCells = stripLoading ? Math.min(photoTotal, PHOTO_STRIP_BASE) : 0;

  return (
    <>
      {placeholderCells > 0 && (
        <section className="product-review-photos mt-10" aria-busy="true">
          <h4 className="product-review-photos-head border-b border-foreground pb-3.5 text-[15px] font-bold">
            포토 후기 <span className="font-semibold tabular-nums text-muted-foreground">{photoTotal.toLocaleString()}</span>
          </h4>
          <ul className="product-review-photo-grid mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8" aria-hidden="true">
            {Array.from({ length: placeholderCells }).map((_, index) => (
              <li key={index} className="skeleton aspect-square" />
            ))}
          </ul>
          {photoTotal > PHOTO_STRIP_BASE && <div className="mt-4 h-11" aria-hidden="true" />}
        </section>
      )}
      {!stripLoading && stripPhotos.length > 0 && (
        <section className="product-review-photos mt-10">
          <h4 className="product-review-photos-head border-b border-foreground pb-3.5 text-[15px] font-bold">
            포토 후기 <span className="font-semibold tabular-nums text-muted-foreground">{photoTotal.toLocaleString()}</span>
          </h4>
          <ul id="product-review-photo-grid" className="product-review-photo-grid mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {shownPhotos.map((entry, index) => (
              <li key={`${entry.review}-${entry.url}`}>
                <button
                  type="button"
                  className="product-review-photo relative block aspect-square w-full cursor-zoom-in overflow-hidden bg-muted"
                  onClick={() => setPhotoView({ source: stripSource, review: entry.review, photo: entry.photo })}
                  aria-label={`포토 후기 사진 ${index + 1} 크게 보기`}
                >
                  <img
                    src={entry.url}
                    alt=""
                    loading="lazy"
                    onError={() => markBroken(entry.url)}
                    className="h-full w-full object-cover transition-opacity hover:opacity-85"
                  />
                </button>
              </li>
            ))}
          </ul>
          <PhotoStripMore
            shown={shownPhotos.length}
            available={stripPhotos.length}
            total={photoTotal}
            capped={stripSource === "recent" && recentReviews.length >= PHOTO_REVIEW_CAP}
            onMore={() => setStripShown(stripShown + PHOTO_STRIP_STEP)}
            onCollapse={() => setStripShown(PHOTO_STRIP_BASE)}
          />
        </section>
      )}

      <p className="product-review-sort mt-8 border-b border-foreground pb-3.5 text-xs tabular-nums text-muted-foreground">
        최신순 · {total.toLocaleString()}개
      </p>

      {reviews.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">아직 리뷰가 없습니다.</p>
      ) : (
        <ol className="product-review-list">
          {reviews.map((review, reviewIndex) => (
            <ReviewListItem
              key={review.is_id}
              review={review}
              photos={photosByReview.get(review.is_id) ?? []}
              onOpenPhoto={(photo) => setPhotoView({ source: "page", review: reviewIndex, photo })}
              onPhotoError={markBroken}
              commands={renderCommands(review)}
            />
          ))}
        </ol>
      )}
      {/* 쪽 번호는 가운데, "전체 보기"는 오른쪽 끝 — 레퍼런스 solune-review-foot. 좁은 화면에서는 위아래로 선다. */}
      <div className="product-review-foot mt-6 flex flex-col items-center gap-4 sm:flex-row">
        <div className="w-full min-w-0 sm:flex-1">{pager}</div>
        {reviews.length > 0 && (
          <Link
            href={productReviewsHref(itId)}
            className="product-review-all flex-none text-[13px] text-muted-foreground underline underline-offset-[3px] hover:text-primary"
          >
            이 상품의 후기 전체 보기
          </Link>
        )}
      </div>

      {photoView && (
        <ReviewPhotoDialog
          reviews={dialogReviews}
          photosByReview={photosByReview}
          startReview={photoView.review}
          startPhoto={photoView.photo}
          product={product}
          onClose={() => setPhotoView(null)}
          onPhotoError={markBroken}
          renderCommands={(review) => renderCommands(review, () => setPhotoView(null))}
        />
      )}
    </>
  );
}

/**
 * 사진 줄의 [더 보기 8 / 18] · [접기] — 레퍼런스 solune-review-photo-more. 펼칠 칸이 남으면 PHOTO_STRIP_STEP 칸씩 펼치고,
 * 다 펼치면 접기가 된다. 최근 후기가 한도에 걸려 포토 후기가 더 있으면 접기 옆에 "최근 후기 N건까지"를 적는다
 * (모양은 photoStripMoreState).
 */
function PhotoStripMore({
  shown,
  available,
  total,
  capped,
  onMore,
  onCollapse,
}: {
  shown: number;
  available: number;
  total: number;
  capped: boolean;
  onMore: () => void;
  onCollapse: () => void;
}) {
  const state = photoStripMoreState(shown, available, total, capped);
  if (!state) return null;
  const { expanded, note } = state;
  return (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        className="product-review-photo-more inline-flex h-11 min-w-40 items-center justify-center gap-2 rounded-lg border px-5 text-[13.5px] font-semibold transition-colors hover:border-foreground"
        aria-controls="product-review-photo-grid"
        aria-expanded={expanded}
        onClick={expanded ? onCollapse : onMore}
      >
        {expanded ? "접기" : "더 보기"}
        {note && <span className="product-review-photo-more-n font-medium tabular-nums text-muted-foreground">{note}</span>}
      </button>
    </div>
  );
}

/** 주소가 이 후기를 가리키면(?is_id= — 사용후기 목록의 "후기 바로가기") 처음부터 펴 둔다. */
function pointedByUrl(isId: string): boolean {
  if (typeof window === "undefined") return false;
  return reviewFocusIdFromSearch(window.location.search) === Number(isId);
}

/** 후기 한 줄 — 별 · 이름 · 날짜, 제목, [내용 보기 ▾](펼치면 "접기"), 오른쪽에 첫 사진(+N). */
function ReviewListItem({
  review,
  photos,
  onOpenPhoto,
  onPhotoError,
  commands,
}: {
  review: ShopReview;
  photos: string[];
  onOpenPhoto: (photoIndex: number) => void;
  onPhotoError: (url: string) => void;
  /** [수정] · [삭제] — 쓴 사람 · 최고관리자에게만(can_edit · can_delete). 펼친 본문 아래에 선다. */
  commands: ReactNode;
}) {
  const [open, setOpen] = useState(() => pointedByUrl(review.is_id));
  const contentId = useId();

  return (
    /* 후기 하나를 주소로 가리킬 수 있게 이름표를 단다(?is_id= — 레퍼런스 itemuse.skin.php 의 #is_N).
       찾아오면 ProductDetailClient 가 data-focused 로 잠깐 표시하고 초점을 준다(탭 차례에는 넣지 않는다). */
    <li
      id={`is_${review.is_id}`}
      data-review-id={review.is_id}
      tabIndex={-1}
      className="product-review-item flex gap-5 border-b py-6 outline-none transition-[background-color,box-shadow] duration-1000 data-[focused=true]:bg-primary/5 data-[focused=true]:ring-2 data-[focused=true]:ring-primary"
    >
      <div className="min-w-0 flex-1">
        <div className="product-review-meta mb-2 flex flex-wrap items-center gap-3">
          <Stars score={review.is_score} className="product-review-item-stars text-amber-500" />
          <span className="product-review-name text-[13px] font-semibold">{review.mb_nick}</span>
          <span className="product-review-date text-xs tabular-nums text-muted-foreground">{formatDate(review.is_time)}</span>
        </div>
        <h4 className="product-review-subject text-[14.5px] font-medium">{review.is_subject}</h4>
        {/* 본문 사진은 500px 까지 — 레퍼런스 itemuse.skin.php(get_view_thumbnail 500 · max-width:100%). 넓은 사진은
            API 가 그 폭의 썸네일로 바꿔 is_content_view 로 준다. 펼치기 전에는 그리지 않아 사진을 미리 받지 않는다. */}
        <div id={contentId} hidden={!open} className="product-review-content mt-2">
          {open && (
            <SafeHtml
              className="prose prose-sm max-w-none text-muted-foreground [&_img]:mr-1.5 [&_img]:mt-2.5 [&_img]:inline-block [&_img]:h-auto [&_img]:max-w-[min(100%,500px)] [&_img]:rounded-md [&_img]:align-top"
              html={review.is_content_view || review.is_content}
              policy="user"
            />
          )}
          {/* 레퍼런스 .sit_use_cmd — 펼친 본문 아래의 [수정] · [삭제]. */}
          {open && commands ? <div className="product-review-cmd mt-3 flex gap-2">{commands}</div> : null}
        </div>
        <button
          type="button"
          className="product-review-toggle mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs hover:border-foreground"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "접기" : "내용 보기"}
          <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </div>
      {photos.length > 0 && (
        <button
          type="button"
          className="product-review-thumb relative h-[84px] w-[84px] flex-none cursor-zoom-in overflow-hidden rounded-xl bg-muted sm:h-[110px] sm:w-[110px]"
          onClick={() => onOpenPhoto(0)}
          aria-label={`${review.mb_nick} 님의 사진 후기 크게 보기`}
        >
          <img src={photos[0]} alt="" loading="lazy" onError={() => onPhotoError(photos[0])} className="h-full w-full object-cover" />
          {photos.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              +{photos.length - 1}
            </span>
          )}
        </button>
      )}
    </li>
  );
}

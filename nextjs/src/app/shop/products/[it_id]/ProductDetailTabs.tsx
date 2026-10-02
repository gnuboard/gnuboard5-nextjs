"use client";

import { createElement, useId, type KeyboardEvent, type ReactNode } from "react";
import { Star } from "lucide-react";
import { SafeHtml, safeHtmlForPolicy } from "@/components/SafeHtml";
import { htmlToPlainText } from "@/lib/sanitize";
import { G5Link as Link } from "@/components/ui/g5-link";
import type {
  ShopPolicy,
  ShopProduct,
  ShopProductInfoItem,
  ShopQA,
  ShopReview,
  ShopReviewSummary,
} from "@/lib/api";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { useThemeSlot } from "@/components/providers/ThemeSlotsProvider";
import { ReviewForm, QaForm, QaListItem } from "./ProductReviewQaForms";

export type ProductDetailTab = {
  id: string;
  label: string;
  /** 후기·문의 건수. 기본 모양은 "라벨 (N)", 테마는 따로 받아 제 식으로 붙인다. */
  count?: number;
};

type ReviewScore = NonNullable<ShopReviewSummary["scores"]>[number];

export function ProductDetailTabs({
  activeTab,
  onActiveTabChange,
  tabs,
  product,
  productInfoItems,
  canWriteReview,
  canWriteQa,
  shippingPolicy,
  legacyProductForm,
  onReviewSubmitted,
  onQaSubmitted,
  reviews,
  reviewSummary,
  reviewPage,
  reviewLastPage,
  onReviewPageChange,
  qaPage,
  qaLastPage,
  onQaPageChange,
  reviewAverage,
  reviewTotal,
  reviewScores,
  qas,
  onQaChanged,
  shippingFreeThreshold,
  purchaseControls,
}: {
  activeTab: string;
  onActiveTabChange: (tabId: string) => void;
  tabs: ProductDetailTab[];
  product: ShopProduct;
  productInfoItems: ShopProductInfoItem[];
  canWriteReview: boolean;
  canWriteQa: boolean;
  shippingPolicy: ShopPolicy | null;
  legacyProductForm: string;
  onReviewSubmitted: () => void;
  onQaSubmitted: () => void;
  reviews: ShopReview[];
  reviewSummary: ShopReviewSummary | null;
  reviewPage: number;
  reviewLastPage: number;
  onReviewPageChange: (page: number) => void;
  qaPage: number;
  qaLastPage: number;
  onQaPageChange: (page: number) => void;
  reviewAverage: number;
  reviewTotal: number;
  reviewScores: ReviewScore[];
  qas: ShopQA[];
  onQaChanged: () => void;
  shippingFreeThreshold: number;
  /** 테마의 따라다니는 구매 상자용. 슬롯이 없으면 쓰지 않는다. */
  purchaseControls?: ReactNode;
}) {
  const themeTabs = useThemeSlot("ProductDetailTabs");
  const baseId = useId();
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab));
  const productPath = `/shop/products/${encodeURIComponent(product.it_id)}`;
  const loginHref = `/shop/login?redirect=${encodeURIComponent(productPath)}`;
  const tabId = (id: string) => `${baseId}-${id}-tab`;
  const panelId = (id: string) => `${baseId}-${id}-panel`;

  const focusTab = (nextIndex: number) => {
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    onActiveTabChange(nextTab.id);
    window.setTimeout(() => document.getElementById(tabId(nextTab.id))?.focus(), 0);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (tabs.length === 0) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab((index + 1) % tabs.length);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab((index - 1 + tabs.length) % tabs.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(tabs.length - 1);
    }
  };

  // 탭 단추에 붙는 것들. 기본 모양과 테마 슬롯이 같은 접근성 속성을 쓴다.
  const tabButtonProps = (tab: ProductDetailTab, index: number) => ({
    id: tabId(tab.id),
    type: "button" as const,
    role: "tab",
    "aria-selected": activeTab === tab.id,
    "aria-controls": panelId(tab.id),
    tabIndex: activeTab === tab.id ? 0 : -1,
    onClick: () => onActiveTabChange(tab.id),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => handleTabKeyDown(event, index),
  });

  const panel = (
      <div
        id={panelId(activeTab)}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={tabId(tabs[activeIndex]?.id ?? activeTab)}
        className="product-tabpanel py-6"
      >
        {activeTab === "description" && (
          <DescriptionTab product={product} productInfoItems={productInfoItems} />
        )}

        {activeTab === "reviews" && (
          <ReviewsTab
            product={product}
            canWriteReview={canWriteReview}
            shippingPolicy={shippingPolicy}
            legacyProductForm={legacyProductForm}
            onReviewSubmitted={onReviewSubmitted}
            reviews={reviews}
            reviewSummary={reviewSummary}
            reviewPage={reviewPage}
            reviewLastPage={reviewLastPage}
            onReviewPageChange={onReviewPageChange}
            reviewAverage={reviewAverage}
            reviewTotal={reviewTotal}
            reviewScores={reviewScores}
            loginHref={loginHref}
          />
        )}

        {activeTab === "qa" && (
          <QaTab
            product={product}
            canWriteQa={canWriteQa}
            legacyProductForm={legacyProductForm}
            onQaSubmitted={onQaSubmitted}
            qas={qas}
            onQaChanged={onQaChanged}
            loginHref={loginHref}
            qaPage={qaPage}
            qaLastPage={qaLastPage}
            onQaPageChange={onQaPageChange}
          />
        )}

        {activeTab === "shipping" && (
          <ShippingTab
            shippingPolicy={shippingPolicy}
            shippingFreeThreshold={shippingFreeThreshold}
          />
        )}
      </div>
  );

  if (themeTabs) {
    return createElement(themeTabs, {
      tabs: tabs.map((tab, index) => ({
        id: tab.id,
        label: tab.label,
        count: tab.count,
        selected: activeTab === tab.id,
        buttonProps: tabButtonProps(tab, index),
      })),
      panel,
      purchaseControls,
    });
  }

  return (
    <div className="product-tabs mt-12 border-t pt-8">
      <div role="tablist" aria-label="상품 상세 정보" className="product-tablist flex border-b">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            {...tabButtonProps(tab, index)}
            className={cn(
              "px-4 py-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.count !== undefined ? ` (${tab.count})` : ""}
          </button>
        ))}
      </div>
      {panel}
    </div>
  );
}

/** 정리한 HTML 에 글자나 미디어가 남아 있으면 그 원본을, 아니면 빈 문자열을 돌려준다. */
function renderableCommerceHtml(html: string | null | undefined): string {
  if (!html) return "";
  const safe = safeHtmlForPolicy(html, "commerce");
  if (htmlToPlainText(safe)) return html;
  return /<(img|iframe|video|audio)/i.test(safe) ? html : "";
}

function DescriptionTab({
  product,
  productInfoItems,
}: {
  product: ShopProduct;
  productInfoItems: ShopProductInfoItem[];
}) {
  // 정리기를 거친 뒤에도 읽을 것이 남는지 본다. 설명이 죽은 외부 이미지 한 장뿐인 상품
  // (옛 데모 데이터에 흔하다)은 it_explan 은 있어도 화면에는 빈 탭이 됐다.
  const explan = renderableCommerceHtml(product.it_explan);
  const basic = explan ? "" : renderableCommerceHtml(product.it_basic);
  return (
    <div className="prose max-w-none">
      {explan ? (
        <SafeHtml html={explan} policy="commerce" />
      ) : basic ? (
        <SafeHtml html={basic} policy="commerce" />
      ) : (
        <p className="text-muted-foreground">상품 설명이 없습니다.</p>
      )}
      {productInfoItems.length > 0 && (
        <section className="not-prose mt-8 overflow-hidden rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-3">
            <h3 className="text-base font-semibold">
              {product.it_info_title || "상품 정보 고시"}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table id="sit_inf_open" className="w-full border-collapse text-sm">
              <tbody>
                {productInfoItems.map((item) => (
                  <tr key={item.key} className="border-b last:border-b-0">
                    <th
                      scope="row"
                      className="w-36 bg-muted/40 px-4 py-3 text-left align-top font-medium text-foreground sm:w-48"
                    >
                      {item.title}
                    </th>
                    <SafeHtml
                      as="td"
                      className="px-4 py-3 align-top text-muted-foreground"
                      html={item.value || "-"}
                      policy="commerce"
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ReviewsTab({
  product,
  canWriteReview,
  shippingPolicy,
  legacyProductForm,
  onReviewSubmitted,
  reviews,
  reviewSummary,
  reviewPage,
  reviewLastPage,
  onReviewPageChange,
  reviewAverage,
  reviewTotal,
  reviewScores,
  loginHref,
}: {
  product: ShopProduct;
  canWriteReview: boolean;
  shippingPolicy: ShopPolicy | null;
  legacyProductForm: string;
  onReviewSubmitted: () => void;
  reviews: ShopReview[];
  reviewSummary: ShopReviewSummary | null;
  reviewPage: number;
  reviewLastPage: number;
  onReviewPageChange: (page: number) => void;
  reviewAverage: number;
  reviewTotal: number;
  reviewScores: ReviewScore[];
  loginHref: string;
}) {
  return (
    <div className="space-y-4">
      {canWriteReview ? (
        <ReviewForm
          itId={product.it_id}
          policy={shippingPolicy}
          initialOpen={legacyProductForm === "review"}
          onSubmitted={onReviewSubmitted}
        />
      ) : (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          후기 작성은 로그인 후 가능합니다.{" "}
          <Link href={loginHref} className="text-primary hover:underline">
            로그인
          </Link>
        </div>
      )}
      <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-[180px_1fr]">
        <div className="flex flex-col justify-center">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{reviewAverage.toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">/ 5</span>
          </div>
          <div className="mt-2 flex">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                key={index}
                className={cn(
                  "h-4 w-4",
                  index < Math.round(reviewAverage)
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30"
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            리뷰 {reviewTotal.toLocaleString()}개
            {reviewSummary && ` · 사진 ${reviewSummary.photo_count.toLocaleString()}개`}
          </p>
        </div>
        <div className="space-y-2">
          {reviewScores.map((item) => (
            <div
              key={item.score}
              className="grid grid-cols-[36px_1fr_44px] items-center gap-2 text-xs"
            >
              <span className="text-muted-foreground">{item.score}점</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                />
              </div>
              <span className="text-right text-muted-foreground">
                {item.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
      {reviews.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">아직 리뷰가 없습니다.</p>
      ) : (
        reviews.map((review) => (
          /* 후기 하나를 주소로 가리킬 수 있게 이름표를 단다(?is_id= — 레퍼런스 itemuse.skin.php 의 #is_N).
             찾아오면 ProductDetailClient 가 data-focused 로 잠깐 표시하고 초점을 준다(탭 차례에는 넣지 않는다). */
          <div
            key={review.is_id}
            id={`is_${review.is_id}`}
            data-review-id={review.is_id}
            tabIndex={-1}
            className="rounded-lg border p-4 outline-none transition-[background-color,box-shadow] duration-1000 data-[focused=true]:bg-primary/5 data-[focused=true]:ring-2 data-[focused=true]:ring-primary"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className={cn(
                        "h-3.5 w-3.5",
                        index < review.is_score
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/30"
                      )}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium">{review.mb_nick}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDate(review.is_time)}
              </span>
            </div>
            <h4 className="font-medium">{review.is_subject}</h4>
            <SafeHtml
              className="prose prose-sm mt-1 max-w-none text-sm text-muted-foreground"
              html={review.is_content}
              policy="user"
            />
          </div>
        ))
      )}
      <ReviewPager page={reviewPage} lastPage={reviewLastPage} onPageChange={onReviewPageChange} />
    </div>
  );
}

/** 사용후기 쪽 번호 — 전에는 첫 쪽(20개)만 보여 그 뒤 후기는 볼 길이 없었다. 지금 쪽 둘레 다섯 쪽과 처음 · 끝. */
function ReviewPager({
  page,
  lastPage,
  onPageChange,
  label = "사용후기 쪽 번호",
}: {
  page: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  /** 쪽 번호 띠의 이름 — 상품문의도 같은 띠를 쓴다. */
  label?: string;
}) {
  if (lastPage <= 1) return null;
  const start = Math.max(1, page - 2);
  const end = Math.min(lastPage, page + 2);
  const pages: number[] = [];
  for (let next = start; next <= end; next++) pages.push(next);
  const buttonClass = "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm tabular-nums transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

  return (
    <nav className="product-review-pager flex flex-wrap items-center justify-center gap-1 pt-4" aria-label={label}>
      <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="이전 쪽">
        ‹
      </button>
      {start > 1 ? (
        <>
          <button type="button" className={buttonClass} onClick={() => onPageChange(1)}>1</button>
          {start > 2 ? <span className="px-1 text-muted-foreground">…</span> : null}
        </>
      ) : null}
      {pages.map((next) => (
        <button
          key={next}
          type="button"
          className={cn(buttonClass, next === page && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
          aria-current={next === page ? "page" : undefined}
          onClick={() => onPageChange(next)}
        >
          {next}
        </button>
      ))}
      {end < lastPage ? (
        <>
          {end < lastPage - 1 ? <span className="px-1 text-muted-foreground">…</span> : null}
          <button type="button" className={buttonClass} onClick={() => onPageChange(lastPage)}>{lastPage}</button>
        </>
      ) : null}
      <button type="button" className={buttonClass} disabled={page >= lastPage} onClick={() => onPageChange(page + 1)} aria-label="다음 쪽">
        ›
      </button>
    </nav>
  );
}

function QaTab({
  product,
  canWriteQa,
  legacyProductForm,
  onQaSubmitted,
  qas,
  onQaChanged,
  loginHref,
  qaPage,
  qaLastPage,
  onQaPageChange,
}: {
  product: ShopProduct;
  canWriteQa: boolean;
  legacyProductForm: string;
  onQaSubmitted: () => void;
  qas: ShopQA[];
  onQaChanged: () => void;
  loginHref: string;
  qaPage: number;
  qaLastPage: number;
  onQaPageChange: (page: number) => void;
}) {
  return (
    <div className="space-y-4">
      {canWriteQa ? (
        <QaForm
          itId={product.it_id}
          initialOpen={legacyProductForm === "qa"}
          onSubmitted={onQaSubmitted}
        />
      ) : (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          문의 작성은 로그인 후 가능합니다.{" "}
          <Link href={loginHref} className="text-primary hover:underline">
            로그인
          </Link>
        </div>
      )}
      {qas.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">아직 문의가 없습니다.</p>
      ) : (
        qas.map((qa) => (
          /* 문의 하나를 주소로 가리킬 수 있게 이름표를 단다(?iq_id= — 레퍼런스 #iq_N). 찾아오면
             ProductDetailClient 가 data-focused 로 잠깐 표시하고 초점을 준다 — 후기 카드와 같다. */
          <div
            key={qa.iq_id}
            id={`iq_${qa.iq_id}`}
            data-qa-id={qa.iq_id}
            tabIndex={-1}
            className="rounded-lg outline-none transition-[background-color,box-shadow] duration-1000 data-[focused=true]:bg-primary/5 data-[focused=true]:ring-2 data-[focused=true]:ring-primary"
          >
            <QaCard qa={qa} onQaChanged={onQaChanged} />
          </div>
        ))
      )}
      <ReviewPager page={qaPage} lastPage={qaLastPage} onPageChange={onQaPageChange} label="상품문의 쪽 번호" />
    </div>
  );
}

function QaCard({ qa, onQaChanged }: { qa: ShopQA; onQaChanged: () => void }) {
  if (qa.can_edit || qa.can_delete) {
    return <QaListItem qa={qa} onChanged={onQaChanged} />;
  }
  const isLocked = qa.can_view === false;
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{qa.mb_nick}</span>
        <span className="text-xs text-muted-foreground">{formatDate(qa.iq_time)}</span>
      </div>
      <h4 className="font-medium">{isLocked ? "비밀글입니다." : qa.iq_subject}</h4>
      {isLocked ? (
        <p className="mt-1 text-sm text-muted-foreground">
          작성자와 관리자만 내용을 볼 수 있습니다.
        </p>
      ) : (
        <SafeHtml
          className="prose prose-sm mt-1 max-w-none text-sm text-muted-foreground"
          html={qa.iq_question}
          policy="user"
        />
      )}
      {!isLocked && qa.iq_answer && (
        <div className="mt-3 rounded-md bg-muted p-3">
          <p className="text-sm font-medium">답변</p>
          <SafeHtml
            className="prose prose-sm mt-1 max-w-none text-sm text-muted-foreground"
            html={qa.iq_answer}
            policy="user"
          />
        </div>
      )}
    </div>
  );
}

function ShippingTab({
  shippingPolicy,
  shippingFreeThreshold,
}: {
  shippingPolicy: ShopPolicy | null;
  shippingFreeThreshold: number;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border p-4">
        <h4 className="mb-2 font-medium">배송 안내</h4>
        {shippingPolicy?.delivery_content ? (
          <SafeHtml
            className="prose prose-sm max-w-none text-muted-foreground"
            html={shippingPolicy.delivery_content}
            policy="commerce"
          />
        ) : (
          <ul className="space-y-1 text-muted-foreground">
            <li>- 배송비: 기본 배송비 참고</li>
            <li>- 배송 기간: 결제 확인 후 2~3일 이내 발송</li>
            <li>- 도서/산간 지역은 추가 배송비가 발생할 수 있습니다.</li>
          </ul>
        )}
        {shippingPolicy && (
          <dl className="mt-4 grid gap-2 rounded-md bg-muted/50 p-3 text-xs">
            {shippingPolicy.delivery_company && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">택배사</dt>
                <dd className="font-medium">{shippingPolicy.delivery_company}</dd>
              </div>
            )}
            {shippingFreeThreshold > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">무료배송 기준</dt>
                <dd className="font-medium">{formatPrice(shippingFreeThreshold)} 이상</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <div className="rounded-lg border p-4">
        <h4 className="mb-2 font-medium">교환/반품 안내</h4>
        {shippingPolicy?.exchange_content ? (
          <SafeHtml
            className="prose prose-sm max-w-none text-muted-foreground"
            html={shippingPolicy.exchange_content}
            policy="commerce"
          />
        ) : (
          <ul className="space-y-1 text-muted-foreground">
            <li>- 상품 수령 후 7일 이내 교환/반품 가능</li>
            <li>- 고객 변심에 의한 교환/반품 시 배송비 고객 부담</li>
            <li>- 상품 하자 시 무료 교환/반품</li>
          </ul>
        )}
      </div>
    </div>
  );
}

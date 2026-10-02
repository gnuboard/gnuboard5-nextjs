"use client";

import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { Button } from "@/components/ui/button";
import { ShareButtons } from "@/components/ShareButtons";
import type { BbsRewriteMode } from "@/lib/board-url";
import { g5ShortHref } from "@/lib/g5-short-url";
import { shopProductHref } from "@/lib/product-url";
import { htmlToPlainText } from "@/lib/sanitize";
import { cn, formatPrice } from "@/lib/utils";
import { ProductPurchaseControls, type ProductPurchaseControlsProps } from "./ProductPurchaseControls";
import { formatProductPrice } from "@/lib/shop-product-state";

type ShippingPaymentDisplay = {
  label: string;
  value: string;
  detail?: string;
  selectable: boolean;
};

export function ProductPurchasePanel({
  product,
  productRewriteMode,
  hasDiscount,
  discountPercent,
  isTelInquiry,
  pointLabel,
  shippingPayment,
  ctSendCostSelection,
  onCtSendCostSelectionChange,
  canPurchaseProduct,
  optionSubjects,
  optionSelections,
  onOptionSelectionsChange,
  getAvailableValues,
  supplyOptions,
  supplyLabel,
  supplySelection,
  onSupplySelectionChange,
  onAddSupplyOption,
  quantity,
  onQuantityChange,
  quantityMinQty,
  minBuyQty,
  maxBuyQty,
  selectedOption,
  selectedCartOptions,
  onAddSelectedOption,
  onUpdateSelectedOptionQty,
  onRemoveSelectedOption,
  displayTotal,
  restockAlerted,
  onRemoveRestockAlert,
  onOpenRestockDialog,
  addingToCart,
  onAddToCart,
  onBuyNow,
  onWishlist,
  onOpenRecommendDialog,
  naverPayConfig,
  naverPaySubmitting,
  onNaverPayOrder,
  naverPayWishSubmitting,
  onNaverPayWish,
}: ProductPurchaseControlsProps & {
  productRewriteMode: BbsRewriteMode;
  hasDiscount: boolean;
  discountPercent: number;
  pointLabel: string;
  shippingPayment: ShippingPaymentDisplay;
  ctSendCostSelection: number;
  onCtSendCostSelectionChange: (value: number) => void;
}) {
  const subtitle = product.it_basic ? htmlToPlainText(product.it_basic).trim() : "";



  return (
    /* 테마가 모양을 잡을 수 있도록 덩어리마다 이름(product-*)을 붙여 둔다.
       유틸리티 클래스가 기본 모양이고, 이름은 테마 CSS 의 손잡이다. */
    <div className="product-panel space-y-6">
      {product.ca_name && (
        <a
          href={g5ShortHref(`/shop/categories/${product.ca_id}`)}
          className="product-brand text-sm text-muted-foreground hover:text-primary"
        >
          {product.it_brand || product.ca_name}
        </a>
      )}

      <div className="product-title-row flex items-center justify-between gap-4">
        <h1 className="product-title text-2xl font-bold">{product.it_name}</h1>
        <ShareButtons title={product.it_name} />
      </div>

      {/* 요약설명(it_basic)은 에디터 HTML 일 수 있다. 부제로는 글자만 쓴다 — 서식은 상품설명 탭이 낸다. */}
      {subtitle ? <p className="product-subtitle text-sm text-muted-foreground">{subtitle}</p> : null}

      {(product.prev_item || product.next_item) && (
        <nav aria-label="상품 이전 다음" className="product-siblings grid gap-2 text-sm sm:grid-cols-2">
          {product.prev_item ? (
            <Button
              variant="outline"
              className="h-auto justify-start gap-2 px-3 py-2 text-left"
              asChild
            >
              <Link href={shopProductHref(product.prev_item, productRewriteMode)}>
                <ChevronLeft className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">이전 상품</span>
                  <span className="block truncate font-medium">{product.prev_item.it_name}</span>
                </span>
              </Link>
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          {product.next_item ? (
            <Button
              variant="outline"
              className="h-auto justify-end gap-2 px-3 py-2 text-right"
              asChild
            >
              <Link href={shopProductHref(product.next_item, productRewriteMode)}>
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">다음 상품</span>
                  <span className="block truncate font-medium">{product.next_item.it_name}</span>
                </span>
                <ChevronRight className="size-4 shrink-0" />
              </Link>
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
        </nav>
      )}

      {product.review_count !== undefined && product.review_count > 0 && (
        <div className="product-rating flex items-center gap-2">
          <div className="product-rating-stars flex">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                key={index}
                className={cn(
                  "h-4 w-4",
                  index < Math.round(product.review_avg ?? 0)
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30"
                )}
              />
            ))}
          </div>
          <span className="product-rating-text text-sm text-muted-foreground">
            <b>{product.review_avg}</b>점 ({product.review_count}개 리뷰)
          </span>
        </div>
      )}

      <div className="product-price space-y-1">
        {hasDiscount && (
          <div className="product-price-before flex items-center gap-2">
            <span className="product-price-was text-sm text-muted-foreground line-through">
              {formatPrice(product.it_cust_price)}
            </span>
            <span className="product-price-off rounded bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
              {discountPercent}% OFF
            </span>
          </div>
        )}
        <p className="product-price-now text-3xl font-bold">
          {formatProductPrice(product)}
        </p>
        {!isTelInquiry && pointLabel && (
          <p className="product-price-point text-sm text-muted-foreground">적립 포인트: {pointLabel}</p>
        )}
      </div>

      <div className="product-shipping rounded-md border bg-muted/30 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="product-shipping-label font-medium">{shippingPayment.label}</span>
          {shippingPayment.selectable ? (
            <select
              aria-label="배송비 결제 방법"
              data-shop-send-cost-select="1"
              value={ctSendCostSelection}
              onChange={(event) => onCtSendCostSelectionChange(Number(event.target.value))}
              className="h-9 min-w-[140px] rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value={0}>주문시 결제</option>
              <option value={1}>수령후 지불</option>
            </select>
          ) : (
            <span className="font-medium text-foreground">{shippingPayment.value}</span>
          )}
        </div>
        {shippingPayment.detail && (
          <p className="mt-2 text-xs text-muted-foreground">{shippingPayment.detail}</p>
        )}
      </div>

      {/* 제조사·원산지·모델명. 값이 있는 항목만 나온다 — 빈 줄이 늘어서면
          정보가 아니라 잡음이 된다. */}
      {(product.it_maker || product.it_origin || product.it_model) && (
        <dl className="product-meta">
          {product.it_maker && (
            <div className="product-meta-row">
              <dt>제조사</dt>
              <dd>{product.it_maker}</dd>
            </div>
          )}
          {product.it_origin && (
            <div className="product-meta-row">
              <dt>원산지</dt>
              <dd>{product.it_origin}</dd>
            </div>
          )}
          {product.it_model && (
            <div className="product-meta-row">
              <dt>모델명</dt>
              <dd>{product.it_model}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="product-stock text-sm">
        {isTelInquiry ? (
          <span className="font-medium text-primary">전화문의 상품</span>
        ) : product.it_soldout === "1" ? (
          <span className="font-medium text-red-700">품절</span>
        ) : product.it_stock_qty > 0 ? (
          <span className="text-green-700">재고: {product.it_stock_qty}개</span>
        ) : (
          <span className="text-green-700">재고 있음</span>
        )}
      </div>

      <ProductPurchaseControls
        product={product}
        canPurchaseProduct={canPurchaseProduct}
        optionSubjects={optionSubjects}
        optionSelections={optionSelections}
        onOptionSelectionsChange={onOptionSelectionsChange}
        getAvailableValues={getAvailableValues}
        supplyOptions={supplyOptions}
        supplyLabel={supplyLabel}
        supplySelection={supplySelection}
        onSupplySelectionChange={onSupplySelectionChange}
        onAddSupplyOption={onAddSupplyOption}
        quantity={quantity}
        onQuantityChange={onQuantityChange}
        quantityMinQty={quantityMinQty}
        minBuyQty={minBuyQty}
        maxBuyQty={maxBuyQty}
        selectedOption={selectedOption}
        selectedCartOptions={selectedCartOptions}
        onAddSelectedOption={onAddSelectedOption}
        onUpdateSelectedOptionQty={onUpdateSelectedOptionQty}
        onRemoveSelectedOption={onRemoveSelectedOption}
        displayTotal={displayTotal}
        restockAlerted={restockAlerted}
        onRemoveRestockAlert={onRemoveRestockAlert}
        onOpenRestockDialog={onOpenRestockDialog}
        addingToCart={addingToCart}
        onAddToCart={onAddToCart}
        onBuyNow={onBuyNow}
        onWishlist={onWishlist}
        onOpenRecommendDialog={onOpenRecommendDialog}
        naverPayConfig={naverPayConfig}
        naverPaySubmitting={naverPaySubmitting}
        onNaverPayOrder={onNaverPayOrder}
        naverPayWishSubmitting={naverPayWishSubmitting}
        onNaverPayWish={onNaverPayWish}
        isTelInquiry={isTelInquiry}
      />
    </div>
  );
}

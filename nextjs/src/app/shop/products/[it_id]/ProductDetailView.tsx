"use client";

import dynamic from "next/dynamic";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import type {
  ShopPolicy,
  ShopProduct,
  ShopQA,
  ShopReview,
  ShopReviewSummary,
} from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { g5ShortHref } from "@/lib/g5-short-url";
import {
  isProductDetailSoldOut,
  productPointLabel,
  type SelectedCartOption,
} from "@/components/shop/productDetailHelpers";
import type { SupplyOptionGroupView } from "@/components/shop/useProductOptions";
import { ProductDetailHeadHtml, ProductDetailTailHtml } from "./ProductDetailHtmlBlocks";
import {
  ProductDetailEmpty,
  ProductDetailLoading,
  ProductImageGallery,
} from "./ProductDetailSections";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import { ProductPurchaseControls, type ProductPurchaseControlsProps } from "./ProductPurchaseControls";
import type { ProductDetailTab } from "./ProductDetailTabs";
import { hasProductDiscount, productDiscountPercent } from "@/lib/shop-product-state";

const Lightbox = dynamic(
  () => import("@/components/ui/lightbox").then((mod) => ({ default: mod.Lightbox })),
  { ssr: false }
);
const ProductDetailTabs = dynamic(
  () => import("./ProductDetailTabs").then((mod) => ({ default: mod.ProductDetailTabs })),
  {
    loading: () => (
      <div className="mt-12 border-t pt-8" aria-hidden="true">
        <div className="skeleton h-28 rounded-lg" />
      </div>
    ),
  }
);
const ProductRecommendations = dynamic(
  () => import("./ProductRecommendations").then((mod) => ({ default: mod.ProductRecommendations })),
  { ssr: false }
);
const RestockAlertDialog = dynamic(
  () => import("./ProductDetailDialogs").then((mod) => ({ default: mod.RestockAlertDialog })),
  { ssr: false }
);
const RecommendationDialog = dynamic(
  () => import("./ProductDetailDialogs").then((mod) => ({ default: mod.RecommendationDialog })),
  { ssr: false }
);

type AvailableOptionValue = {
  value: string;
  price?: number;
  soldOut?: boolean;
};

type ShippingPaymentDisplay = {
  label: string;
  value: string;
  detail?: string;
  selectable: boolean;
};

interface ProductDetailViewProps {
  loading: boolean;
  product: ShopProduct | null;
  productErrorMessage: string;
  isStaticFallbackShell: boolean;
  itId: string;
  selectedImage: number;
  onSelectedImageChange: Dispatch<SetStateAction<number>>;
  lightboxOpen: boolean;
  onLightboxOpenChange: Dispatch<SetStateAction<boolean>>;
  productRewriteMode: BbsRewriteMode;
  isTelInquiry: boolean;
  shippingPayment: ShippingPaymentDisplay;
  ctSendCostSelection: number;
  onCtSendCostSelectionChange: Dispatch<SetStateAction<number>>;
  optionSubjects: string[];
  optionSelections: string[];
  onSelectOptionValue: (levelIndex: number, value: string) => void;
  getAvailableValues: (levelIndex: number) => AvailableOptionValue[];
  supplyGroups: SupplyOptionGroupView[];
  onSelectSupplyOption: (ioId: string) => void;
  quantity: number;
  onQuantityChange: Dispatch<SetStateAction<number>>;
  quantityMinQty: number;
  minBuyQty: number;
  maxBuyQty: number;
  selectedCartOptions: SelectedCartOption[];
  onUpdateSelectedOptionQty: (ioId: string, qty: number) => void;
  onRemoveSelectedOption: (ioId: string) => void;
  displayTotal: number;
  restockAlerted: boolean;
  onRemoveRestockAlert: () => void;
  onOpenRestockDialog: () => void;
  addingToCart: boolean;
  onAddToCart: () => void;
  onBuyNow: () => void;
  onWishlist: () => void;
  activeTab: string;
  onActiveTabChange: Dispatch<SetStateAction<string>>;
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
  qas: ShopQA[];
  onQaChanged: () => void;
  shippingFreeThreshold: number;
  restockDialogOpen: boolean;
  onRestockDialogOpenChange: Dispatch<SetStateAction<boolean>>;
  restockHp: string;
  onRestockHpChange: Dispatch<SetStateAction<string>>;
  restockAgree: boolean;
  onRestockAgreeChange: Dispatch<SetStateAction<boolean>>;
  restockSubmitting: boolean;
  onRestockSubmit: (event: FormEvent<HTMLFormElement>) => void;
  recommendDialogOpen: boolean;
  onRecommendDialogOpenChange: Dispatch<SetStateAction<boolean>>;
  recommendToEmail: string;
  onRecommendToEmailChange: Dispatch<SetStateAction<string>>;
  recommendSubject: string;
  onRecommendSubjectChange: Dispatch<SetStateAction<string>>;
  recommendContent: string;
  onRecommendContentChange: Dispatch<SetStateAction<string>>;
  recommendSubmitting: boolean;
  onRecommendSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ProductDetailView({
  loading,
  product,
  productErrorMessage,
  isStaticFallbackShell,
  itId,
  selectedImage,
  onSelectedImageChange,
  lightboxOpen,
  onLightboxOpenChange,
  productRewriteMode,
  isTelInquiry,
  shippingPayment,
  ctSendCostSelection,
  onCtSendCostSelectionChange,
  optionSubjects,
  optionSelections,
  onSelectOptionValue,
  getAvailableValues,
  supplyGroups,
  onSelectSupplyOption,
  quantity,
  onQuantityChange,
  quantityMinQty,
  minBuyQty,
  maxBuyQty,
  selectedCartOptions,
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
  activeTab,
  onActiveTabChange,
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
  qas,
  onQaChanged,
  shippingFreeThreshold,
  restockDialogOpen,
  onRestockDialogOpenChange,
  restockHp,
  onRestockHpChange,
  restockAgree,
  onRestockAgreeChange,
  restockSubmitting,
  onRestockSubmit,
  recommendDialogOpen,
  onRecommendDialogOpenChange,
  recommendToEmail,
  onRecommendToEmailChange,
  recommendSubject,
  onRecommendSubjectChange,
  recommendContent,
  onRecommendContentChange,
  recommendSubmitting,
  onRecommendSubmit,
}: ProductDetailViewProps) {
  if (loading) {
    return <ProductDetailLoading />;
  }

  if (!product && productErrorMessage) {
    return (
      <ProductDetailEmpty
        message={productErrorMessage}
        isStaticFallbackShell={isStaticFallbackShell}
      />
    );
  }

  if (!product) {
    return (
      <ProductDetailEmpty
        message="상품을 찾을 수 없습니다"
        isStaticFallbackShell={isStaticFallbackShell}
      />
    );
  }

  const images = product.images?.length ? product.images : [product.image_url];
  const pointLabel = productPointLabel(product);
  // 품절 표시뿐 아니라 선택옵션이 모두 품절 · 옵션 없는 상품의 재고 0 도 품절이다(영카트 is_soldout — 서버도 담기를 거절).
  const canPurchaseProduct = !isTelInquiry && !isProductDetailSoldOut(product);
  const hasDiscount = hasProductDiscount(product);
  const discountPercent = productDiscountPercent(product);

  const reviewTotal = reviewSummary?.total ?? product.review_count ?? 0;
  const reviewAverage = reviewSummary?.average ?? product.review_avg ?? 0;
  const reviewScores =
    reviewSummary?.scores ??
    Array.from({ length: 5 }, (_, index) => ({
      score: 5 - index,
      count: 0,
      percentage: 0,
    }));
  const tabs: ProductDetailTab[] = [
    { id: "description", label: "상품설명" },
    { id: "reviews", label: "상품후기", count: product.review_count ?? 0 },
    { id: "qa", label: "상품문의", count: product.qa_count ?? 0 },
    { id: "shipping", label: "배송정보" },
  ];

  const breadcrumbItems = [
    { label: "쇼핑몰", href: "/shop" },
    ...(product.ca_name
      ? [{ label: product.ca_name, href: g5ShortHref(`/shop/categories/${product.ca_id}`) }]
      : []),
    { label: product.it_name },
  ];
  const productInfoItems = product.it_info_items ?? [];
  const restockPrivacyText = product.stock_sms_privacy?.trim() ?? "";

  // 옵션·수량·단추 묶음의 props. 구매 패널과, 테마가 상세 설명 옆에 두는 구매 상자가 같은 것을 받는다.
  const purchaseControlProps: ProductPurchaseControlsProps = {
    product,
    isTelInquiry,
    canPurchaseProduct,
    optionSubjects,
    optionSelections,
    onSelectOptionValue,
    getAvailableValues,
    supplyGroups,
    onSelectSupplyOption,
    quantity,
    onQuantityChange,
    quantityMinQty,
    minBuyQty,
    maxBuyQty,
    selectedCartOptions,
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
  };

  return (
    <div>
      <Breadcrumb items={breadcrumbItems} />

      <ProductDetailHeadHtml headHtml={product.it_head_html} />

      <div className="product-detail-grid grid gap-8 md:grid-cols-2">
        <ProductImageGallery
          product={product}
          images={images}
          selectedImage={selectedImage}
          onSelectImage={onSelectedImageChange}
          onOpenLightbox={() => onLightboxOpenChange(true)}
        />

        <ProductPurchasePanel
          {...purchaseControlProps}
          productRewriteMode={productRewriteMode}
          hasDiscount={hasDiscount}
          discountPercent={discountPercent}
          pointLabel={pointLabel}
          shippingPayment={shippingPayment}
          ctSendCostSelection={ctSendCostSelection}
          onCtSendCostSelectionChange={onCtSendCostSelectionChange}
        />
      </div>

      <ProductDetailTabs
        activeTab={activeTab}
        onActiveTabChange={onActiveTabChange}
        tabs={tabs}
        product={product}
        productInfoItems={productInfoItems}
        canWriteReview={canWriteReview}
        canWriteQa={canWriteQa}
        shippingPolicy={shippingPolicy}
        legacyProductForm={legacyProductForm}
        onReviewSubmitted={onReviewSubmitted}
        onQaSubmitted={onQaSubmitted}
        reviews={reviews}
        reviewSummary={reviewSummary}
        reviewPage={reviewPage}
        reviewLastPage={reviewLastPage}
        onReviewPageChange={onReviewPageChange}
        qaPage={qaPage}
        qaLastPage={qaLastPage}
        onQaPageChange={onQaPageChange}
        reviewAverage={reviewAverage}
        reviewTotal={reviewTotal}
        reviewScores={reviewScores}
        qas={qas}
        onQaChanged={onQaChanged}
        shippingFreeThreshold={shippingFreeThreshold}
        purchaseControls={<ProductPurchaseControls {...purchaseControlProps} />}
      />

      <ProductRecommendations
        currentId={itId || product.it_id}
        items={product.related_items}
        productRewriteMode={productRewriteMode}
      />

      <ProductDetailTailHtml tailHtml={product.it_tail_html} />

      {restockDialogOpen && (
        <RestockAlertDialog
          open={restockDialogOpen}
          onOpenChange={onRestockDialogOpenChange}
          hp={restockHp}
          onHpChange={onRestockHpChange}
          agree={restockAgree}
          onAgreeChange={onRestockAgreeChange}
          submitting={restockSubmitting}
          privacyText={restockPrivacyText}
          onSubmit={onRestockSubmit}
        />
      )}

      {recommendDialogOpen && (
        <RecommendationDialog
          open={recommendDialogOpen}
          onOpenChange={onRecommendDialogOpenChange}
          toEmail={recommendToEmail}
          onToEmailChange={onRecommendToEmailChange}
          subject={recommendSubject}
          onSubjectChange={onRecommendSubjectChange}
          content={recommendContent}
          onContentChange={onRecommendContentChange}
          submitting={recommendSubmitting}
          onSubmit={onRecommendSubmit}
        />
      )}

      {lightboxOpen && (
        <Lightbox
          images={images.filter(Boolean) as string[]}
          currentIndex={selectedImage}
          onClose={() => onLightboxOpenChange(false)}
          onNavigate={(index) => {
            onSelectedImageChange(index);
          }}
        />
      )}
    </div>
  );
}

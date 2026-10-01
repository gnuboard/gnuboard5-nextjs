"use client";

import {
  Bell,
  BellOff,
  CreditCard,
  Heart,
  Mail,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ShopNaverPayConfig, ShopProduct } from "@/lib/api";
import { ProductOptionPicker, type ProductOptionPickerProps } from "./ProductOptionPicker";

export type ProductPurchaseControlsProps = ProductOptionPickerProps & {
  product: ShopProduct;
  canPurchaseProduct: boolean;
  restockAlerted: boolean;
  onRemoveRestockAlert: () => void;
  onOpenRestockDialog: () => void;
  addingToCart: boolean;
  onAddToCart: () => void;
  onBuyNow: () => void;
  onWishlist: () => void;
  onOpenRecommendDialog: () => void;
  naverPayConfig: ShopNaverPayConfig | null;
  naverPaySubmitting: boolean;
  onNaverPayOrder: () => void;
  naverPayWishSubmitting: boolean;
  onNaverPayWish: () => void;
  isTelInquiry: boolean;
};

/**
 * 옵션 고르기 → 수량 → 고른 옵션 → 합계 → 장바구니/바로구매/위시 단추.
 * ProductPurchasePanel 의 아래 절반이다. 따로 둔 이유: 테마가 상세 설명 옆에
 * 따라다니는 구매 상자를 그릴 때 같은 것을 한 번 더 놓을 수 있게 — 상태는 전부
 * 위(ProductDetailClient)에 있으므로 두 벌이 저절로 같이 움직인다.
 */
export function ProductPurchaseControls({
  product,
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
  isTelInquiry,
}: ProductPurchaseControlsProps) {
  return (
    <>
      {canPurchaseProduct && (
        <ProductOptionPicker
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
        />
      )}

      <div className="product-actions flex gap-3">
        {isTelInquiry ? (
          <Button className="flex-1" size="lg" variant="outline" disabled>
            전화문의
          </Button>
        ) : product.it_soldout === "1" ? (
          <>
            {product.it_stock_sms !== "1" ? (
              <Button className="flex-1" size="lg" variant="outline" disabled>
                품절
              </Button>
            ) : restockAlerted ? (
              <Button className="flex-1" size="lg" variant="outline" onClick={onRemoveRestockAlert}>
                <BellOff className="mr-2 h-4 w-4" />
                알림 해제
              </Button>
            ) : (
              <Button
                className="flex-1"
                size="lg"
                variant="default"
                onClick={onOpenRestockDialog}
              >
                <Bell className="mr-2 h-4 w-4" />
                재입고 알림 신청
              </Button>
            )}
          </>
        ) : (
          <>
            <Button className="product-action-cart flex-1" size="lg" onClick={onAddToCart} disabled={addingToCart}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              {addingToCart ? "추가 중..." : "장바구니"}
            </Button>
            <Button className="product-action-buy flex-1" size="lg" variant="secondary" onClick={onBuyNow}>
              바로구매
            </Button>
          </>
        )}
        <Button className="product-action-wish" variant="outline" size="lg" aria-label="위시리스트에 추가" onClick={onWishlist}>
          <Heart className="h-4 w-4" />
        </Button>
        <Button
          className="product-action-recommend"
          variant="outline"
          size="lg"
          aria-label="지인에게 메일로 추천"
          title="지인에게 메일로 추천"
          onClick={onOpenRecommendDialog}
        >
          <Mail className="h-4 w-4" />
        </Button>
      </div>

      {naverPayConfig?.enabled && canPurchaseProduct && (
        <div className="product-naverpay rounded-md border border-[#0c8040]/30 bg-[#0c8040]/5 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              className="bg-[#0c8040] text-white hover:bg-[#08783a]"
              onClick={onNaverPayOrder}
              disabled={naverPaySubmitting}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {naverPaySubmitting ? "네이버페이 등록 중..." : "N Pay 구매"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-[#0c8040]/50 text-[#0c8040] hover:bg-[#0c8040]/10"
              onClick={onNaverPayWish}
              disabled={naverPayWishSubmitting}
            >
              <Heart className="mr-2 h-4 w-4" />
              {naverPayWishSubmitting ? "찜 등록 중..." : "N Pay 찜"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

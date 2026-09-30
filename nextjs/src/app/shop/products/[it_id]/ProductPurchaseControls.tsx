"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  Bell,
  BellOff,
  CreditCard,
  Heart,
  Mail,
  Minus,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ShopNaverPayConfig, ShopProduct, ShopProductOption } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import {
  clampBuyQuantity,
  isShopOptionPurchasable,
  type SelectedCartOption,
} from "./productDetailHelpers";

type AvailableOptionValue = {
  value: string;
  price?: number;
  soldOut?: boolean;
};

export type ProductPurchaseControlsProps = {
  product: ShopProduct;
  canPurchaseProduct: boolean;
  optionSubjects: string[];
  optionSelections: string[];
  onOptionSelectionsChange: Dispatch<SetStateAction<string[]>>;
  getAvailableValues: (levelIndex: number) => AvailableOptionValue[];
  supplyOptions: ShopProductOption[];
  supplyLabel: string;
  supplySelection: string;
  onSupplySelectionChange: (value: string) => void;
  onAddSupplyOption: () => void;
  quantity: number;
  onQuantityChange: Dispatch<SetStateAction<number>>;
  quantityMinQty: number;
  minBuyQty: number;
  maxBuyQty: number;
  selectedOption?: ShopProductOption | null;
  selectedCartOptions: SelectedCartOption[];
  onAddSelectedOption: () => void;
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
  const [quantityInput, setQuantityInput] = useState(String(quantity));

  useEffect(() => {
    setQuantityInput(String(quantity));
  }, [quantity]);

  const commitQuantityInput = () => {
    const parsed = Number(quantityInput);
    if (!Number.isFinite(parsed)) {
      setQuantityInput(String(quantity));
      return;
    }
    const nextQuantity = clampBuyQuantity(parsed, quantityMinQty, maxBuyQty);
    onQuantityChange(nextQuantity);
    setQuantityInput(String(nextQuantity));
  };

  return (
    <>
      {canPurchaseProduct && optionSubjects.length > 0 && (
        <div className="product-options space-y-3">
          {optionSubjects.map((subject, levelIndex) => {
            const available = getAvailableValues(levelIndex);
            const isDisabled = levelIndex > 0 && !optionSelections[levelIndex - 1];
            return (
              <div key={levelIndex}>
                <label className="mb-1 block text-sm font-medium">{subject}</label>
                <select
                  aria-label={subject}
                  data-shop-option-select="1"
                  value={optionSelections[levelIndex] || ""}
                  disabled={isDisabled}
                  onChange={(event) => {
                    onOptionSelectionsChange((previous) => {
                      const next = [...previous];
                      next[levelIndex] = event.target.value;
                      for (let i = levelIndex + 1; i < optionSubjects.length; i++) {
                        next[i] = "";
                      }
                      return next;
                    });
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">선택해주세요</option>
                  {available.map((item) => (
                    <option key={item.value} value={item.value} disabled={item.soldOut}>
                      {item.value}
                      {item.price && item.price > 0
                        ? ` (+${formatPrice(item.price)})`
                        : item.price && item.price < 0
                          ? ` (${formatPrice(item.price)})`
                          : ""}
                      {item.soldOut ? " [품절]" : ""}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {canPurchaseProduct && supplyOptions.length > 0 && (
        <div className="space-y-2">
          <label className="mb-1 block text-sm font-medium">{supplyLabel}</label>
          <div className="flex gap-2">
            <select
              aria-label={supplyLabel}
              value={supplySelection}
              onChange={(event) => onSupplySelectionChange(event.target.value)}
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">추가옵션을 선택해주세요</option>
              {supplyOptions.map((option) => (
                <option
                  key={option.io_id}
                  value={option.io_id}
                  disabled={!isShopOptionPurchasable(option)}
                >
                  {option.io_value || option.io_id}
                  {option.io_price > 0
                    ? ` (+${formatPrice(option.io_price)})`
                    : option.io_price < 0
                      ? ` (${formatPrice(option.io_price)})`
                      : ""}
                  {!isShopOptionPurchasable(option) ? " [품절]" : ""}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={onAddSupplyOption}
              disabled={!supplySelection}
            >
              추가
            </Button>
          </div>
        </div>
      )}

      {canPurchaseProduct && (
        <div className="product-quantity">
          <label className="mb-1 block text-sm font-medium">수량</label>
          <div className="product-quantity-controls flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="수량 감소"
              onClick={() =>
                onQuantityChange((quantity) =>
                  clampBuyQuantity(quantity - 1, quantityMinQty, maxBuyQty)
                )
              }
              disabled={quantity <= quantityMinQty}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <input
              type="number"
              min={quantityMinQty}
              max={maxBuyQty > 0 ? Math.max(quantityMinQty, maxBuyQty) : undefined}
              aria-label="구매 수량"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              onBlur={commitQuantityInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              className="h-9 w-16 rounded-md border bg-background text-center text-sm outline-none"
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="수량 증가"
              onClick={() =>
                onQuantityChange((quantity) =>
                  clampBuyQuantity(quantity + 1, quantityMinQty, maxBuyQty)
                )
              }
              disabled={maxBuyQty > 0 && quantity >= Math.max(quantityMinQty, maxBuyQty)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {(minBuyQty > 0 || maxBuyQty > 0) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                minBuyQty > 0 ? `최소 ${minBuyQty}개` : "",
                maxBuyQty > 0 ? `최대 ${maxBuyQty}개` : "",
              ]
                .filter(Boolean)
                .join(" / ")}
            </p>
          )}
        </div>
      )}

      {canPurchaseProduct && (optionSubjects.length > 0 || supplyOptions.length > 0) && (
        <div className="product-selected space-y-3">
          {optionSubjects.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddSelectedOption}
              disabled={!selectedOption}
            >
              선택 옵션 추가
            </Button>
          )}

          {selectedCartOptions.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              {selectedCartOptions.map((option) => (
                <div
                  key={option.io_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{option.label}</p>
                    {option.price !== 0 && (
                      <p className="text-xs text-muted-foreground">
                        {option.price > 0 ? "+" : ""}
                        {formatPrice(option.price)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`${option.label} 수량 감소`}
                      onClick={() => onUpdateSelectedOptionQty(option.io_id, option.qty - 1)}
                      disabled={option.qty <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <input
                      type="number"
                      min={1}
                      max={option.stockQty > 0 ? option.stockQty : undefined}
                      aria-label={`${option.label} 수량`}
                      value={option.qty}
                      onChange={(event) =>
                        onUpdateSelectedOptionQty(option.io_id, Number(event.target.value))
                      }
                      className="h-9 w-16 rounded-md border bg-background text-center text-sm outline-none"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`${option.label} 수량 증가`}
                      onClick={() => onUpdateSelectedOptionQty(option.io_id, option.qty + 1)}
                      disabled={option.stockQty > 0 && option.qty >= option.stockQty}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveSelectedOption(option.io_id)}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canPurchaseProduct && (
        <div className="product-total rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center justify-between">
            <span className="product-total-label font-medium">총 상품 금액</span>
            <span className="product-total-value text-xl font-bold text-primary">{formatPrice(displayTotal)}</span>
          </div>
        </div>
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

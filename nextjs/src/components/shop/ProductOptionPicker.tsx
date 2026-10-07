"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import {
  clampBuyQuantity,
  isShopOptionPurchasable,
  optionPriceSuffix,
  OPTION_SEPARATOR,
  type SelectedCartOption,
} from "./productDetailHelpers";
import type { SupplyOptionGroupView } from "./useProductOptions";

type AvailableOptionValue = {
  value: string;
  price?: number;
  soldOut?: boolean;
};

export type ProductOptionPickerProps = {
  /** 옵션 없는 상품의 본품 줄 이름 */
  productName: string;
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
};

const SELECT_CLASS =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

function signedPrice(price: number) {
  return `${price >= 0 ? "+" : ""}${formatPrice(price)}`;
}

/**
 * 선택옵션 → 추가옵션 → 선택된 옵션 → 총 금액 — 영카트 상품 상세(item.form.skin.php)와 같은 모양 · 순서.
 * select 를 고르면 바로 아래 목록에 한 줄이 붙고(추가 단추 없음), 줄마다 수량 −/+ · 삭제가 있다.
 * 상품 상세의 구매 상자 · 상품 카드의 빠른 담기 창 · 장바구니 선택사항수정 창이 같은 것을 쓴다(상태: useProductOptions).
 */
export function ProductOptionPicker({
  productName,
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
}: ProductOptionPickerProps) {
  const hasOptionSubjects = optionSubjects.length > 0;
  const quantityMaxQty = maxBuyQty > 0 ? Math.max(quantityMinQty, maxBuyQty) : 0;

  return (
    <>
      {hasOptionSubjects && (
        <div className="product-options space-y-3">
          {optionSubjects.map((subject, levelIndex) => {
            const isLastLevel = levelIndex === optionSubjects.length - 1;
            return (
              <div key={levelIndex}>
                <label className="mb-1 block text-sm font-medium">{subject}</label>
                <select
                  aria-label={subject}
                  data-shop-option-select="1"
                  value={optionSelections[levelIndex] || ""}
                  disabled={levelIndex > 0 && !optionSelections[levelIndex - 1]}
                  onChange={(event) => onSelectOptionValue(levelIndex, event.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">{subject}</option>
                  {getAvailableValues(levelIndex).map((item) => (
                    <option key={item.value} value={item.value} disabled={item.soldOut}>
                      {item.value}
                      {isLastLevel ? optionPriceSuffix(item.price ?? 0) : ""}
                      {item.soldOut ? "  [품절]" : ""}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {supplyGroups.length > 0 && (
        <div className="product-supply-options space-y-3">
          {supplyGroups.map((group) => (
            <div key={group.subject}>
              <label className="mb-1 block text-sm font-medium">{group.subject}</label>
              <select
                aria-label={group.subject}
                value={group.selectedIoId}
                onChange={(event) => onSelectSupplyOption(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">{group.subject}</option>
                {group.options.map((option) => {
                  const purchasable = isShopOptionPurchasable(option);
                  return (
                    <option key={option.io_id} value={option.io_id} disabled={!purchasable}>
                      {option.io_id.split(OPTION_SEPARATOR)[1]}
                      {optionPriceSuffix(option.io_price)}
                      {purchasable ? "" : "  [품절]"}
                    </option>
                  );
                })}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="product-selected space-y-2" aria-label="선택된 옵션">
        {!hasOptionSubjects && (
          <SelectedOptionLine
            label={productName}
            priceText={signedPrice(0)}
            qty={quantity}
            minQty={quantityMinQty}
            maxQty={quantityMaxQty}
            onQtyChange={(next) => onQuantityChange(clampBuyQuantity(next, quantityMinQty, maxBuyQty))}
          />
        )}
        {selectedCartOptions.map((option) => (
          <SelectedOptionLine
            key={`${option.ioType}-${option.io_id}`}
            label={option.label}
            priceText={signedPrice(option.price)}
            qty={option.qty}
            minQty={1}
            maxQty={option.stockQty}
            onQtyChange={(next) => onUpdateSelectedOptionQty(option.io_id, next)}
            onRemove={() => onRemoveSelectedOption(option.io_id)}
          />
        ))}
        {(minBuyQty > 0 || maxBuyQty > 0) && (
          <p className="text-xs text-muted-foreground">
            {[minBuyQty > 0 ? `최소 ${minBuyQty}개` : "", maxBuyQty > 0 ? `최대 ${maxBuyQty}개` : ""]
              .filter(Boolean)
              .join(" / ")}
          </p>
        )}
      </div>

      <div className="product-total rounded-lg border bg-muted/50 p-4">
        <div className="flex items-center justify-between">
          <span className="product-total-label font-medium">총 금액</span>
          <span className="product-total-value text-xl font-bold text-primary">{formatPrice(displayTotal)}</span>
        </div>
      </div>
    </>
  );
}

type SelectedOptionLineProps = {
  label: string;
  priceText: string;
  qty: number;
  minQty: number;
  /** 0 이면 위 한도 없음 */
  maxQty: number;
  onQtyChange: (qty: number) => void;
  /** 없으면 삭제 단추를 그리지 않는다(옵션 없는 상품의 본품 줄). */
  onRemove?: () => void;
};

/** 선택된 옵션 한 줄 — 영카트 #sit_opt_added li: 이름, [−][수량][+], 옵션 금액, 삭제(×). */
function SelectedOptionLine({ label, priceText, qty, minQty, maxQty, onQtyChange, onRemove }: SelectedOptionLineProps) {
  const [input, setInput] = useState(String(qty));

  useEffect(() => {
    setInput(String(qty));
  }, [qty]);

  const commitInput = () => {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || input.trim() === "") {
      setInput(String(qty));
      return;
    }
    onQtyChange(parsed);
  };

  return (
    <div className="product-selected-line relative rounded-lg border bg-background p-3">
      <p className="pr-8 text-sm font-medium break-words">{label}</p>
      {onRemove && (
        <button
          type="button"
          aria-label={`${label} 삭제`}
          onClick={onRemove}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="product-quantity-controls flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`${label} 수량 감소`}
            onClick={() => onQtyChange(qty - 1)}
            disabled={qty <= minQty}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <input
            type="number"
            min={minQty}
            max={maxQty > 0 ? maxQty : undefined}
            aria-label={`${label} 수량`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onBlur={commitInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="h-9 w-14 rounded-md border bg-background text-center text-sm outline-none"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`${label} 수량 증가`}
            onClick={() => onQtyChange(qty + 1)}
            disabled={maxQty > 0 && qty >= maxQty}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <span className="product-selected-price text-sm font-semibold">{priceText}</span>
      </div>
    </div>
  );
}

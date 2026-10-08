"use client";

import { useEffect, useId, useState, type Dispatch, type ReactNode, type SelectHTMLAttributes, type SetStateAction } from "react";
import { ChevronDown, Minus, Plus, X } from "lucide-react";
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

// 고르는 칸 — 높이 56 · 모서리 10, 위 20 은 칸 안에 뜬 이름표 자리. 기본 ▼ 를 끄고 ChevronDown 을 얹는다.
const SELECT_CLASS =
  "h-14 w-full cursor-pointer appearance-none rounded-[10px] border bg-background pb-0 pl-3.5 pr-10 pt-5 text-sm outline-none transition-colors focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

/** 묶음 제목(선택옵션 · 추가옵션 · 선택된 옵션) — 작은 글자, 넓은 자간. */
const HEADING_CLASS = "text-[11px] font-medium tracking-[0.14em] text-muted-foreground";

/**
 * 옵션 고르기 칸 하나 — 이름표를 칸 안 왼쪽 위에 작게 띄운다(레퍼런스 solune 상품 상세 .get_item_options).
 * 이름표는 누름을 그대로 아래 칸에 넘긴다(pointer-events: none) — 글자 위를 눌러도 목록이 열린다.
 */
function OptionSelectField({
  label,
  children,
  ...selectProps
}: { label: string; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className">) {
  const id = useId();
  return (
    <div className="product-option-field relative">
      <label
        htmlFor={id}
        className="product-option-label pointer-events-none absolute left-3.5 top-2.5 z-[1] text-[10px] leading-none tracking-[0.06em] text-muted-foreground"
      >
        {label}
      </label>
      <select id={id} className={SELECT_CLASS} {...selectProps}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="product-option-chevron pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

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
        <div className="product-options">
          <h3 className={`product-options-heading mb-3 ${HEADING_CLASS}`}>선택옵션</h3>
          <div className="space-y-3">
            {optionSubjects.map((subject, levelIndex) => {
              const isLastLevel = levelIndex === optionSubjects.length - 1;
              const waitingForPrevious = levelIndex > 0 && !optionSelections[levelIndex - 1];
              return (
                <OptionSelectField
                  key={levelIndex}
                  label={subject}
                  data-shop-option-select="1"
                  value={optionSelections[levelIndex] || ""}
                  disabled={waitingForPrevious}
                  onChange={(event) => onSelectOptionValue(levelIndex, event.target.value)}
                >
                  {/* 이름은 칸 안 이름표가 이미 보여 주므로 첫 항목은 "선택하세요"(레퍼런스는 코어 PHP 가 정해 이름이 두 번 보였다). */}
                  <option value="">{waitingForPrevious ? "앞 옵션을 먼저 선택하세요" : "선택하세요"}</option>
                  {getAvailableValues(levelIndex).map((item) => (
                    <option key={item.value} value={item.value} disabled={item.soldOut}>
                      {item.value}
                      {isLastLevel ? optionPriceSuffix(item.price ?? 0) : ""}
                      {item.soldOut ? "  [품절]" : ""}
                    </option>
                  ))}
                </OptionSelectField>
              );
            })}
          </div>
        </div>
      )}

      {supplyGroups.length > 0 && (
        <div className="product-supply-options">
          <h3 className={`product-options-heading mb-3 ${HEADING_CLASS}`}>추가옵션</h3>
          <div className="space-y-3">
            {supplyGroups.map((group) => (
              <OptionSelectField
                key={group.subject}
                label={group.subject}
                value={group.selectedIoId}
                onChange={(event) => onSelectSupplyOption(event.target.value)}
              >
                <option value="">선택하세요</option>
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
              </OptionSelectField>
            ))}
          </div>
        </div>
      )}

      <div className="product-selected space-y-2" aria-label="선택된 옵션">
        <p className={`product-selected-title pb-1 ${HEADING_CLASS}`} aria-hidden="true">선택된 옵션</p>
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

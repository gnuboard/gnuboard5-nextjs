"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShopProduct } from "@/lib/api";
import { toastError } from "@/lib/toast";
import {
  OPTION_SEPARATOR,
  baseOptionLabel,
  baseOptionQty,
  buyQtyLimitMessage,
  clampBuyQuantity,
  isShopOptionEnabled,
  isShopOptionPurchasable,
  productMaxBuyQty,
  productMinBuyQty,
  shopOptionStockQty,
  supplyOptionGroups,
  supplyOptionLabel,
  type SelectedCartOption,
  type SupplyOptionGroup,
} from "./productDetailHelpers";

type UseProductOptionsOptions = {
  product: ShopProduct | null;
  resetKey?: string;
};

/** 추가옵션 항목 하나 + 그 select 에 보일 값(목록에 남은 그 항목의 마지막 줄). */
export type SupplyOptionGroupView = SupplyOptionGroup & { selectedIoId: string };

/**
 * 상품 옵션 고르기 상태 — 영카트 js/shop.js · item.form.skin.php 와 같게 움직인다.
 * - 마지막 선택옵션을 고르면 그 조합이 "고른 옵션" 목록에 수량 1 로 바로 붙는다(추가 단추 없음). 고른 값은 select 에 남는다.
 * - 추가옵션은 항목마다 select 가 따로 있고, 고르면 바로 붙는다.
 * - 같은 옵션을 다시 고르면 "이미 추가하신 옵션상품입니다". 추가옵션이 있으면 선택옵션 줄은 하나 이상 남아야 한다.
 * - 옵션 없는 상품은 본품 한 줄(quantity, 최소 구매수량부터)이 목록 맨 위에 있고 지울 수 없다.
 */
export function useProductOptions({
  product,
  resetKey,
}: UseProductOptionsOptions) {
  const [quantity, setQuantity] = useState(1);
  const [optionSelections, setOptionSelections] = useState<string[]>([]);
  const [selectedCartOptions, setSelectedCartOptions] = useState<
    SelectedCartOption[]
  >([]);

  const optionSubjects = useMemo(
    () => (product?.it_option_subject || "").split(",").filter(Boolean),
    [product?.it_option_subject]
  );
  const minBuyQty = productMinBuyQty(product);
  const maxBuyQty = productMaxBuyQty(product);
  const quantityMinQty =
    optionSubjects.length > 0 ? 1 : Math.max(1, minBuyQty);

  useEffect(() => {
    setQuantity(1);
    setOptionSelections([]);
    setSelectedCartOptions([]);
  }, [resetKey]);

  useEffect(() => {
    if (!product?.it_id) return;
    setQuantity((current) =>
      clampBuyQuantity(current, quantityMinQty, maxBuyQty)
    );
  }, [product?.it_id, quantityMinQty, maxBuyQty]);

  const baseOptions = useMemo(
    () =>
      (product?.options ?? []).filter(
        (option) => Number(option.io_type) === 0 && isShopOptionEnabled(option)
      ),
    [product?.options]
  );
  const supplyOptions = useMemo(
    () =>
      (product?.options ?? []).filter(
        (option) => Number(option.io_type) === 1 && isShopOptionEnabled(option)
      ),
    [product?.options]
  );
  const supplyGroupList = useMemo(
    () => supplyOptionGroups(product?.it_supply_subject, supplyOptions),
    [product?.it_supply_subject, supplyOptions]
  );
  const supplyGroups: SupplyOptionGroupView[] = supplyGroupList.map((group) => ({
    ...group,
    selectedIoId:
      [...selectedCartOptions]
        .reverse()
        .find((item) => item.ioType === 1 && item.io_id.startsWith(group.subject + OPTION_SEPARATOR))
        ?.io_id ?? "",
  }));
  const parsedOptions = useMemo(
    () =>
      baseOptions.map((option) => ({
        ...option,
        levels: (option.io_id || "").split(OPTION_SEPARATOR),
      })),
    [baseOptions]
  );

  const getAvailableValues = useCallback(
    (
      levelIndex: number
    ): { value: string; price?: number; soldOut?: boolean }[] => {
      const filtered = parsedOptions.filter((option) => {
        for (let index = 0; index < levelIndex; index++) {
          if (option.levels[index] !== optionSelections[index]) return false;
        }
        return option.levels.length > levelIndex;
      });
      const isLastLevel = levelIndex === optionSubjects.length - 1;
      const seen = new Map<string, { price: number; soldOut: boolean }>();

      for (const option of filtered) {
        const value = option.levels[levelIndex];
        if (!value) continue;

        const item = {
          price: isLastLevel ? option.io_price : 0,
          soldOut: isLastLevel && !isShopOptionPurchasable(option),
        };
        const previous = seen.get(value);
        if (!previous || (previous.soldOut && !item.soldOut)) {
          seen.set(value, item);
        }
      }

      return Array.from(seen.entries()).map(([value, item]) => ({
        value,
        price: item.price,
        soldOut: item.soldOut,
      }));
    },
    [optionSelections, optionSubjects.length, parsedOptions]
  );

  /** 같은 줄이 이미 있으면 알리고 true — 영카트 same_option_check(). */
  const isAlreadyAdded = useCallback(
    (ioId: string, ioType: number, label: string) => {
      const exists = selectedCartOptions.some(
        (item) => item.ioType === ioType && item.io_id === ioId
      );
      if (exists) toastError(`${label} 은(는) 이미 추가하신 옵션상품입니다.`);
      return exists;
    },
    [selectedCartOptions]
  );

  /** select 하나를 고른다. 아래 단계는 비우고, 마지막 단계면 그 조합을 목록에 붙인다(영카트 sel_option_process). */
  const selectOptionValue = useCallback(
    (levelIndex: number, value: string) => {
      const next = optionSubjects.map((_, index) =>
        index < levelIndex ? optionSelections[index] ?? "" : index === levelIndex ? value : ""
      );
      setOptionSelections(next);
      if (!product || !value || levelIndex !== optionSubjects.length - 1) return;

      const ioId = next.join(OPTION_SEPARATOR);
      const option = baseOptions.find((item) => item.io_id === ioId);
      if (!option || !isShopOptionPurchasable(option)) {
        toastError("선택하신 선택옵션상품은 재고가 부족하여 구매할 수 없습니다.");
        return;
      }
      if ((product.it_price ?? 0) + option.io_price < 0) {
        toastError("구매금액이 음수인 상품은 구매할 수 없습니다.");
        return;
      }
      const label = baseOptionLabel(optionSubjects, ioId);
      if (isAlreadyAdded(ioId, 0, label)) return;
      if (maxBuyQty > 0 && baseOptionQty(selectedCartOptions) + 1 > maxBuyQty) {
        toastError(`이 상품은 최대 ${maxBuyQty}개까지 구매할 수 있습니다.`);
        return;
      }

      const line: SelectedCartOption = {
        io_id: ioId,
        label,
        qty: 1,
        price: option.io_price,
        stockQty: shopOptionStockQty(option),
        ioType: 0,
      };
      // 선택옵션 줄은 추가옵션 줄보다 앞에(영카트 add_sel_option).
      setSelectedCartOptions((previous) => [
        ...previous.filter((item) => item.ioType === 0),
        line,
        ...previous.filter((item) => item.ioType !== 0),
      ]);
    },
    [baseOptions, isAlreadyAdded, maxBuyQty, optionSelections, optionSubjects, product, selectedCartOptions]
  );

  /** 추가옵션 select 에서 고르면 바로 목록에 붙인다(영카트 sel_supply_process). */
  const selectSupplyOption = useCallback(
    (ioId: string) => {
      if (!ioId) return;
      const option = supplyOptions.find((item) => item.io_id === ioId);
      const label = supplyOptionLabel(ioId);
      if (!option || !isShopOptionPurchasable(option)) {
        toastError(`${label.split(":").slice(1).join(":")}은(는) 재고가 부족하여 구매할 수 없습니다.`);
        return;
      }
      if (option.io_price < 0) {
        toastError("구매금액이 음수인 상품은 구매할 수 없습니다.");
        return;
      }
      if (isAlreadyAdded(ioId, 1, label)) return;

      setSelectedCartOptions((previous) => [
        ...previous,
        {
          io_id: ioId,
          label,
          qty: 1,
          price: option.io_price,
          stockQty: shopOptionStockQty(option),
          ioType: 1,
        },
      ]);
    },
    [isAlreadyAdded, supplyOptions]
  );

  const updateSelectedOptionQty = useCallback(
    (ioId: string, qty: number) => {
      setSelectedCartOptions((previousOptions) =>
        previousOptions.map((item) =>
          item.io_id === ioId
            ? {
                ...item,
                qty: (() => {
                  const otherBaseQty =
                    item.ioType === 0
                      ? previousOptions.reduce(
                          (sum, current) =>
                            sum +
                            (current.ioType === 0 &&
                            current.io_id !== item.io_id
                              ? current.qty
                              : 0),
                          0
                        )
                      : 0;
                  const baseMaxQty =
                    item.ioType === 0 && maxBuyQty > 0
                      ? Math.max(1, maxBuyQty - otherBaseQty)
                      : 0;
                  const stockMaxQty = item.stockQty > 0 ? item.stockQty : 0;
                  const effectiveMaxQty =
                    baseMaxQty > 0 && stockMaxQty > 0
                      ? Math.min(baseMaxQty, stockMaxQty)
                      : baseMaxQty || stockMaxQty;

                  return effectiveMaxQty > 0
                    ? Math.min(effectiveMaxQty, Math.max(1, qty))
                    : Math.max(1, qty);
                })(),
              }
            : item
        )
      );
    },
    [maxBuyQty]
  );

  const removeSelectedOption = useCallback(
    (ioId: string) => {
      const target = selectedCartOptions.find((item) => item.io_id === ioId);
      if (!target) return;
      const baseCount = selectedCartOptions.filter((item) => item.ioType === 0).length;
      const hasSupply = selectedCartOptions.some((item) => item.ioType === 1);
      if (target.ioType === 0 && hasSupply && baseCount <= 1) {
        toastError("선택옵션은 하나이상이어야 합니다.");
        return;
      }
      setSelectedCartOptions((previous) => previous.filter((item) => item.io_id !== ioId));
      // 지운 줄이 select 에 고른 그 조합이면 마지막 단계를 비워 같은 값을 다시 고를 수 있게 한다.
      if (target.ioType === 0 && optionSelections.join(OPTION_SEPARATOR) === ioId) {
        setOptionSelections((previous) => previous.map((value, index) => (index === previous.length - 1 ? "" : value)));
      }
    },
    [optionSelections, selectedCartOptions]
  );

  /** 담은 뒤 처음 모습으로 — 고른 줄과 select 를 비운다. */
  const clearSelectedOptions = useCallback(() => {
    setSelectedCartOptions([]);
    setOptionSelections([]);
  }, []);

  /** 담을 줄 — 목록 그대로. 옵션 없는 상품의 본품 줄은 quantity 로 따로 담는다(addProductToCart). */
  const buildSelectedCartOptions = useCallback(
    () => selectedCartOptions,
    [selectedCartOptions]
  );

  const validateBuyQtyBeforeSubmit = useCallback(
    (cartOptions: SelectedCartOption[]) => {
      if (!product) return false;

      let submittedBaseQty = baseOptionQty(cartOptions);
      if (submittedBaseQty <= 0 && optionSubjects.length === 0) {
        submittedBaseQty = quantity;
      }

      const message = buyQtyLimitMessage(product, submittedBaseQty);
      if (message) {
        toastError(message);
        return false;
      }

      return true;
    },
    [optionSubjects.length, product, quantity]
  );

  const itemPrice = product?.it_price ?? 0;
  const linesTotal = selectedCartOptions.reduce(
    (sum, option) =>
      sum + (option.ioType === 1 ? option.price : itemPrice + option.price) * option.qty,
    0
  );
  const displayTotal = linesTotal + (optionSubjects.length === 0 ? itemPrice * quantity : 0);

  return {
    quantity,
    setQuantity,
    optionSelections,
    selectOptionValue,
    selectSupplyOption,
    supplyGroups,
    selectedCartOptions,
    setSelectedCartOptions,
    clearSelectedOptions,
    optionSubjects,
    minBuyQty,
    maxBuyQty,
    quantityMinQty,
    getAvailableValues,
    updateSelectedOptionQty,
    removeSelectedOption,
    buildSelectedCartOptions,
    validateBuyQtyBeforeSubmit,
    displayTotal,
  };
}

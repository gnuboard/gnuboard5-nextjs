"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShopProduct } from "@/lib/api";
import { toastError } from "@/lib/toast";
import {
  baseOptionQty,
  buyQtyLimitMessage,
  clampBuyQuantity,
  isShopOptionEnabled,
  isShopOptionPurchasable,
  productMaxBuyQty,
  productMinBuyQty,
  shopOptionStockQty,
  type SelectedCartOption,
} from "./productDetailHelpers";

type UseProductOptionsOptions = {
  product: ShopProduct | null;
  resetKey?: string;
};

export function useProductOptions({
  product,
  resetKey,
}: UseProductOptionsOptions) {
  const [quantity, setQuantity] = useState(1);
  const [optionSelections, setOptionSelections] = useState<string[]>([]);
  const [supplySelection, setSupplySelection] = useState("");
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
    setSupplySelection("");
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
  const supplyLabel =
    (product?.it_supply_subject || "").split(",").filter(Boolean).join(" / ") ||
    "추가옵션";
  const parsedOptions = useMemo(
    () =>
      baseOptions.map((option) => ({
        ...option,
        levels: (option.io_id || "").split("\x1e"),
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

  const getSelectedIoId = useCallback(() => {
    return optionSelections.filter(Boolean).join("\x1e");
  }, [optionSelections]);

  const getSelectedOption = useCallback(() => {
    if (!product?.options) return null;
    const ioId = getSelectedIoId();
    if (!ioId) return null;
    return (
      product.options.find(
        (option) =>
          Number(option.io_type) === 0 &&
          option.io_id === ioId &&
          isShopOptionPurchasable(option)
      ) ?? null
    );
  }, [product?.options, getSelectedIoId]);

  const selectedOption = getSelectedOption();
  const optionPrice = selectedOption?.io_price ?? 0;

  const handleAddSelectedOption = useCallback(() => {
    const option = getSelectedOption();
    if (!option) {
      toastError("옵션을 선택해주세요.");
      return;
    }

    if (product) {
      const message = buyQtyLimitMessage(
        product,
        baseOptionQty(selectedCartOptions) + quantity
      );
      if (message) {
        toastError(message);
        return;
      }
    }

    setSelectedCartOptions((previousOptions) => {
      const exists = previousOptions.find(
        (item) => item.io_id === option.io_id
      );
      if (exists) {
        return previousOptions.map((item) =>
          item.io_id === option.io_id
            ? { ...item, qty: item.qty + quantity }
            : item
        );
      }

      return [
        ...previousOptions,
        {
          io_id: option.io_id,
          label: option.io_id.replace(/\x1e/g, " / "),
          qty: quantity,
          price: option.io_price,
          stockQty: shopOptionStockQty(option),
          ioType: 0,
        },
      ];
    });
    setOptionSelections([]);
    setQuantity(1);
  }, [getSelectedOption, product, quantity, selectedCartOptions]);

  const handleAddSupplyOption = useCallback(() => {
    if (!product?.options) return;
    const option = product.options.find(
      (item) =>
        Number(item.io_type) === 1 &&
        item.io_id === supplySelection &&
        isShopOptionPurchasable(item)
    );
    if (!option) {
      toastError("추가옵션을 선택해주세요.");
      return;
    }

    setSelectedCartOptions((previousOptions) => {
      const exists = previousOptions.find(
        (item) => item.io_id === option.io_id && item.ioType === 1
      );
      if (exists) {
        return previousOptions.map((item) =>
          item.io_id === option.io_id && item.ioType === 1
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }

      return [
        ...previousOptions,
        {
          io_id: option.io_id,
          label: option.io_value || option.io_id,
          qty: 1,
          price: option.io_price,
          stockQty: shopOptionStockQty(option),
          ioType: 1,
        },
      ];
    });
    setSupplySelection("");
  }, [product?.options, supplySelection]);

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

  const removeSelectedOption = useCallback((ioId: string) => {
    setSelectedCartOptions((previousOptions) =>
      previousOptions.filter((item) => item.io_id !== ioId)
    );
  }, []);

  const buildSelectedCartOptions = useCallback(() => {
    const option = getSelectedOption();
    if (selectedCartOptions.length > 0) {
      const hasBaseOption = selectedCartOptions.some(
        (item) => item.ioType === 0
      );
      if (!hasBaseOption && option) {
        return [
          {
            io_id: option.io_id,
            label: option.io_id.replace(/\x1e/g, " / "),
            qty: quantity,
            price: option.io_price,
            stockQty: shopOptionStockQty(option),
            ioType: 0,
          },
          ...selectedCartOptions,
        ];
      }
      return selectedCartOptions;
    }

    if (!option) return [];

    return [
      {
        io_id: option.io_id,
        label: option.io_id.replace(/\x1e/g, " / "),
        qty: quantity,
        price: option.io_price,
        stockQty: shopOptionStockQty(option),
        ioType: 0,
      },
    ];
  }, [getSelectedOption, quantity, selectedCartOptions]);

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

  const selectedOptionsTotal = selectedCartOptions.reduce(
    (sum, option) =>
      sum +
      (option.ioType === 1
        ? option.price
        : (product?.it_price ?? 0) + option.price) *
        option.qty,
    0
  );
  const hasQueuedBaseOption = selectedCartOptions.some(
    (option) => option.ioType === 0
  );
  const pendingBaseTotal =
    selectedCartOptions.length > 0 && !hasQueuedBaseOption
      ? selectedOption
        ? ((product?.it_price ?? 0) + optionPrice) * quantity
        : optionSubjects.length === 0
          ? (product?.it_price ?? 0) * quantity
          : 0
      : 0;
  const displayTotal =
    selectedCartOptions.length > 0
      ? selectedOptionsTotal + pendingBaseTotal
      : ((product?.it_price ?? 0) + optionPrice) * quantity;

  return {
    quantity,
    setQuantity,
    optionSelections,
    setOptionSelections,
    supplySelection,
    setSupplySelection,
    selectedCartOptions,
    setSelectedCartOptions,
    optionSubjects,
    minBuyQty,
    maxBuyQty,
    quantityMinQty,
    baseOptions,
    supplyOptions,
    supplyLabel,
    getAvailableValues,
    getSelectedOption,
    selectedOption,
    optionPrice,
    handleAddSelectedOption,
    handleAddSupplyOption,
    updateSelectedOptionQty,
    removeSelectedOption,
    buildSelectedCartOptions,
    validateBuyQtyBeforeSubmit,
    displayTotal,
  };
}

"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductOptionPicker } from "@/components/shop/ProductOptionPicker";
import { useProductOptions } from "@/components/shop/useProductOptions";
import {
  baseOptionLabel,
  isProductDetailSoldOut,
  isShopOptionPurchasable,
  shopOptionStockQty,
  supplyOptionLabel,
  type SelectedCartOption,
} from "@/components/shop/productDetailHelpers";
import type { ShopCartItem, ShopProduct } from "@/lib/api";
import { isTelInquiry } from "@/lib/shop-product-state";
import { toastError } from "@/lib/toast";
import { formatCartOption } from "@/lib/utils";
import { replaceCartItemOptions } from "@/services/cart";
import { getShopProductResult } from "@/services/shop";
import type { CartGroup } from "./cartGroups";
import { CartDialogHead } from "./CartDialogHead";
import { cartOptionsError, isSameAsCart, type DesiredCartOption } from "./cartOptionPlan";

interface CartOptionDialogProps {
  group: CartGroup;
  onClose: () => void;
  /** 고친 뒤 장바구니를 다시 부른다. */
  onChanged: () => Promise<void>;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; product: ShopProduct }
  | { status: "error"; message: string };

function lineIoId(line: ShopCartItem): string {
  return line.io_id ?? line.ct_option ?? "";
}

function lineIoType(line: ShopCartItem): number {
  return Number(line.io_type ?? 0) === 1 ? 1 : 0;
}

function hasOptionSubjects(product: ShopProduct): boolean {
  return (product.it_option_subject || "").split(",").some(Boolean);
}

/**
 * 장바구니 줄을 옵션 고르기 목록의 한 줄로 — 창이 열리면 지금 담긴 옵션이 그대로 보인다(영카트 cartoption.php).
 * 그 옵션이 이제 품절이거나 없어졌으면 지금 수량보다 늘릴 수 없다(줄이거나 지우는 것은 된다).
 */
function toSelectedOption(line: ShopCartItem, product: ShopProduct): SelectedCartOption {
  const ioId = lineIoId(line);
  const ioType = lineIoType(line);
  const option = product.options?.find(
    (candidate) => candidate.io_id === ioId && Number(candidate.io_type) === ioType
  );
  // 상품 상세에서 고른 줄과 같은 이름("색상:실버 / 크기:L", "항목:값"). 옵션이 없어진 줄은 담긴 글자 그대로.
  const subjects = (product.it_option_subject || "").split(",").filter(Boolean);
  const label = option
    ? ioType === 1 ? supplyOptionLabel(ioId) : baseOptionLabel(subjects, ioId)
    : formatCartOption(line.ct_option) || line.it_name;
  return {
    io_id: ioId,
    label,
    qty: line.ct_qty,
    price: Number(line.io_price ?? 0),
    stockQty: isShopOptionPurchasable(option) ? shopOptionStockQty(option) : line.ct_qty,
    ioType,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "선택사항 수정에 실패했습니다.";
}

/**
 * 선택사항수정 — 영카트 cart.php 의 "선택사항수정"이 여는 cartoption.php 자리.
 * 옵션 · 수량은 상품 상세와 같은 ProductOptionPicker 로 고르고, 확인하면 고친 뒤의 목록을 한 번에 보낸다
 * (POST /shop/cart/options — 서버가 고친 뒤의 모습을 먼저 다 검사하고, 통과해야 달라진 줄만 고친다. 거절되면 아무것도
 * 바뀌지 않으므로 창은 고르던 그대로 남는다).
 */
export function CartOptionDialog({ group, onClose, onChanged }: CartOptionDialogProps) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const detail = load.status === "ready" ? load.product : null;
  const options = useProductOptions({ product: detail, resetKey: group.itId });
  const { setSelectedCartOptions, setQuantity } = options;

  useEffect(() => {
    let cancelled = false;
    getShopProductResult(group.itId)
      .then((result) => {
        if (cancelled) return;
        setLoad(
          result.ok
            ? { status: "ready", product: result.data }
            : { status: "error", message: result.error || "상품 정보를 불러오지 못했습니다." }
        );
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error", message: "상품 정보를 불러오지 못했습니다." });
      });
    return () => {
      cancelled = true;
    };
  }, [group.itId]);

  // 상품을 받으면 지금 담긴 줄을 채운다. 옵션 없는 상품은 본품 줄의 수량이 수량 칸이 된다.
  useEffect(() => {
    if (!detail) return;
    const withSubjects = hasOptionSubjects(detail);
    setSelectedCartOptions(
      group.lines
        .filter((line) => withSubjects || lineIoType(line) === 1)
        .map((line) => toSelectedOption(line, detail))
    );
    if (!withSubjects) {
      setQuantity(group.lines.find((line) => lineIoType(line) === 0)?.ct_qty ?? 1);
    }
    // 창을 연 때의 줄로 한 번만 채운다(그 뒤 장바구니를 다시 불러도 고르던 것을 덮지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const unavailableReason = !detail
    ? ""
    : isTelInquiry(detail)
      ? "전화문의 상품은 온라인 주문할 수 없습니다."
      : isProductDetailSoldOut(detail)
        ? "품절된 상품입니다."
        : "";

  const desiredOptions = (selected: SelectedCartOption[]): DesiredCartOption[] => {
    const picked = selected.map((option) => ({
      io_id: option.io_id,
      ioType: option.ioType === 1 ? 1 : 0,
      qty: option.qty,
    }));
    if (detail && hasOptionSubjects(detail)) return picked;
    // 옵션 없는 상품: 수량 칸이 본품 줄(io_id 없는 줄)의 수량. 옵션이 없어지기 전에 담긴 다른 본품 줄은 그대로 둔다.
    const baseLines = group.lines.filter((line) => lineIoType(line) === 0);
    const main = baseLines.find((line) => lineIoId(line) === "") ?? baseLines[0];
    const others = baseLines
      .filter((line) => line !== main)
      .map((line) => ({ io_id: lineIoId(line), ioType: 0, qty: line.ct_qty }));
    return [{ io_id: main ? lineIoId(main) : "", ioType: 0, qty: options.quantity }, ...others, ...picked];
  };

  const handleConfirm = async () => {
    if (!detail || unavailableReason || saving) return;
    const selected = options.selectedCartOptions;
    if (!options.validateBuyQtyBeforeSubmit(selected)) return;

    const desired = desiredOptions(selected);
    const error = cartOptionsError(desired);
    if (error) {
      toastError(error);
      return;
    }
    const lineRefs = group.lines.map((line) => ({
      ct_id: line.ct_id,
      io_id: lineIoId(line),
      io_type: lineIoType(line),
      ct_qty: line.ct_qty,
    }));
    if (isSameAsCart(lineRefs, desired)) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await replaceCartItemOptions(
        group.itId,
        desired.map((option) => ({ io_id: option.io_id, io_type: option.ioType, ct_qty: option.qty }))
      );
      await onChanged();
      onClose();
    } catch (err: unknown) {
      toastError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      {/* 테마가 상품 카드의 옵션 고르기 창과 같은 모양을 입히게 product-quick-add-* 손잡이를 같이 단다. */}
      <DialogContent className="product-quick-add-dialog cart-option-dialog flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <CartDialogHead group={group} kicker="선택사항수정" />

        <div className="product-quick-add-body min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {load.status === "loading" ? (
            <div className="space-y-3" aria-label="옵션을 불러오는 중">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : load.status === "error" ? (
            <p className="text-sm text-destructive" role="alert">{load.message}</p>
          ) : unavailableReason ? (
            <p className="text-sm text-muted-foreground" role="alert">
              {unavailableReason} 장바구니에서 삭제해 주세요.
            </p>
          ) : (
            <ProductOptionPicker
              productName={detail?.it_name ?? group.item.it_name}
              optionSubjects={options.optionSubjects}
              optionSelections={options.optionSelections}
              onSelectOptionValue={options.selectOptionValue}
              getAvailableValues={options.getAvailableValues}
              supplyGroups={options.supplyGroups}
              onSelectSupplyOption={options.selectSupplyOption}
              quantity={options.quantity}
              onQuantityChange={options.setQuantity}
              quantityMinQty={options.quantityMinQty}
              minBuyQty={options.minBuyQty}
              maxBuyQty={options.maxBuyQty}
              selectedCartOptions={options.selectedCartOptions}
              onUpdateSelectedOptionQty={options.updateSelectedOptionQty}
              onRemoveSelectedOption={options.removeSelectedOption}
              displayTotal={options.displayTotal}
            />
          )}
        </div>

        <DialogFooter className="product-quick-add-foot flex-row gap-2 border-t p-4 sm:justify-stretch">
          <Button variant="outline" className="product-quick-add-detail flex-1" onClick={onClose} disabled={saving}>
            닫기
          </Button>
          <Button
            className="product-quick-add-submit flex-1 gap-1.5"
            onClick={handleConfirm}
            disabled={!detail || Boolean(unavailableReason) || saving}
            aria-busy={saving || undefined}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

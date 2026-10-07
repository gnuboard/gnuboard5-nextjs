"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import type { BbsRewriteMode } from "@/lib/board-url";
import { shouldBypassImageOptimization } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import { formatPrice } from "@/lib/utils";
import { formatCartLineOption, type CartGroup } from "./cartGroups";

interface CartTableProps {
  groups: CartGroup[];
  selected: ReadonlySet<string>;
  onToggle: (itId: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  productRewriteMode: BbsRewriteMode;
  canUseCoupons: boolean;
  onEditOptions: (itId: string) => void;
  onOpenCoupons: (itId: string) => void;
}

const CHECKBOX_CLASS = "cart-check h-[18px] w-[18px] cursor-pointer accent-primary";

function formatCount(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

/** 숫자 칸 — 넓은 화면은 표의 한 칸, 폰에서는 "이름 … 값" 한 줄. */
function StatCell({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <td
      className={`cart-cell-stat col-start-2 flex items-center justify-between py-0.5 text-[13px] md:table-cell md:border-l md:py-6 md:text-center md:align-middle ${className}`}
    >
      <span className="text-muted-foreground md:hidden">{label}</span>
      <span>{children}</span>
    </td>
  );
}

function CartThumb({ group, href }: { group: CartGroup; href: string }) {
  const { item } = group;
  return (
    <a
      href={href}
      className="cart-item-thumb relative block h-20 w-20 flex-none overflow-hidden rounded-md border bg-muted"
      tabIndex={-1}
      aria-hidden
    >
      {item.image_url ? (
        <Image
          src={item.image_url}
          alt=""
          fill
          className="object-cover"
          sizes="80px"
          unoptimized={shouldBypassImageOptimization(item.image_url)}
        />
      ) : (
        <ProductImageFallback compact />
      )}
    </a>
  );
}

function CartRow({
  group,
  checked,
  onToggle,
  productRewriteMode,
  canUseCoupons,
  onEditOptions,
  onOpenCoupons,
}: {
  group: CartGroup;
  checked: boolean;
} & Omit<CartTableProps, "groups" | "selected" | "onToggleAll">) {
  const { item } = group;
  const href = shopProductHref(item, productRewriteMode);

  return (
    <tr className="cart-row grid grid-cols-[auto_1fr] gap-x-3 border-b py-4 md:table-row md:py-0">
      <td className="cart-cell-check pt-1 md:table-cell md:w-12 md:py-6 md:text-center md:align-middle">
        <input
          type="checkbox"
          className={CHECKBOX_CLASS}
          checked={checked}
          onChange={(event) => onToggle(group.itId, event.target.checked)}
          aria-label={`${item.it_name} 선택`}
        />
      </td>
      <td className="cart-cell-product pb-2 md:table-cell md:py-6 md:pr-4">
        <div className="flex gap-4">
          <CartThumb group={group} href={href} />
          <div className="min-w-0 flex-1">
            <a href={href} className="cart-item-name font-semibold leading-snug hover:text-primary">
              {item.it_name}
            </a>
            <ul className="cart-options mt-2 space-y-1">
              {group.lines.map((line) => (
                <li key={line.ct_id} className="cart-option flex items-start gap-1.5 text-[13px] text-muted-foreground">
                  <span className="cart-option-badge mt-px flex-none rounded-sm border border-primary/40 px-1 text-[11px] leading-4 text-primary">
                    옵션
                  </span>
                  <span className="min-w-0 break-words">{formatCartLineOption(line)}</span>
                </li>
              ))}
            </ul>
            <div className="cart-item-actions mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cart-option-edit h-8 px-2.5 text-xs"
                onClick={() => onEditOptions(group.itId)}
              >
                선택사항수정
              </Button>
              {canUseCoupons && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="cart-coupon-open h-8 px-2.5 text-xs"
                  onClick={() => onOpenCoupons(group.itId)}
                >
                  쿠폰적용
                </Button>
              )}
              {group.couponDiscount > 0 && (
                <span className="cart-coupon-applied text-xs text-green-700">
                  쿠폰 할인 -{formatPrice(group.couponDiscount)}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <StatCell label="총수량">{formatCount(group.totalQty)}</StatCell>
      <StatCell label="판매가">{formatPrice(group.salePrice)}</StatCell>
      <StatCell label="포인트">{formatCount(group.point)}</StatCell>
      <StatCell label="배송비">
        <span data-shop-cart-send-cost-label="1">{group.shippingLabel}</span>
      </StatCell>
      <StatCell label="소계" className="cart-cell-subtotal font-bold md:text-right md:pr-2 md:text-[15px]">
        {formatPrice(group.subtotal)}
      </StatCell>
    </tr>
  );
}

/**
 * 장바구니 표 — 영카트 cart.php 의 칸 그대로: 선택 · 상품명(옵션 목록 · 선택사항수정) · 총수량 · 판매가 · 포인트 · 배송비 · 소계.
 * 폰에서는 상품마다 한 덩어리로 쌓고 숫자는 "이름 … 값" 줄로 보인다. 테마는 cart-* 손잡이로 모양을 입힌다.
 */
export function CartTable({ groups, selected, onToggle, onToggleAll, ...rowProps }: CartTableProps) {
  const allChecked = groups.length > 0 && groups.every((group) => selected.has(group.itId));

  return (
    <>
      {groups.length > 0 && (
        <label className="cart-select-all-mobile flex items-center gap-2 border-b py-3 text-sm md:hidden">
          <input
            type="checkbox"
            className={CHECKBOX_CLASS}
            checked={allChecked}
            onChange={(event) => onToggleAll(event.target.checked)}
          />
          전체선택 ({selected.size}/{groups.length})
        </label>
      )}
      <table className="cart-table block w-full border-collapse border-t-2 border-foreground text-sm md:table">
        <caption className="sr-only">장바구니 상품 목록</caption>
        <thead className="cart-table-head hidden border-b md:table-header-group">
          <tr>
            <th scope="col" className="w-12 py-4 text-center">
              <input
                type="checkbox"
                className={CHECKBOX_CLASS}
                checked={allChecked}
                disabled={groups.length === 0}
                onChange={(event) => onToggleAll(event.target.checked)}
                aria-label="장바구니 상품 전체선택"
              />
            </th>
            <th scope="col" className="py-4 text-center font-semibold">상품명</th>
            <th scope="col" className="w-20 py-4 text-center font-semibold">총수량</th>
            <th scope="col" className="w-28 py-4 text-center font-semibold">판매가</th>
            <th scope="col" className="w-20 py-4 text-center font-semibold">포인트</th>
            <th scope="col" className="w-20 py-4 text-center font-semibold">배송비</th>
            <th scope="col" className="w-32 py-4 text-center font-semibold">소계</th>
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {groups.length === 0 ? (
            <tr className="block md:table-row">
              <td colSpan={7} className="cart-empty block border-b py-16 text-center text-sm text-muted-foreground md:table-cell">
                <span className="cart-empty-text">장바구니에 담긴 상품이 없습니다.</span>
              </td>
            </tr>
          ) : (
            groups.map((group) => (
              <CartRow
                key={group.itId}
                group={group}
                checked={selected.has(group.itId)}
                onToggle={onToggle}
                {...rowProps}
              />
            ))
          )}
        </tbody>
      </table>
    </>
  );
}

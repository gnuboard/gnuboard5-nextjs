"use client";

import Image from "next/image";
import { G5Link as Link } from "@/components/ui/g5-link";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import type { ShopOrder } from "@/lib/api";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  "주문": { label: "입금확인중", variant: "bg-amber-100 text-amber-700" },
  "입금": { label: "입금완료", variant: "bg-blue-100 text-blue-700" },
  "준비": { label: "상품준비중", variant: "bg-gray-100 text-gray-700" },
  "배송": { label: "상품배송", variant: "bg-indigo-100 text-indigo-700" },
  "완료": { label: "배송완료", variant: "bg-green-100 text-green-700" },
  "취소": { label: "주문취소", variant: "bg-red-100 text-red-700" },
  "입금대기": { label: "입금확인중", variant: "bg-amber-100 text-amber-700" },
  "결제완료": { label: "입금완료", variant: "bg-blue-100 text-blue-700" },
  "배송준비": { label: "상품준비중", variant: "bg-gray-100 text-gray-700" },
  "배송중": { label: "상품배송", variant: "bg-indigo-100 text-indigo-700" },
  "배송완료": { label: "배송완료", variant: "bg-green-100 text-green-700" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_MAP[status] ?? {
    label: status || "주문취소",
    variant: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.variant
      )}
    >
      {config.label}
    </span>
  );
}

function orderListPrice(order: ShopOrder) {
  return (
    order.od_list_price ??
    order.od_order_price ??
    Math.max(
      0,
      (order.od_cart_price ?? 0) +
        (order.od_send_cost ?? 0) +
        (order.od_send_cost2 ?? 0)
    )
  );
}

function orderMisuPrice(order: ShopOrder) {
  return order.od_misu ?? order.od_misu_price ?? 0;
}

export function ShopOrderListCard({ order }: { order: ShopOrder }) {
  const firstItem = order.items?.[0];
  const itemCount = order.od_cart_count ?? order.item_count ?? order.items?.length ?? 0;
  const itemTitle = firstItem
    ? `${firstItem.it_name}${itemCount > 1 ? ` 외 ${itemCount - 1}건` : ""}`
    : `상품 ${itemCount.toLocaleString()}건`;
  const dateText = order.od_time || order.od_receipt_time;
  const listPrice = orderListPrice(order);
  const misuPrice = orderMisuPrice(order);

  return (
    <Link
      href={`/shop/orders/${order.od_id}`}
      className="order-card flex gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50 sm:p-5"
    >
      <div className="order-card-thumb relative hidden h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted sm:block">
        {firstItem?.image_url ? (
          <Image
            src={firstItem.image_url}
            alt={firstItem.it_name}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <ProductImageFallback compact />
        )}
      </div>

      <div className="order-card-body min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{order.od_id}</span>
          <StatusBadge status={order.od_status} />
          <span className="text-xs text-muted-foreground">
            상품수 {itemCount.toLocaleString()}개
          </span>
        </div>

        <div className="space-y-1">
          <p className="truncate text-sm font-medium">{itemTitle}</p>
          <p className="text-xs text-muted-foreground">
            주문일시: {dateText ? formatDate(dateText) : "-"}
          </p>
        </div>

        <div className="order-card-amounts grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-md bg-muted/35 p-2">
            <p className="text-muted-foreground">주문금액</p>
            <p className="mt-0.5 font-semibold">{formatPrice(listPrice)}</p>
          </div>
          <div className="rounded-md bg-muted/35 p-2">
            <p className="text-muted-foreground">입금액</p>
            <p className="mt-0.5 font-semibold">
              {formatPrice(order.od_receipt_price)}
            </p>
          </div>
          <div className="rounded-md bg-muted/35 p-2">
            <p className="text-muted-foreground">미입금액</p>
            <p
              className={cn(
                "mt-0.5 font-semibold",
                misuPrice > 0 && "text-red-600"
              )}
            >
              {formatPrice(misuPrice)}
            </p>
          </div>
        </div>
      </div>

      <div className="order-card-go flex shrink-0 items-center">
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </div>
    </Link>
  );
}

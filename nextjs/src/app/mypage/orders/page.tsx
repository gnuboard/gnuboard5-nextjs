"use client";

import { useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { ShopOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { getMyOrders } from "@/services/member";
import { ShopOrderListCard } from "@/components/shop/ShopOrderListCard";
import { useAuthStore } from "@/store/auth";

export default function MyOrdersPage() {
  const userId = useAuthStore((state) => state.user?.mb_id ?? "");
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [userId]);

  useEffect(() => {
    let alive = true;

    const loadOrders = async () => {
      setLoading(true);
      try {
        const result = await getMyOrders(page, 10);
        if (!alive) return;
        setOrders(result.orders);
        setTotalPages(result.totalPages);
      } catch {
        if (!alive) return;
        setOrders([]);
        setTotalPages(1);
      } finally {
        if (alive) setLoading(false);
      }
    };
    loadOrders();

    return () => {
      alive = false;
    };
  }, [page, userId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border py-20">
        <Package className="mb-4 h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-xl font-bold">주문 내역이 없습니다</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          첫 주문을 해보세요
        </p>
        <Button className="mt-6" asChild>
          <Link href="/shop/products">쇼핑하러 가기</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold">주문 내역</h2>

      <div className="space-y-4">
        {orders.map((order) => (
          <ShopOrderListCard key={order.od_id} order={order} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            이전
          </Button>
          <span className="flex items-center px-3 text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}

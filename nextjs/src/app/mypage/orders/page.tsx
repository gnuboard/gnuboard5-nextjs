"use client";

import { useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { ShopOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { getMyOrders } from "@/services/member";
import { ShopOrderListCard } from "@/components/shop/ShopOrderListCard";
import { useAuthStore } from "@/store/auth";
import { MypagePanel } from "../MypagePanel";

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

  return (
    <MypagePanel title="주문 내역">
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-lg" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="mb-4 h-14 w-14 text-muted-foreground/50" />
          <p className="text-lg font-medium">주문 내역이 없습니다</p>
          <p className="mt-1 text-sm text-muted-foreground">첫 주문을 해보세요</p>
          <Button className="mt-6" asChild>
            <Link href="/shop/products">쇼핑하러 가기</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <ShopOrderListCard key={order.od_id} order={order} />
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex justify-center gap-2">
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
    </MypagePanel>
  );
}

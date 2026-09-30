"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { G5Link as Link } from "@/components/ui/g5-link";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { ShopOrder } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Package, Search } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { toastError, toastSuccess } from "@/lib/toast";
import { getMyOrders, lookupGuestOrder } from "@/services/member";
import { ShopOrderListCard } from "@/components/shop/ShopOrderListCard";

export default function OrdersPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const userId = user?.mb_id ?? "";
  const lastUserIdRef = useRef(userId);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [lookupOrderId, setLookupOrderId] = useState("");
  const [lookupPassword, setLookupPassword] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (!isInitialized) return;

    if (lastUserIdRef.current !== userId) {
      lastUserIdRef.current = userId;
      if (page !== 1) {
        setPage(1);
        if (!user) {
          setOrders([]);
          setTotalPages(1);
          setLoading(false);
        }
        return;
      }
    }

    if (!user) {
      setOrders([]);
      setTotalPages(1);
      setLoading(false);
      return;
    }

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
        toastError("로그인이 필요합니다.");
        runtimeRouterPush(router, "/shop/login?redirect=%2Fshop%2Forders");
      } finally {
        if (alive) setLoading(false);
      }
    };
    loadOrders();

    return () => {
      alive = false;
    };
  }, [isInitialized, page, router, user, userId]);

  const handleGuestLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const orderId = lookupOrderId.trim();
    const password = lookupPassword.trim();
    if (!orderId || !password) {
      toastError("주문번호와 주문 비밀번호를 입력해주세요.");
      return;
    }

    setLookupLoading(true);
    try {
      const result = await lookupGuestOrder(orderId, password);
      toastSuccess("주문 정보를 확인했습니다.");
      runtimeRouterPush(
        router,
        result.redirect_url ??
          `/shop/orders/${encodeURIComponent(result.od_id)}?uid=${encodeURIComponent(result.uid)}`
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "주문 정보를 찾을 수 없습니다.";
      toastError(message);
    } finally {
      setLookupLoading(false);
    }
  };

  if (!isInitialized || loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "주문조회" }]} />
        <div className="mx-auto max-w-xl py-8">
          <div className="rounded-lg border p-6 sm:p-8">
            <div className="mb-6 text-center">
              <Search className="mx-auto mb-3 h-10 w-10 text-primary" />
              <h1 className="text-2xl font-bold">비회원 주문조회</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                주문번호와 주문 시 입력한 비밀번호를 입력해주세요.
              </p>
            </div>
            <form className="space-y-4" onSubmit={handleGuestLookup}>
              <div>
                <label className="mb-1 block text-sm font-medium">주문번호</label>
                <input
                  id="guest-order-id"
                  name="od_id"
                  aria-label="주문번호"
                  type="text"
                  value={lookupOrderId}
                  onChange={(event) => setLookupOrderId(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="off"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">주문 비밀번호</label>
                <input
                  id="guest-order-password"
                  name="od_pwd"
                  aria-label="주문 비밀번호"
                  type="password"
                  value={lookupPassword}
                  onChange={(event) => setLookupPassword(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="current-password"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  영문/숫자 3자리 이상으로 입력했던 비밀번호입니다.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={lookupLoading}>
                {lookupLoading ? "확인 중..." : "주문조회"}
              </Button>
            </form>
            <div className="mt-6 border-t pt-4 text-center text-sm text-muted-foreground">
              회원 주문은 로그인 후 마이페이지에서도 확인할 수 있습니다.
              <Button variant="link" className="ml-1 h-auto p-0" asChild>
                <Link href="/shop/login?redirect=%2Fshop%2Forders">로그인</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Package className="mb-4 h-16 w-16 text-muted-foreground/50" />
        <h1 className="text-xl font-bold">주문 내역이 없습니다</h1>
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
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "주문 내역" }]} />
      <h1 className="mb-6 text-2xl font-bold">주문 내역</h1>

      <div className="space-y-4">
        {orders.map((order) => (
          <ShopOrderListCard key={order.od_id} order={order} />
        ))}
      </div>

      {/* Pagination */}
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

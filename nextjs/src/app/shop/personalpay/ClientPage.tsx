"use client";

import { useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { api } from "@/lib/api";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { formatDate, formatPrice } from "@/lib/utils";
import { CreditCard } from "lucide-react";

interface PersonalPayItem {
  pp_id: string;
  pp_name: string;
  pp_content: string;
  pp_price: number;
  pp_time?: string;
}

interface PersonalPayMeta {
  total: number;
  current_page: number;
  last_page: number;
}

export default function PersonalPayListPage() {
  const [items, setItems] = useState<PersonalPayItem[]>([]);
  const [meta, setMeta] = useState<PersonalPayMeta>({
    total: 0,
    current_page: 1,
    last_page: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    applyClientPageMetadata({
      title: "개인결제",
      description: "운영자가 발급한 개인결제 목록을 확인하고 결제를 진행하세요.",
      path: "/shop/personalpay",
    });
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    api
      .get<PersonalPayItem[]>("/shop/personalpay", {
        params: { page, per_page: 25 },
      })
      .then((res) => {
        if (!alive) return;
        setItems(Array.isArray(res.data) ? res.data : []);
        setMeta({
          total: Number(res.meta?.total ?? 0),
          current_page: Number(res.meta?.current_page ?? page),
          last_page: Number(res.meta?.last_page ?? 1),
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setItems([]);
        setMeta({ total: 0, current_page: 1, last_page: 1 });
        setError(err instanceof Error ? err.message : "개인결제 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [page]);

  return (
    <div>
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "개인결제" }]} />

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">개인결제</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            운영자가 발급한 미결제 개인결제 목록입니다.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          총 {meta.total.toLocaleString("ko-KR")}건
        </p>
      </div>

      {loading ? (
        <div role="status" aria-label="개인결제 내역 로딩 중" className="space-y-4 py-4">
          <span className="sr-only">개인결제 내역 로딩 중</span>
          <div aria-hidden="true" className="skeleton h-8 w-40 rounded" />
          {[0, 1, 2].map((item) => <div key={item} aria-hidden="true" className="skeleton h-16 rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border p-10 text-center">
          <CreditCard className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="font-medium">등록된 개인결제가 없습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            결제가 필요한 경우 운영자가 발급한 링크로 접속해 주세요.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.pp_id}
              className="rounded-lg border bg-background p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">
                    {item.pp_name}님 개인결제
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    결제번호 {item.pp_id}
                  </p>
                </div>
                <CreditCard className="h-5 w-5 shrink-0 text-primary" />
              </div>

              {item.pp_content && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {item.pp_content}
                </p>
              )}

              <div className="mt-5">
                <p className="text-xs text-muted-foreground">결제 금액</p>
                <p className="mt-1 text-2xl font-extrabold text-primary">
                  {formatPrice(item.pp_price)}
                </p>
                {item.pp_time && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    발급일 {formatDate(item.pp_time)}
                  </p>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/shop/personalpay/${encodeURIComponent(item.pp_id)}`}>
                    상세
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href={`/shop/personalpay/${encodeURIComponent(item.pp_id)}/pay`}>
                    결제하기
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {meta.last_page > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            이전
          </Button>
          <span className="flex items-center px-3 text-sm text-muted-foreground">
            {meta.current_page} / {meta.last_page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.last_page}
            onClick={() => setPage((value) => Math.min(meta.last_page, value + 1))}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}

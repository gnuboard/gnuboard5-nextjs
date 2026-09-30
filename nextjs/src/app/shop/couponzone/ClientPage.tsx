"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { formatPrice } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toast";
import { useAuthStore } from "@/store/auth";
import { G5Link as Link } from "@/components/ui/g5-link";
import { Ticket, CalendarDays, ShoppingBag, CheckCircle2, Coins } from "lucide-react";

interface CouponZoneEntry {
  cz_id: number;
  cz_type: number;
  cz_point: number;
  cz_subject: string;
  cz_start: string;
  cz_end: string;
  cz_file?: string;
  cz_period: number;
  cz_download?: number;
  cp_method: number;
  cp_target?: string;
  cp_type: number;       // 0 정액, 1 정률
  cp_price: number;
  cp_minimum: number;
  cp_maximum: number;
  cp_trunc: number;
  image_url?: string;
  target_label?: string;
  target_name?: string;
  target_href?: string;
  downloaded: boolean;
}

export default function CouponZonePage() {
  const { user } = useAuthStore();
  const [zones, setZones] = useState<CouponZoneEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    applyClientPageMetadata({
      title: "쿠폰존",
      description: "다운로드 가능한 쇼핑몰 쿠폰을 확인하세요.",
      path: "/shop/couponzone",
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.get<CouponZoneEntry[]>("/shop/coupons/zone");
      setZones((res.data as CouponZoneEntry[]) ?? []);
    } catch {
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async (cz_id: number) => {
    if (!user) {
      toastError("로그인이 필요합니다.");
      return;
    }
    setDownloadingId(cz_id);
    try {
      await api.post("/shop/coupons/download", { cz_id });
      toastSuccess("쿠폰이 발급되었습니다.");
      // 받은 상태 갱신 — 전체 다시 불러오기 (다운로드 카운트도 반영).
      setRefreshing(true);
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "쿠폰 다운로드에 실패했습니다.";
      toastError(message);
    } finally {
      setRefreshing(false);
      setDownloadingId(null);
    }
  };

  const downloadZones = zones.filter((zone) => zone.cz_type === 0);
  const pointZones = zones.filter((zone) => zone.cz_type !== 0);

  const renderCouponGrid = (items: CouponZoneEntry[], emptyText: string) => {
    if (items.length === 0) {
      return <p className="py-8 text-sm text-muted-foreground">{emptyText}</p>;
    }

    return (
      <div className="coupon-list grid gap-3 sm:grid-cols-2">
        {items.map((z) => {
          const isPercent = z.cp_type === 1;
          const isPointCoupon = z.cz_type !== 0 && z.cz_point > 0;
          const valueText = isPercent
            ? `${z.cp_price}%`
            : formatPrice(z.cp_price);
          const pointCostText = `${z.cz_point.toLocaleString()}P`;
          const targetText = z.target_name || z.target_label || "";
          return (
            <div
              key={z.cz_id}
              className="coupon-card flex overflow-hidden rounded-lg border border-primary/20 bg-background shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="coupon-visual relative flex w-36 flex-shrink-0 items-center justify-center overflow-hidden border-r border-dashed border-primary/30 bg-primary/5 sm:w-40">
                {z.image_url ? (
                  <img
                    src={z.image_url}
                    alt={z.cz_subject}
                    className="h-full min-h-36 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="coupon-visual-amount flex h-full min-h-36 w-full flex-col items-center justify-center p-4 text-center">
                    <span className="text-2xl font-extrabold leading-none text-primary">
                      {isPercent ? z.cp_price : formatPrice(z.cp_price).replace("원", "")}
                    </span>
                    <span className="mt-1 text-xs font-medium text-primary">
                      {isPercent ? "% 할인" : "원 할인"}
                    </span>
                  </div>
                )}
              </div>

              <div className="coupon-body flex min-w-0 flex-1 flex-col justify-center gap-2 p-4">
                <div className="coupon-head">
                  <p className="coupon-kind text-xs font-semibold text-primary">
                    {z.target_label || (z.cp_method === 3 ? "배송비할인" : "주문금액할인")}
                  </p>
                  <h3 className="coupon-title mt-1 text-sm font-semibold leading-snug">
                    {z.cz_subject}
                  </h3>
                </div>

                <div className="coupon-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    다운로드 후 {z.cz_period.toLocaleString()}일
                  </span>
                  {z.cp_minimum > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <ShoppingBag className="h-3 w-3" />
                      {formatPrice(z.cp_minimum)} 이상
                    </span>
                  )}
                  {targetText && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      적용:
                      {z.target_href ? (
                        <a
                          href={z.target_href}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-primary hover:underline"
                        >
                          {targetText}
                        </a>
                      ) : (
                        <span className="truncate">{targetText}</span>
                      )}
                    </span>
                  )}
                  {isPointCoupon && (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <Coins className="h-3 w-3" />
                      {pointCostText} 차감
                    </span>
                  )}
                </div>

                <div className="coupon-value flex flex-wrap items-center gap-2 pt-1">
                  <span className="coupon-value-amount text-lg font-extrabold text-primary">
                    {valueText}
                  </span>
                  {z.cp_maximum > 0 && isPercent && (
                    <span className="text-xs text-muted-foreground">
                      최대 {formatPrice(z.cp_maximum)}
                    </span>
                  )}
                </div>

                <div className="coupon-action pt-1">
                  {z.downloaded ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="gap-1"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      받기 완료
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleDownload(z.cz_id)}
                      disabled={refreshing || downloadingId === z.cz_id}
                    >
                      {downloadingId === z.cz_id
                        ? "발급 중..."
                        : isPointCoupon
                          ? `${pointCostText}로 받기`
                          : "쿠폰다운로드"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="couponzone-page">
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "쿠폰존" }]} />
      <h1 className="couponzone-title mb-6 text-2xl font-bold">쿠폰존</h1>
      <p className="couponzone-intro mb-6 text-sm text-muted-foreground">
        받기 버튼을 누르면 내 쿠폰함으로 발급됩니다.{" "}
        <Link href="/mypage/coupons" className="link link-primary">
          보유 쿠폰함 →
        </Link>
      </p>
      {refreshing && (
        <p className="mb-4 text-sm text-muted-foreground">쿠폰 목록을 갱신하고 있습니다...</p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : zones.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Ticket className="mb-4 h-16 w-16 text-muted-foreground/40" />
          <p>현재 다운로드 가능한 쿠폰이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="coupon-section">
            <h2 className="text-lg font-bold">다운로드 쿠폰</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              회원이시라면 쿠폰 다운로드 후 바로 사용하실 수 있습니다.
            </p>
            <div className="mt-4">
              {renderCouponGrid(downloadZones, "사용할 수 있는 다운로드 쿠폰이 없습니다.")}
            </div>
          </section>

          <section className="coupon-section">
            <h2 className="text-lg font-bold">포인트 쿠폰</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              보유하신 회원 포인트를 쿠폰으로 교환하실 수 있습니다.
            </p>
            <div className="mt-4">
              {renderCouponGrid(pointZones, "사용할 수 있는 포인트 쿠폰이 없습니다.")}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

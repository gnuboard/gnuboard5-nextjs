"use client";

import { useEffect, useState } from "react";
import { getMyCoupons } from "@/services/member";
import type { Coupon } from "@/lib/schemas";
import { formatPrice, cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Ticket, CalendarDays, ShoppingBag } from "lucide-react";

function isExpired(endDate: string): boolean {
  if (!endDate) return false;
  return new Date(endDate) < new Date();
}

function formatDiscount(coupon: Coupon): string {
  if (coupon.cp_method === "1") {
    return `${coupon.cp_price}%`;
  }
  return formatPrice(coupon.cp_price);
}

function CouponCard({ coupon }: { coupon: Coupon }) {
  const expired = isExpired(coupon.cp_end) || coupon.cp_used !== "";
  const isPercent = coupon.cp_method === "1";

  return (
    <div
      className={cn(
        "mypage-coupon flex overflow-hidden rounded-xl border transition-shadow",
        expired
          ? "border-muted bg-muted/30 opacity-60"
          : "border-primary/20 bg-background shadow-sm hover:shadow-md"
      )}
    >
      {/* Left: Discount value area (ticket stub style) */}
      <div
        className={cn(
          "mypage-coupon-stub flex w-28 flex-shrink-0 flex-col items-center justify-center border-r border-dashed p-4",
          expired
            ? "border-muted-foreground/20 bg-muted/50"
            : "border-primary/30 bg-primary/5"
        )}
      >
        <span
          className={cn(
            "mypage-coupon-amount text-2xl font-extrabold leading-none",
            expired ? "text-muted-foreground" : "text-primary"
          )}
        >
          {formatDiscount(coupon).replace("원", "")}
        </span>
        <span
          className={cn(
            "mt-1 text-xs font-medium",
            expired ? "text-muted-foreground" : "text-primary"
          )}
        >
          {isPercent ? "% 할인" : "원 할인"}
        </span>
      </div>

      {/* Right: Coupon details */}
      <div className="flex flex-1 flex-col justify-center gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">
            {coupon.cp_subject}
          </h3>
          <Badge
            variant={expired ? "secondary" : "default"}
            className={cn(
              "flex-shrink-0 text-[10px]",
              expired ? "" : "bg-green-600 hover:bg-green-600"
            )}
          >
            {coupon.cp_used ? "사용완료" : expired ? "만료됨" : "사용 가능"}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {coupon.cp_end ? `~${coupon.cp_end.slice(0, 10)}` : "기한 없음"}
          </span>
          {coupon.cp_minimum > 0 && (
            <span className="inline-flex items-center gap-1">
              <ShoppingBag className="h-3 w-3" />
              {formatPrice(coupon.cp_minimum)} 이상
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-12">
      <Ticket className="mb-4 h-16 w-16 text-muted-foreground/40" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

export default function MyCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCoupons = async () => {
      try {
        setCoupons(await getMyCoupons());
      } catch {
        setCoupons([]);
      } finally {
        setLoading(false);
      }
    };
    loadCoupons();
  }, []);

  const availableCoupons = coupons.filter(
    (c) => !isExpired(c.cp_end) && c.cp_used === ""
  );
  const expiredCoupons = coupons.filter(
    (c) => isExpired(c.cp_end) || c.cp_used !== ""
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-purple-600" />
            쿠폰함
          </CardTitle>
          {!loading && coupons.length > 0 && (
            <span className="text-sm text-muted-foreground">
              사용 가능{" "}
              <strong className="text-primary">
                {availableCoupons.length}
              </strong>
              장
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton h-20 rounded-xl"
              />
            ))}
          </div>
        ) : coupons.length === 0 ? (
          <EmptyState message="보유 중인 쿠폰이 없습니다" />
        ) : (
          <Tabs defaultValue="available">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="available" className="flex-1">
                사용 가능 ({availableCoupons.length})
              </TabsTrigger>
              <TabsTrigger value="expired" className="flex-1">
                만료/사용완료 ({expiredCoupons.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="available">
              {availableCoupons.length === 0 ? (
                <EmptyState message="사용 가능한 쿠폰이 없습니다" />
              ) : (
                <div className="space-y-3">
                  {availableCoupons.map((coupon) => (
                    <CouponCard key={coupon.cp_id} coupon={coupon} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="expired">
              {expiredCoupons.length === 0 ? (
                <EmptyState message="만료된 쿠폰이 없습니다" />
              ) : (
                <div className="space-y-3">
                  {expiredCoupons.map((coupon) => (
                    <CouponCard key={coupon.cp_id} coupon={coupon} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

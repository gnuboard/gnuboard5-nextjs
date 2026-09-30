"use client";

import { useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { AlertCircle, ArrowLeft, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useRuntimeRouteParam } from "@/hooks/use-runtime-route-param";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { g5BaseUrlForRuntime } from "@/lib/config";
import { formatDate, formatPrice } from "@/lib/utils";

interface PersonalPay {
  pp_id: string;
  pp_name: string;
  pp_email?: string;
  pp_hp?: string;
  pp_content: string;
  pp_price: number;
  pp_settle_case: string;
  pp_bank_account: string;
  pp_deposit_name: string;
  pp_time?: string;
  already_paid: boolean;
  payment_in_progress?: boolean;
  payment_state?: string;
  payment_state_label?: string;
  can_pay?: boolean;
  payment_block_reason?: string;
}

interface PersonalPayStart {
  pp_id: string;
  payment_path?: string;
  payment_url: string;
  legacy_payment_url?: string;
  can_pay: boolean;
  payment_block_reason?: string;
}

export default function PersonalPayPaymentPage() {
  const ppId = useRuntimeRouteParam("pp_id", "/shop/personalpay/:pp_id/pay");
  const [pp, setPp] = useState<PersonalPay | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [startError, setStartError] = useState("");

  useEffect(() => {
    if (!ppId) {
      setPp(null);
      setError("");
      setLoading(true);
      return;
    }

    let alive = true;
    setLoading(true);
    setError("");
    setStartError("");

    api
      .get<PersonalPay>(`/shop/personalpay/${encodeURIComponent(ppId)}`)
      .then((res) => {
        if (alive) setPp((res.data as PersonalPay) ?? null);
      })
      .catch((err: unknown) => {
        if (alive) {
          setPp(null);
          setError(err instanceof Error ? err.message : "개인결제 정보를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [ppId]);

  const startPayment = async () => {
    if (!pp?.pp_id || starting) return;

    setStarting(true);
    setStartError("");

    try {
      const res = await api.post<PersonalPayStart>(
        `/shop/personalpay/${encodeURIComponent(pp.pp_id)}/start`
      );
      const paymentPath = String(res.data?.payment_path || "").trim();
      const paymentUrl = paymentPath
        ? new URL(paymentPath, g5BaseUrlForRuntime()).toString()
        : String(res.data?.payment_url || res.data?.legacy_payment_url || "").trim();
      if (!paymentUrl) {
        throw new Error("결제 이동 URL을 받지 못했습니다.");
      }
      window.location.href = paymentUrl;
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "결제 준비 중 오류가 발생했습니다.");
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-8">
        <div className="skeleton h-8 w-44 rounded" />
        <div className="skeleton mt-4 h-72 rounded-lg" />
      </div>
    );
  }

  if (error || !pp) {
    return (
      <div>
        <Breadcrumb
          items={[
            { label: "쇼핑몰", href: "/shop" },
            { label: "개인결제", href: "/shop/personalpay" },
            { label: "결제" },
          ]}
        />
        <div className="flex flex-col items-center py-16 text-center text-muted-foreground">
          <AlertCircle className="mb-4 h-14 w-14 text-muted-foreground/40" />
          <p className="font-medium">{error || "개인결제 정보를 찾을 수 없습니다."}</p>
          <Button className="mt-6" variant="outline" asChild>
            <Link href="/shop/personalpay">개인결제 목록</Link>
          </Button>
        </div>
      </div>
    );
  }

  const paymentState = pp.payment_state || (pp.already_paid ? "paid" : "ready");
  const paymentStateLabel =
    pp.payment_state_label || (pp.already_paid ? "결제 완료" : "결제 대기");
  const blockReason =
    pp.payment_block_reason || (pp.already_paid ? "이미 결제하신 개인결제 내역입니다." : "");
  const canPay = pp.can_pay !== false && paymentState === "ready";

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "쇼핑몰", href: "/shop" },
          { label: "개인결제", href: "/shop/personalpay" },
          { label: pp.pp_id },
          { label: "결제" },
        ]}
      />

      <div className="mx-auto max-w-2xl space-y-5 py-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/shop/personalpay/${encodeURIComponent(pp.pp_id)}`}>
            <ArrowLeft className="h-4 w-4" />
            상세로 돌아가기
          </Link>
        </Button>

        <section className="rounded-lg border bg-background p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CreditCard className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary">개인결제</p>
              <h1 className="mt-1 text-2xl font-bold">{pp.pp_name}님 개인결제</h1>
              <p className="mt-1 text-sm text-muted-foreground">결제번호 {pp.pp_id}</p>
              {pp.pp_time ? (
                <p className="mt-1 text-xs text-muted-foreground">발급일 {formatDate(pp.pp_time)}</p>
              ) : null}
            </div>
          </div>

          {pp.pp_content ? (
            <div className="mt-5 whitespace-pre-wrap rounded-md bg-muted/30 p-4 text-sm">
              {pp.pp_content}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border bg-background p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">결제 금액</p>
              <p className="mt-1 text-3xl font-extrabold text-primary">
                {formatPrice(pp.pp_price)}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">결제 상태</p>
              <p className="mt-1 font-semibold">{paymentStateLabel}</p>
            </div>
          </div>

          {pp.pp_settle_case === "무통장" && pp.pp_bank_account ? (
            <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">입금 안내</p>
              <p className="mt-1 font-mono">{pp.pp_bank_account}</p>
              {pp.pp_deposit_name ? (
                <p className="mt-1 text-xs text-amber-700">입금자명: {pp.pp_deposit_name}</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border bg-background p-6">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-semibold">결제 전 확인</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                결제 가능 여부를 API에서 다시 확인한 뒤 그누보드 원본 결제창으로 이동합니다.
                실제 승인, 무통장 처리, 영수증 처리는 기존 영카트 로직을 그대로 사용합니다.
              </p>
            </div>
          </div>

          {blockReason ? (
            <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {blockReason}
            </div>
          ) : null}

          {startError ? (
            <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {startError}
            </div>
          ) : null}

          <Button className="mt-5 w-full" size="lg" disabled={!canPay || starting} onClick={startPayment}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {starting
              ? "결제 준비 중..."
              : canPay
                ? `${formatPrice(pp.pp_price)} 결제 시작`
                : "결제할 수 없습니다"}
          </Button>
        </section>
      </div>
    </div>
  );
}

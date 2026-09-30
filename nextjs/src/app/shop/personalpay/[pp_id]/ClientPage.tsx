"use client";

import { useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { ArrowUpRight, CheckCircle2, Clock3, CreditCard, Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { useRuntimeRouteParam } from "@/hooks/use-runtime-route-param";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { formatPrice, formatDate } from "@/lib/utils";

interface PersonalPay {
  pp_id: string;
  od_id?: string;
  pp_name: string;
  pp_email: string;
  pp_hp: string;
  pp_content: string;
  pp_price: number;
  pp_pg?: string;
  pp_tno?: string;
  pp_app_no?: string;
  pp_settle_case: string;
  pp_bank_account: string;
  pp_deposit_name: string;
  pp_receipt_price?: number;
  pp_misu_price?: number;
  already_paid: boolean;
  has_payment_transaction?: boolean;
  payment_in_progress?: boolean;
  payment_state?: string;
  payment_state_label?: string;
  pp_receipt_time: string | null;
  pp_time?: string;
  pp_cash?: number;
  pp_cash_no?: string;
  pp_payment_app_label?: string;
  pp_payment_app_value?: string;
  receipt_url?: string;
  pp_payment_receipt_url?: string;
  cash_receipt_url?: string;
  pp_cash_receipt_url?: string;
  cash_receipt_issue_url?: string;
  pp_cash_receipt_issue_url?: string;
  can_pay?: boolean;
  payment_block_reason?: string;
}

function externalLink(url: string, label: string) {
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium transition hover:border-primary hover:text-primary"
    >
      {label}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
}

export default function PersonalPayPage() {
  const pp_id = useRuntimeRouteParam("pp_id", "/shop/personalpay/:pp_id");
  const [pp, setPp] = useState<PersonalPay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pp_id) {
      setPp(null);
      setError("");
      setLoading(true);
      return;
    }

    let alive = true;
    setLoading(true);
    setError("");

    api
      .get<PersonalPay>(`/shop/personalpay/${encodeURIComponent(pp_id)}`)
      .then((res) => {
        if (alive) setPp((res.data as PersonalPay) ?? null);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "조회에 실패했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [pp_id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40 rounded" />
        <div className="skeleton mt-4 h-64 rounded-lg" />
      </div>
    );
  }

  if (error || !pp) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <CreditCard className="mb-4 h-16 w-16 text-muted-foreground/40" />
        <p className="font-medium">{error || "결제 정보를 찾을 수 없습니다."}</p>
      </div>
    );
  }

  const receiptUrl = pp.receipt_url || pp.pp_payment_receipt_url || "";
  const cashReceiptUrl = pp.cash_receipt_url || pp.pp_cash_receipt_url || "";
  const cashReceiptIssueUrl =
    pp.cash_receipt_issue_url || pp.pp_cash_receipt_issue_url || "";
  const receiptPrice = pp.pp_receipt_price ?? 0;
  const misuPrice = pp.pp_misu_price ?? Math.max(0, pp.pp_price - receiptPrice);
  const paymentState = pp.payment_state || (pp.already_paid ? "paid" : "ready");
  const paymentStateLabel =
    pp.payment_state_label || (pp.already_paid ? "결제 완료" : "결제 대기");
  const paymentInProgress = pp.payment_in_progress || paymentState === "processing";

  if (pp.already_paid) {
    return (
      <div>
        <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "개인결제" }]} />
        <div className="mx-auto max-w-2xl space-y-4 py-10">
          <section className="rounded-lg border p-6">
            <CheckCircle2 className="mb-4 h-12 w-12 text-green-600" />
            <p className="text-sm font-medium text-primary">결제 완료</p>
            <h1 className="mt-1 text-2xl font-bold">{pp.pp_name}님 개인결제</h1>
            {pp.pp_receipt_time && (
              <p className="mt-2 text-sm text-muted-foreground">
                결제일시: {formatDate(pp.pp_receipt_time)}
              </p>
            )}
          </section>

          <section className="rounded-lg border p-6">
            <h2 className="text-base font-semibold">결제 정보</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">결제번호</dt>
                <dd className="font-mono">{pp.pp_id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">결제수단</dt>
                <dd className="font-medium">{pp.pp_settle_case || "-"}</dd>
              </div>
              {pp.pp_payment_app_label && pp.pp_payment_app_value && (
                <div>
                  <dt className="text-muted-foreground">{pp.pp_payment_app_label}</dt>
                  <dd className="font-mono">{pp.pp_payment_app_value}</dd>
                </div>
              )}
              {pp.pp_tno && (
                <div>
                  <dt className="text-muted-foreground">거래번호</dt>
                  <dd className="font-mono">{pp.pp_tno}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">결제금액</dt>
                <dd className="text-lg font-bold text-primary">
                  {formatPrice(receiptPrice || pp.pp_price)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">미수금</dt>
                <dd className="font-medium">{misuPrice === 0 ? "완불" : formatPrice(misuPrice)}</dd>
              </div>
            </dl>
          </section>

          {(receiptUrl || cashReceiptUrl || cashReceiptIssueUrl) && (
            <section className="rounded-lg border p-6">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">영수증</h2>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {externalLink(receiptUrl, "영수증 출력")}
                {externalLink(cashReceiptUrl, "현금영수증 확인")}
                {!cashReceiptUrl &&
                  externalLink(cashReceiptIssueUrl, "현금영수증 발급 신청")}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "개인결제" }]} />
      <h1 className="mb-6 text-2xl font-bold">개인결제</h1>

      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-lg border p-6">
          <p className="text-xs text-muted-foreground">받으시는 분</p>
          <p className="font-medium">{pp.pp_name}</p>
          {pp.pp_hp && (
            <p className="mt-0.5 text-sm text-muted-foreground">{pp.pp_hp}</p>
          )}
          {pp.pp_content && (
            <div className="mt-4 whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">
              {pp.pp_content}
            </div>
          )}
        </div>

        <div className="rounded-lg border p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">결제 금액</p>
              <p className="mt-1 text-3xl font-extrabold text-primary">
                {formatPrice(pp.pp_price)}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">상태</p>
              <p className="mt-1 font-semibold">{paymentStateLabel}</p>
            </div>
          </div>
        </div>

        {pp.pp_settle_case === "무통장" && pp.pp_bank_account && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-medium text-amber-900">입금 안내</p>
            <p className="mt-1 font-mono text-amber-900">{pp.pp_bank_account}</p>
            {pp.pp_deposit_name && (
              <p className="mt-1 text-xs text-amber-700">
                입금자명: {pp.pp_deposit_name}
              </p>
            )}
          </div>
        )}

        {pp.can_pay === false && pp.payment_block_reason ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex gap-2">
              {paymentInProgress ? (
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : null}
              <span>{pp.payment_block_reason}</span>
            </div>
          </div>
        ) : null}

        {pp.can_pay === false ? (
          <Button className="w-full" size="lg" disabled>
            {paymentInProgress ? "결제 처리 중" : `${formatPrice(pp.pp_price)} 결제하기`}
          </Button>
        ) : (
          <Button className="w-full" size="lg" asChild>
            <Link href={`/shop/personalpay/${encodeURIComponent(pp.pp_id)}/pay`}>
              {formatPrice(pp.pp_price)} 결제하기
            </Link>
          </Button>
        )}
        <p className="text-center text-xs text-muted-foreground">
          개인결제는 운영자가 발급한 1회용 결제 링크입니다. 결제 후 같은 페이지에서
          영수증 정보를 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

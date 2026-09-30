"use client";

import { ArrowLeftRight, Banknote, CreditCard, Landmark, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { g5PathForRuntime } from "@/lib/config";
import {
  PAYMENT_METHODS,
  easyPayButtonLabel,
  easyPayOptions,
  isPaymentMethodEnabled,
  type EasyPayOption,
  type PaymentConfig,
} from "./orderPaymentHelpers";

/* 결제수단 칸의 아이콘. 영카트 주문서처럼 칸마다 무엇인지 그림으로도 알린다. */
const PAY_METHOD_ICONS: Record<string, LucideIcon> = {
  bank: Landmark,
  card: CreditCard,
  vbank: Banknote,
  iche: ArrowLeftRight,
  hp: Smartphone,
  easy_pay: Wallet,
  kakaopay: Wallet,
};

const TILE_CLASS =
  "shop-pay-method flex min-w-0 items-center gap-2.5 whitespace-normal break-words rounded-md border px-2 py-3 text-left text-sm font-medium leading-snug transition-colors sm:px-3";

function tileStateClass(pressed: boolean) {
  return pressed ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent";
}

/** 간편결제 서비스 한 칸 — 브랜드 로고만 보이고 이름은 로고의 alt 로 읽힌다(영카트 주문서와 같다). */
function EasyPayServiceTile({ option, pressed, onSelect }: { option: EasyPayOption; pressed: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={pressed}
      className={`${TILE_CLASS} shop-pay-method--brand justify-center ${tileStateClass(pressed)}`}
    >
      <img src={g5PathForRuntime(option.src)} alt={option.label} className="shop-pay-method-logo h-4 w-auto" loading="lazy" />
    </button>
  );
}

type OrderPaymentMethodSectionProps = {
  inputClassName: string;
  paymentMethod: string;
  setPaymentMethod: (value: string) => void;
  easyPayService: string;
  setEasyPayService: (value: string) => void;
  paymentConfig: PaymentConfig | null;
  bankAccounts: string[];
  bankAccount: string;
  setBankAccount: (value: string) => void;
  depositName: string;
  setDepositName: (value: string) => void;
};

export function OrderPaymentMethodSection({
  inputClassName,
  paymentMethod,
  setPaymentMethod,
  easyPayService,
  setEasyPayService,
  paymentConfig,
  bankAccounts,
  bankAccount,
  setBankAccount,
  depositName,
  setDepositName,
}: OrderPaymentMethodSectionProps) {
  const easyServices = easyPayOptions(paymentConfig);
  return (
    <section className="shop-order-section shop-order-section--payment rounded-lg border p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold">결제 수단</h2>
      </div>
      <div className="shop-pay-methods grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {PAYMENT_METHODS.filter((method) =>
          isPaymentMethodEnabled(method, paymentConfig)
        ).map((method) => {
          if (method.value === "easy_pay" && easyServices.length > 0) {
            /* 서비스를 따로 고를 수 있는 PG(KCP · NICEPAY)면 "간편결제" 한 칸 대신 서비스마다 칸을 낸다.
               아무것도 안 골랐으면(첫 진입) 첫 칸이 서버의 대표 서비스와 같은 기본값이다. */
            const current = easyPayService || easyServices[0].service;
            return easyServices.map((option) => (
              <EasyPayServiceTile
                key={option.service}
                option={option}
                pressed={paymentMethod === "easy_pay" && current === option.service}
                onSelect={() => {
                  setEasyPayService(option.service);
                  setPaymentMethod("easy_pay");
                }}
              />
            ));
          }
          const Icon = PAY_METHOD_ICONS[method.value] ?? Wallet;
          const pressed = paymentMethod === method.value;
          return (
            <button
              key={method.value}
              type="button"
              onClick={() => setPaymentMethod(method.value)}
              aria-pressed={pressed}
              className={`${TILE_CLASS} ${tileStateClass(pressed)}`}
            >
              <span className="shop-pay-method-icon grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted" aria-hidden>
                <Icon size={18} strokeWidth={1.7} />
              </span>
              <span className="shop-pay-method-label min-w-0">
                {method.value === "easy_pay"
                  ? easyPayButtonLabel(paymentConfig?.easy_pay_services)
                  : method.label}
              </span>
            </button>
          );
        })}
      </div>

      {paymentMethod === "bank" && (
        <div className="mt-4 space-y-3 rounded-md border bg-muted/30 p-4">
          <div>
            <label htmlFor="order-bank-account" className="mb-1 block text-sm font-medium">
              입금 계좌 <span className="text-red-700">*</span>
            </label>
            <select
              id="order-bank-account"
              name="bank_account"
              aria-label="입금 계좌"
              value={bankAccount}
              onChange={(event) => setBankAccount(event.target.value)}
              className={inputClassName}
              disabled={bankAccounts.length === 0}
            >
              {bankAccounts.length === 0 ? (
                <option value="">등록된 입금 계좌가 없습니다</option>
              ) : (
                bankAccounts.map((account) => (
                  <option key={account} value={account}>
                    {account}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label htmlFor="order-deposit-name" className="mb-1 block text-sm font-medium">
              입금자명 <span className="text-red-700">*</span>
            </label>
            <input
              id="order-deposit-name"
              name="deposit_name"
              aria-label="입금자명"
              type="text"
              value={depositName}
              onChange={(event) => setDepositName(event.target.value)}
              placeholder="입금자명"
              required
              className={inputClassName}
            />
          </div>
        </div>
      )}
    </section>
  );
}

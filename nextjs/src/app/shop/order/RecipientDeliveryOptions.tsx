"use client";

import type { HopeDateRule } from "./orderPaymentHelpers";

type RecipientDeliveryOptionsProps = {
  inputClassName: string;
  memo: string;
  setMemo: (value: string) => void;
  hopeDate: string;
  setHopeDate: (value: string) => void;
  /** 결제 설정의 hope_date — 쓰지 않거나 아직 받지 못했으면 희망배송일 칸을 그리지 않는다. */
  hopeDateRule: HopeDateRule | null;
};

/**
 * 전하실 말씀 · 희망배송일 — 영카트 orderform.sub.php 와 같다. 희망배송일은 관리자 "희망배송일사용"일 때만 나오고
 * 반드시 고르며, "희망배송일지정"일 뒤부터 7일 안에서 고른다(날짜는 서버가 정해 준다).
 */
export function RecipientDeliveryOptions({
  inputClassName,
  memo,
  setMemo,
  hopeDate,
  setHopeDate,
  hopeDateRule,
}: RecipientDeliveryOptionsProps) {
  return (
    <>
      <div className="mt-4">
        <label htmlFor="order-delivery-memo" className="mb-1 block text-sm font-medium">전하실 말씀</label>
        <textarea
          id="order-delivery-memo"
          name="delivery_memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          rows={2}
          placeholder="배송 요청사항"
          className={inputClassName}
        />
      </div>

      {hopeDateRule?.use && (
        <div className="mt-4">
          <label htmlFor="order-hope-date" className="mb-1 block text-sm font-medium">
            희망배송일 <span className="text-destructive">*</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="order-hope-date"
              name="od_hope_date"
              type="date"
              required
              value={hopeDate}
              onChange={(event) => setHopeDate(event.target.value)}
              min={hopeDateRule.min}
              max={hopeDateRule.max}
              className={`${inputClassName} max-w-[200px]`}
            />
            <span className="text-sm text-muted-foreground">이후로 배송 바랍니다.</span>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

type RecipientDeliveryOptionsProps = {
  inputClassName: string;
  memo: string;
  setMemo: (value: string) => void;
  hopeDate: string;
  setHopeDate: (value: string) => void;
  isMemberOrder: boolean;
  taxRequest: boolean;
  setTaxRequest: (checked: boolean) => void;
  cashRequest: boolean;
  setCashRequest: (checked: boolean) => void;
};

function getTomorrowDateInputValue(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

export function RecipientDeliveryOptions({
  inputClassName,
  memo,
  setMemo,
  hopeDate,
  setHopeDate,
  isMemberOrder,
  taxRequest,
  setTaxRequest,
  cashRequest,
  setCashRequest,
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

      <div className="mt-4">
        <label htmlFor="order-hope-date" className="mb-1 block text-sm font-medium">
          희망 배송일{" "}
          <span className="text-xs text-muted-foreground">(선택)</span>
        </label>
        <input
          id="order-hope-date"
          name="hope_date"
          type="date"
          value={hopeDate}
          onChange={(event) => setHopeDate(event.target.value)}
          min={getTomorrowDateInputValue()}
          className={`${inputClassName} max-w-[200px]`}
        />
      </div>

      {isMemberOrder && (
        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={taxRequest}
              onChange={(event) => setTaxRequest(event.target.checked)}
              className="h-4 w-4 rounded"
            />
            세금계산서 신청 (사업자 전용)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cashRequest}
              onChange={(event) => setCashRequest(event.target.checked)}
              className="h-4 w-4 rounded"
            />
            현금영수증 신청 (가상계좌/계좌이체 결제 시)
          </label>
        </div>
      )}
    </>
  );
}

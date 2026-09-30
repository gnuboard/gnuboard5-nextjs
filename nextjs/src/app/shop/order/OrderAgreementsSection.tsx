"use client";

type OrderAgreementsSectionProps = {
  agreeAll: boolean;
  agreeTerms: boolean;
  setAgreeTerms: (checked: boolean) => void;
  agreePrivacy: boolean;
  setAgreePrivacy: (checked: boolean) => void;
  handleAgreeAll: (checked: boolean) => void;
};

export function OrderAgreementsSection({
  agreeAll,
  agreeTerms,
  setAgreeTerms,
  agreePrivacy,
  setAgreePrivacy,
  handleAgreeAll,
}: OrderAgreementsSectionProps) {
  return (
    <section className="shop-order-section shop-order-section--agree rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-bold">약관 동의</h2>
      <div className="space-y-3">
        <label className="flex items-center gap-2 rounded-md border p-3 font-medium">
          <input
            type="checkbox"
            checked={agreeAll}
            onChange={(event) => handleAgreeAll(event.target.checked)}
            className="h-4 w-4 rounded"
          />
          전체 동의
        </label>
        <label className="flex items-center gap-2 pl-2 text-sm">
          <input
            type="checkbox"
            checked={agreeTerms}
            onChange={(event) => setAgreeTerms(event.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span>[필수] 이용약관 동의</span>
        </label>
        <label className="flex items-center gap-2 pl-2 text-sm">
          <input
            type="checkbox"
            checked={agreePrivacy}
            onChange={(event) => setAgreePrivacy(event.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span>[필수] 개인정보 수집 및 이용 동의</span>
        </label>
      </div>
    </section>
  );
}

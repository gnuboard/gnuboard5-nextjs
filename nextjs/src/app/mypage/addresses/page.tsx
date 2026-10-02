"use client";

import { useEffect, useState, useCallback } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { MypagePanel } from "../MypagePanel";
import { MapPin, Trash2, Plus, Star } from "lucide-react";
import { toastError } from "@/lib/toast";
import {
  KOREAN_PHONE_PATTERN,
  KOREAN_ZIP_PATTERN,
  isValidKoreanPhone,
  isValidKoreanZip,
  normalizeKoreanZipInput,
} from "@/lib/address-validation";
import {
  createSavedAddress,
  deleteSavedAddress,
  getSavedAddresses,
} from "@/services/addresses";
import type { SavedAddress } from "@/lib/schemas";

import type { DaumPostcodeData } from "@/types/daum-postcode";

const EMPTY_FORM = {
  ad_subject: "",
  ad_default: false,
  ad_name: "",
  ad_tel: "",
  ad_hp: "",
  ad_zip: "",
  ad_addr1: "",
  ad_addr2: "",
  ad_addr3: "",
  ad_jibeon: "",
};

export default function MyAddressesPage() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [postcodeLoadFailed, setPostcodeLoadFailed] = useState(false);

  const loadAddresses = useCallback(async () => {
    try {
      setAddresses(await getSavedAddresses());
    } catch {
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const openPostcode = useCallback(() => {
    if (typeof window === "undefined" || !window.daum?.Postcode) {
      toastError(
        "우편번호 검색 서비스를 사용할 수 없습니다. 우편번호와 주소를 직접 입력해 주세요."
      );
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data: DaumPostcodeData) => {
        setForm((prev) => ({
          ...prev,
          ad_zip: data.zonecode,
          ad_addr1: data.address,
          ad_addr3: data.buildingName ? `(${data.buildingName})` : "",
          ad_jibeon: data.jibunAddress ?? "",
        }));
      },
    }).open();
  }, []);

  const handleDelete = async (ad_id: number) => {
    if (!confirm("이 배송지를 삭제하시겠습니까?")) return;
    try {
      await deleteSavedAddress(ad_id);
      setAddresses((prev) => prev.filter((a) => a.ad_id !== ad_id));
    } catch {
      toastError("삭제에 실패했습니다.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ad_name || !form.ad_hp || !form.ad_zip || !form.ad_addr1) {
      toastError("필수 정보를 입력해주세요.");
      return;
    }
    if (!isValidKoreanPhone(form.ad_hp)) {
      toastError("휴대폰 번호를 올바르게 입력해 주세요.");
      return;
    }
    if (form.ad_tel && !isValidKoreanPhone(form.ad_tel)) {
      toastError("전화번호를 올바르게 입력해 주세요.");
      return;
    }
    if (!isValidKoreanZip(form.ad_zip)) {
      toastError("우편번호는 5자리 숫자로 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      await createSavedAddress({
        ad_subject: form.ad_subject || form.ad_name,
        ad_default: form.ad_default ? 1 : 0,
        ad_name: form.ad_name,
        ad_tel: form.ad_tel,
        ad_hp: form.ad_hp,
        ad_zip1: form.ad_zip.substring(0, 3),
        ad_zip2: form.ad_zip.substring(3),
        ad_addr1: form.ad_addr1,
        ad_addr2: form.ad_addr2,
        ad_addr3: form.ad_addr3,
        ad_jibeon: form.ad_jibeon,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadAddresses();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "저장에 실패했습니다.";
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <MypagePanel
      title="배송지 관리"
      actions={
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1 h-4 w-4" />
          {showForm ? "취소" : "신규 배송지 추가"}
        </Button>
      }
    >
      <Script
        src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        strategy="afterInteractive"
        onLoad={() => setPostcodeLoadFailed(false)}
        onError={() => setPostcodeLoadFailed(true)}
      />

      {postcodeLoadFailed && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          우편번호 검색 서비스를 불러오지 못했습니다. 우편번호와 주소를 직접 입력해 주세요.
        </div>
      )}

      {/* New Address Form — 카드 안의 카드 대신 옅은 바탕 구역으로 둔다. */}
      {showForm && (
        <section className="rounded-lg border bg-muted/30 p-4" aria-labelledby="new-address-title">
          <h3 id="new-address-title" className="mb-4 font-semibold">신규 배송지</h3>
          <div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium">
                    배송지명
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={form.ad_subject}
                    onChange={(e) =>
                      setForm({ ...form, ad_subject: e.target.value })
                    }
                    placeholder="예: 집, 회사"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    이름 <span className="text-red-700">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.ad_name}
                    onChange={(e) =>
                      setForm({ ...form, ad_name: e.target.value })
                    }
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    휴대폰 <span className="text-red-700">*</span>
                  </label>
                  <input
                    type="tel"
                    value={form.ad_hp}
                    onChange={(e) =>
                      setForm({ ...form, ad_hp: e.target.value })
                    }
                    pattern={KOREAN_PHONE_PATTERN}
                    title="휴대폰 번호를 올바르게 입력해 주세요."
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    전화번호
                  </label>
                  <input
                    type="tel"
                    value={form.ad_tel}
                    onChange={(e) =>
                      setForm({ ...form, ad_tel: e.target.value })
                    }
                    pattern={KOREAN_PHONE_PATTERN}
                    title="전화번호를 올바르게 입력해 주세요."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    우편번호 <span className="text-red-700">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.ad_zip}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          ad_zip: normalizeKoreanZipInput(e.target.value),
                        })
                      }
                      inputMode="numeric"
                      maxLength={5}
                      pattern={KOREAN_ZIP_PATTERN}
                      title="우편번호 5자리를 입력해 주세요."
                      required
                      className={`${inputCls} max-w-[140px]`}
                    />
                    <Button type="button" variant="outline" onClick={openPostcode}>
                      검색
                    </Button>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium">
                    기본주소 <span className="text-red-700">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.ad_addr1}
                    onChange={(e) =>
                      setForm({ ...form, ad_addr1: e.target.value })
                    }
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    상세주소
                  </label>
                  <input
                    type="text"
                    value={form.ad_addr2}
                    onChange={(e) =>
                      setForm({ ...form, ad_addr2: e.target.value })
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    참고항목
                  </label>
                  <input
                    type="text"
                    value={form.ad_addr3}
                    onChange={(e) =>
                      setForm({ ...form, ad_addr3: e.target.value })
                    }
                    className={inputCls}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ad_default}
                  onChange={(e) =>
                    setForm({ ...form, ad_default: e.target.checked })
                  }
                  className="h-4 w-4 rounded"
                />
                기본배송지로 설정
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setForm(EMPTY_FORM);
                  }}
                >
                  취소
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "저장 중..." : "저장"}
                </Button>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* Address List */}
      {loading ? (
        <div role="status" aria-label="배송지 목록 로딩 중" className="grid gap-4 md:grid-cols-2">
          <span className="sr-only">배송지 목록 로딩 중</span>
          {[0, 1].map((item) => (
            <div key={item} aria-hidden="true" className="space-y-3 rounded-lg border p-5">
              <div className="skeleton h-5 w-32 rounded" />
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-9 w-24 rounded-md" />
            </div>
          ))}
        </div>
      ) : addresses.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <MapPin className="mb-4 h-14 w-14 text-muted-foreground/50" />
          <p className="text-lg font-medium">저장된 배송지가 없습니다</p>
          <p className="mt-1 text-sm text-muted-foreground">
            자주 사용하는 배송지를 등록해보세요
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {addresses.map((addr) => (
            <div key={addr.ad_id} className="rounded-lg border p-4">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {addr.ad_default === 1 && (
                      <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <Star className="h-3 w-3 fill-current" />
                        기본
                      </span>
                    )}
                    <span className="font-bold">
                      {addr.ad_subject || addr.ad_name}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(addr.ad_id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm font-medium">{addr.ad_name}</p>
                <p className="text-sm text-muted-foreground">
                  {addr.ad_tel} / {addr.ad_hp}
                </p>
                <p className="mt-2 text-sm">
                  ({addr.ad_zip1}
                  {addr.ad_zip2}) {addr.ad_addr1} {addr.ad_addr2}{" "}
                  {addr.ad_addr3}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </MypagePanel>
  );
}

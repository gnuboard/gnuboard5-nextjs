"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getRegisterTerms, type RegisterTerms } from "@/services/auth";

export type AgreementField = "agree_terms" | "agree_privacy";

const AGREEMENTS: Array<{ field: AgreementField; label: string; summary: string; title: string; key: keyof RegisterTerms }> = [
  {
    field: "agree_terms",
    label: "이용약관 동의",
    summary: "회원 서비스 이용약관에 동의합니다.",
    title: "회원가입약관",
    key: "stipulation",
  },
  {
    field: "agree_privacy",
    label: "개인정보처리방침 동의",
    summary: "회원가입과 서비스 제공을 위한 개인정보 수집 및 이용에 동의합니다.",
    title: "개인정보 수집 및 이용",
    key: "privacy",
  },
];

interface RegisterAgreementsProps {
  values: Record<AgreementField, boolean>;
  errors: Partial<Record<AgreementField, string>>;
  disabled: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** 약관 창의 [동의합니다] — 그 항목을 체크한다. */
  onAgree: (field: AgreementField) => void;
}

/**
 * 회원가입 약관 동의. 그누보드 회원가입처럼 체크하기 전에 전문을 읽을 수 있게 항목마다 "전문 보기"로 창을 연다.
 * 전문은 관리자 기본환경설정의 회원가입약관 · 개인정보처리방침(GET /v1/register-terms)이고 처음 열 때 한 번 받는다.
 */
export function RegisterAgreements({ values, errors, disabled, onChange, onAgree }: RegisterAgreementsProps) {
  const [open, setOpen] = useState<AgreementField | null>(null);
  const [terms, setTerms] = useState<RegisterTerms | null>(null);
  const [loadError, setLoadError] = useState(false);

  const openTerms = (field: AgreementField) => {
    setOpen(field);
    if (terms) return;
    setLoadError(false);
    getRegisterTerms()
      .then(setTerms)
      .catch(() => setLoadError(true));
  };

  const current = AGREEMENTS.find((item) => item.field === open) ?? null;
  const text = current && terms ? String(terms[current.key] ?? "").trim() : "";

  return (
    <div className="register-agreements space-y-3 rounded-[4px] border bg-muted/25 p-3">
      {AGREEMENTS.map((item) => (
        <div className="flex items-start gap-2" key={item.field}>
          <Checkbox
            id={item.field}
            name={item.field}
            checked={values[item.field]}
            onChange={onChange}
            disabled={disabled}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Label htmlFor={item.field}>{item.label}</Label>
              <button
                type="button"
                className="register-agreement-view text-xs font-medium text-primary underline underline-offset-2 hover:no-underline"
                onClick={() => openTerms(item.field)}
                aria-haspopup="dialog"
              >
                전문 보기
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{item.summary}</p>
            {errors[item.field] && <p className="text-sm text-destructive">{errors[item.field]}</p>}
          </div>
        </div>
      ))}

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="register-terms-dialog sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{current?.title}</DialogTitle>
            <DialogDescription>내용을 읽고 동의하면 [동의합니다]를 눌러 주세요.</DialogDescription>
          </DialogHeader>
          <div
            className="register-terms-body max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-4 text-sm leading-relaxed"
            tabIndex={0}
          >
            {loadError
              ? "약관을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
              : !terms
                ? "약관을 불러오는 중입니다…"
                : text || "등록된 내용이 없습니다."}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(null)}>
              닫기
            </Button>
            <Button
              type="button"
              disabled={disabled || !current}
              onClick={() => {
                if (current) onAgree(current.field);
                setOpen(null);
              }}
            >
              동의합니다
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getClientPublicSettings } from "@/services/settings";

/**
 * 사업자 정보(영카트 기본환경설정의 de_admin_*) — /settings 의 company 로 온다. 쇼핑몰이 없거나
 * 모두 비면 API 가 company 를 빼므로 칸째 내지 않는다(레퍼런스 solune_company_info 와 같다).
 */
export type SoluneCompany = Partial<
  Record<
    "name" | "ceo" | "addr" | "biz_no" | "tel" | "fax" | "mail_order_no" | "buga_no" | "privacy_officer" | "email",
    string
  >
>;

type CompanyKey = keyof SoluneCompany;

/* 푸터에 적는 순서와 이름표. 커뮤니티는 레퍼런스 tail.layout.php, 쇼핑몰은 shop.tail.php 를 따른다. */
const COMMUNITY_FIELDS: [CompanyKey, string][] = [
  ["name", "회사명"],
  ["ceo", "대표"],
  ["addr", "주소"],
  ["biz_no", "사업자등록번호"],
  ["tel", "전화"],
  ["fax", "팩스"],
  ["mail_order_no", "통신판매업신고번호"],
  ["buga_no", "부가통신사업신고번호"],
  ["privacy_officer", "개인정보관리책임자"],
];

const SHOP_FIELDS: [CompanyKey, string][] = [
  ["name", "회사명"],
  ["addr", "주소"],
  ["biz_no", "사업자 등록번호"],
  ["ceo", "대표"],
  ["tel", "전화"],
  ["fax", "팩스"],
  ["mail_order_no", "통신판매업신고번호"],
  ["privacy_officer", "개인정보 보호책임자"],
  ["buga_no", "부가통신사업신고번호"],
];

export function toSoluneCompany(value: unknown): SoluneCompany | null {
  if (!value || typeof value !== "object") return null;
  const company: SoluneCompany = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim() !== "") company[key as CompanyKey] = raw.trim();
  }
  return Object.keys(company).length > 0 ? company : null;
}

/** 브라우저에서 공개 설정을 한 번 받아(같은 화면의 다른 호출과 나눠 쓴다) 사업자 정보만 꺼낸다. */
export function useSoluneCompany(): SoluneCompany | null {
  const [company, setCompany] = useState<SoluneCompany | null>(null);

  useEffect(() => {
    let alive = true;
    getClientPublicSettings()
      .then((settings) => {
        if (alive) setCompany(toSoluneCompany((settings as Record<string, unknown>).company));
      })
      .catch(() => {
        // 설정을 못 받으면 사업자 정보 칸만 빠진다 — 푸터의 나머지는 그대로 선다.
      });
    return () => {
      alive = false;
    };
  }, []);

  return company;
}

/** 푸터의 "사이트 정보" — 이름표 · 값 짝이라 dl 로 적는다. */
export function SoluneCompanyInfo({
  company,
  variant,
  className,
}: {
  company: SoluneCompany | null;
  variant: "community" | "shop";
  className: string;
}) {
  const fields = variant === "shop" ? SHOP_FIELDS : COMMUNITY_FIELDS;
  const rows = company ? fields.filter(([key]) => company[key]) : [];
  if (!company || rows.length === 0) return null;

  return (
    <section className={className} aria-labelledby={`${className}-title`}>
      <h2 id={`${className}-title`} className={`${className}-title`}>
        사이트 정보
      </h2>
      <dl className={`${className}-list`}>
        {rows.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{company[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

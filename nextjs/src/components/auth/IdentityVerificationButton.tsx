"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { g5BaseUrlForRuntime } from "@/lib/config";

export interface IdentityVerificationResult {
  cert_type: string;     // "simple" (이니시스) | "hp" (휴대폰)
  mb_name: string;
  mb_hp: string;
  cert_no: string;       // md5(cert no)
  mb_birth: string;      // YYYYMMDD
  adult: number;         // 0 or 1
  provider?: string;     // "inicis-simple" | "kcp-hp" | "kcp_v2-hp"
}

export type IdentityVerificationMethod = "simple" | "hp" | "hp_v2";

/**
 * 본인인증 방식별 팝업 URL + 크기.
 * - simple: KG 이니시스 간편인증 (카카오/네이버/PASS/통신사)
 * - hp:     KCP 휴대폰 인증
 * - hp_v2:  KCP 휴대폰 인증(api_v2)
 *
 * 콜백 URL 은 그누보드 코어 플러그인(plugin/inicert, plugin/kcpcert)을 수정하지
 * 않기 위해 api/cert/ 어댑터를 가리킨다. 어댑터는 플러그인 라이브러리만 재사용해
 * 인증 결과를 postMessage 로 이 컴포넌트에 전달한다.
 */
const METHOD_META: Record<
  IdentityVerificationMethod,
  { label: string; popupWidth: number; popupHeight: number; path: (pageType: string) => string }
> = {
  simple: {
    label: "간편인증",
    popupWidth: 400,
    popupHeight: 620,
    path: (pageType) => `/api/cert/inicis_start.php?pageType=${encodeURIComponent(pageType)}`,
  },
  hp: {
    label: "휴대폰인증",
    popupWidth: 410,
    popupHeight: 500,
    path: (pageType) => `/api/cert/kcp_start.php?pageType=${encodeURIComponent(pageType)}`,
  },
  hp_v2: {
    label: "휴대폰인증(api_v2)",
    popupWidth: 410,
    popupHeight: 560,
    path: (pageType) => `/api/cert/kcp_v2_start.php?pageType=${encodeURIComponent(pageType)}`,
  },
};

function originFromUrl(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

interface IdentityVerificationButtonProps {
  /** 인증 방식 — gnuboard5 admin 설정 (cf_cert_simple / cf_cert_hp) 에 맞춰 사용 */
  method: IdentityVerificationMethod;
  /** 인증 종류 — gnuboard5 plugin 의 pageType 파라미터 */
  pageType?: "register" | "find";
  /** 인증 성공 시 호출 */
  onVerified: (result: IdentityVerificationResult) => void;
  /** 버튼 텍스트 (기본: method 별 기본값) */
  label?: string;
  /** 비활성화 */
  disabled?: boolean;
}

/**
 * 본인확인 버튼 (KG 이니시스 간편인증 / KCP 휴대폰 인증).
 *
 * 그누보드5 plugin/inicert/ini_request.php 또는 plugin/kcpcert/kcpcert_form.php 를
 * 팝업으로 열고, 인증 결과를 ini_result.php / kcpcert_result.php 가
 * postMessage 로 전달.
 *
 * 그누보드5 admin /adm/config_form.php 에서:
 *   - cf_cert_use = 1 필수
 *   - method="simple" 인 경우: cf_cert_simple = inicis
 *   - method="hp" 인 경우:     cf_cert_hp = kcp
 *   - method="hp_v2" 인 경우:  cf_cert_hp = kcp_v2
 * 가 설정되어 있어야 동작.
 */
export function IdentityVerificationButton({
  method,
  pageType = "register",
  onVerified,
  label,
  disabled = false,
}: IdentityVerificationButtonProps) {
  const [busy, setBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const allowedOrigins = new Set([window.location.origin]);
      const g5Origin = originFromUrl(g5BaseUrlForRuntime());
      if (g5Origin) allowedOrigins.add(g5Origin);
      if (!allowedOrigins.has(event.origin)) return;

      const data = event.data;
      if (!data || data.type !== "identity-verification-result") return;

      if (data.status === "success") {
        onVerified({
          cert_type: String(data.cert_type ?? ""),
          mb_name:   String(data.mb_name ?? ""),
          mb_hp:     String(data.mb_hp ?? ""),
          cert_no:   String(data.cert_no ?? ""),
          mb_birth:  String(data.mb_birth ?? ""),
          adult:     Number(data.adult ?? 0),
          provider:  String(data.provider ?? ""),
        });
      }
      setBusy(false);
      try { popupRef.current?.close(); } catch { /* ignore */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onVerified]);

  // 팝업이 사용자에 의해 닫혔는지 감시 — busy 상태를 해제.
  useEffect(() => {
    if (!busy) return;
    const interval = setInterval(() => {
      if (popupRef.current?.closed) {
        setBusy(false);
        clearInterval(interval);
      }
    }, 600);
    return () => clearInterval(interval);
  }, [busy]);

  const meta = METHOD_META[method];

  const handleClick = () => {
    const g5Base = g5BaseUrlForRuntime();
    const popupUrl = new URL(`${g5Base}${meta.path(pageType)}`);
    popupUrl.searchParams.set("returnOrigin", window.location.origin);
    const url = popupUrl.toString();

    const width  = meta.popupWidth;
    const height = meta.popupHeight;
    const left = Math.max(0, (window.screen.availWidth || 0) / 2 - width / 2);
    const top  = Math.max(0, (window.screen.availHeight || 0) / 2 - height / 2);

    // 팝업 이름은 KCP / Inicis 가 expecting 하는 것과 동일하게 유지 (target 매칭).
    const popupName = method === "simple" ? "sa_popup" : "auth_popup";

    const popup = window.open(
      url,
      popupName,
      `width=${width},height=${height},left=${left},top=${top},menubar=no,status=no,titlebar=no,toolbar=no,resizable=${method === "simple" ? "yes" : "no"},scrollbars=${method === "simple" ? "yes" : "no"}`
    );
    if (!popup) {
      alert("브라우저에서 팝업이 차단되어 있습니다. 팝업 활성화 후 다시 시도해 주세요.");
      return;
    }
    popupRef.current = popup;
    setBusy(true);
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      variant="outline"
    >
      {busy ? `${meta.label} 진행중...` : (label ?? meta.label)}
    </Button>
  );
}

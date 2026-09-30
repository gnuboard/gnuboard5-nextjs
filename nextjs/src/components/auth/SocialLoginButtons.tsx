"use client";

import { useEffect, useState } from "react";
import {
  fetchSocialProviders,
  buildSocialStartUrl,
  buildSocialCallbackUrl,
  type SocialProvider,
} from "@/services/socialAuth";

/**
 * 공급자 브랜드 색상/표시.
 * 디자인은 그누보드5 기본 스킨의 sns-naver / sns-kakao / ... 색상값과 동일.
 */
const PROVIDER_STYLE: Record<
  SocialProvider["name"],
  { bg: string; fg: string; mark: string }
> = {
  naver:    { bg: "#0c8040", fg: "#ffffff", mark: "N" },
  kakao:    { bg: "#fee500", fg: "#191600", mark: "K" },
  facebook: { bg: "#1361c7", fg: "#ffffff", mark: "f" },
  google:   { bg: "#ffffff", fg: "#3c4043", mark: "G" },
  twitter:  { bg: "#1184c9", fg: "#ffffff", mark: "t" },
  payco:    { bg: "#cc1212", fg: "#ffffff", mark: "P" },
};

interface SocialLoginButtonsProps {
  /** 로그인 성공 후 돌아갈 경로 (기본: 현재 페이지의 ?redirect=) */
  redirectAfterLogin?: string | null;
  /**
   * grid: 두 칸 격자에 짧은 이름(기본). stacked: 한 줄에 하나씩 전체 폭으로,
   * "네이버 로그인"처럼 이름 뒤에 "로그인"을 붙인다 — 사이드바처럼 좁은 자리용.
   */
  layout?: "grid" | "stacked";
}

export function SocialLoginButtons({ redirectAfterLogin, layout = "grid" }: SocialLoginButtonsProps) {
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchSocialProviders();
      if (cancelled) return;
      const configuredProviders = res.providers.filter((provider) => provider.has_api_key);
      setEnabled(res.enabled);
      setProviders(configuredProviders);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = (provider: SocialProvider) => {
    const callback = buildSocialCallbackUrl(redirectAfterLogin);
    const startUrl = buildSocialStartUrl(provider.name, callback);

    // 그누보드5 기본 스킨과 동일하게 팝업으로 열기.
    const popup = window.open(
      startUrl,
      "social_sing_on",
      "location=0,status=0,scrollbars=1,width=600,height=700"
    );

    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      alert("브라우저에서 팝업이 차단되어 있습니다. 팝업 활성화 후 다시 시도해 주세요.");
    }
  };

  if (!loaded || !enabled || providers.length === 0) {
    return null;
  }

  const stacked = layout === "stacked";

  return (
    <div className="social-login mt-2 space-y-3" data-layout={layout}>
      {stacked ? (
        <p className="social-login-title border-t border-border pt-3 text-xs font-semibold text-muted-foreground">소셜계정으로 로그인</p>
      ) : (
        <div className="relative flex items-center">
          <div className="flex-grow border-t border-border" />
          <span className="mx-3 text-xs text-muted-foreground">소셜계정으로 로그인</span>
          <div className="flex-grow border-t border-border" />
        </div>
      )}
      <div className={stacked ? "grid gap-2" : "grid grid-cols-2 gap-2"}>
        {providers.map((p, index) => {
          const style = PROVIDER_STYLE[p.name];
          if (!style) return null;
          const fillsLastRow = !stacked && providers.length % 2 === 1 && index === providers.length - 1;

          return (
            <button
              key={p.name}
              type="button"
              onClick={() => handleClick(p)}
              title={`${p.label} 로그인`}
              aria-label={`${p.label} 로그인`}
              data-social-provider={p.name}
              className={`btn h-11 min-h-11 min-w-0 justify-center gap-2 rounded-[4px] border px-3 text-xs font-bold shadow-none transition-[filter,box-shadow,transform] hover:brightness-[0.97] hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                fillsLastRow ? "col-span-2" : ""
              }`}
              style={{ backgroundColor: style.bg, color: style.fg }}
            >
              {/* 머리글자는 CSS 로 그린다(data 속성 → ::before). 글자 노드로 두면 "보이는 글자가
                  접근 가능한 이름에 없다"(WCAG 2.5.3 label-in-name)로 걸린다 — aria-hidden 이어도 그렇다. */}
              <span
                aria-hidden="true"
                data-mark={style.mark}
                className="flex size-5 shrink-0 items-center justify-center text-sm font-black leading-none before:content-[attr(data-mark)]"
              />
              <span className="min-w-0 whitespace-nowrap leading-none">{stacked ? `${p.label} 로그인` : p.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

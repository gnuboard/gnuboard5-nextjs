"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildSocialCallbackUrl,
  buildSocialSignupCallbackUrl,
  buildSocialSignupTicketUrl,
  buildSocialStartUrl,
  fetchSocialProviders,
  type SocialProvider,
} from "@/services/socialAuth";

declare global {
  interface Window {
    social_link_fn?: (provider: string) => void;
  }
}

const PROVIDER_STYLE: Record<
  SocialProvider["name"],
  { bg: string; fg: string; mark: string }
> = {
  naver: { bg: "#0c8040", fg: "#ffffff", mark: "N" },
  kakao: { bg: "#fee500", fg: "#191600", mark: "K" },
  facebook: { bg: "#1361c7", fg: "#ffffff", mark: "f" },
  google: { bg: "#ffffff", fg: "#3c4043", mark: "G" },
  twitter: { bg: "#1184c9", fg: "#ffffff", mark: "t" },
  payco: { bg: "#cc1212", fg: "#ffffff", mark: "P" },
};

export function SocialSignupButtons() {
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const handlerRef = useRef<((provider: string) => void) | null>(null);

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
      if (handlerRef.current && window.social_link_fn === handlerRef.current) {
        delete window.social_link_fn;
      }
    };
  }, []);

  const handleClick = (provider: SocialProvider) => {
    const signupCallback = buildSocialSignupCallbackUrl();
    const loginCallback = buildSocialCallbackUrl("/");

    const bridgeHandler = (nextProvider: string) => {
      const targetProvider = String(nextProvider || provider.name).toLowerCase();
      window.location.href = buildSocialSignupTicketUrl(targetProvider, signupCallback);
    };
    handlerRef.current = bridgeHandler;
    window.social_link_fn = bridgeHandler;

    const popup = window.open(
      buildSocialStartUrl(provider.name, loginCallback),
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

  return (
    <div className="space-y-3 rounded-[4px] border border-[#e3e8e5] bg-[#fbfcfb] p-3">
      <div className="space-y-1">
        <p className="text-sm font-bold text-[#202124]">소셜계정으로 시작하기</p>
        <p className="text-xs leading-5 text-muted-foreground">
          이미 연결된 계정이면 바로 로그인되고, 처음 이용하는 계정이면 아래 가입 정보를 자동으로 채웁니다.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {providers.map((provider) => {
          const style = PROVIDER_STYLE[provider.name];
          if (!style) return null;

          return (
            <button
              key={provider.name}
              type="button"
              onClick={() => handleClick(provider)}
              title={`${provider.label}로 시작하기`}
              aria-label={`${provider.label}로 시작하기`}
              className="flex h-12 items-center justify-center rounded-[4px] border border-border/60 text-sm font-bold transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              style={{ backgroundColor: style.bg, color: style.fg }}
            >
              <span className="text-base">{style.mark}</span>
              <span className="ml-1.5 text-[11px] leading-none">{provider.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

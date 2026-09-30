/**
 * 소셜 로그인 — gnuboard5 social 플러그인과의 브리지.
 *
 * 흐름:
 *   1) /auth/social/providers 로 활성화된 공급자 목록을 가져옴
 *   2) 사용자가 버튼 클릭 → popup 으로 /api/social/start.php?provider=X&redirect=/login/social-callback
 *   3) PHP social 플러그인이 OAuth 후 finish.php → /login/social-callback?ticket=XXX
 *   4) callback 페이지가 ticket 을 /auth/social/exchange 로 보내 JWT 획득
 */
import { api } from "@/lib/api";
import { g5BaseUrlForRuntime, appUrl } from "@/lib/config";

export interface SocialProvider {
  name: "naver" | "kakao" | "facebook" | "google" | "twitter" | "payco";
  label: string;
  has_api_key: boolean;
}

export interface SocialProvidersResponse {
  enabled: boolean;
  providers: SocialProvider[];
}

export interface SocialExchangeResponse {
  token: string;
  refresh_token?: string;
  member: Record<string, string | number | undefined>;
}

export interface SocialLinkExistingPayload {
  social_signup_ticket: string;
  mb_id: string;
  mb_password: string;
}

export interface SocialSignupProfile {
  ticket: string;
  provider: SocialProvider["name"];
  provider_label: string;
  suggested_mb_id: string;
  suggested_nick: string;
  name: string;
  email: string;
  phone: string;
  photo_url: string;
}

export async function fetchSocialProviders(): Promise<SocialProvidersResponse> {
  try {
    const res = await api.get<SocialProvidersResponse>("/auth/social/providers");
    if (!res.data) {
      return { enabled: false, providers: [] };
    }
    return res.data;
  } catch {
    return { enabled: false, providers: [] };
  }
}

/**
 * 소셜 로그인 시작 URL — PHP 의 /api/social/start.php 로 점프.
 * gnuboard 호스트 (PHP 동작 호스트) 로 보내야 OAuth 플러그인 세션을 공유.
 */
export function buildSocialStartUrl(provider: SocialProvider["name"], redirect: string): string {
  const g5Base = g5BaseUrlForRuntime();
  const url = new URL(`${g5Base}/api/social/start.php`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect", redirect);
  return url.toString();
}

/**
 * 소셜 로그인 callback URL — finish.php 가 ticket 을 붙여 redirect 할 곳.
 * 절대 URL 이어야 함 (start.php 의 host 검증 통과 필요).
 */
export function buildSocialCallbackUrl(originalRedirect?: string | null): string {
  const callback = appUrl("/login/social-callback");
  if (!originalRedirect) return callback;
  const url = new URL(callback);
  url.searchParams.set("redirect", originalRedirect);
  return url.toString();
}

export function buildSocialSignupCallbackUrl(): string {
  return appUrl("/register");
}

export function buildSocialSignupTicketUrl(
  provider: SocialProvider["name"] | string,
  redirect: string
): string {
  const g5Base = g5BaseUrlForRuntime();
  const url = new URL(`${g5Base}/api/social/signup.php`);
  url.searchParams.set("provider", String(provider).toLowerCase());
  url.searchParams.set("redirect", redirect);
  return url.toString();
}

/**
 * Ticket → JWT 교환.
 */
export async function exchangeSocialTicket(ticket: string): Promise<SocialExchangeResponse> {
  const res = await api.post<SocialExchangeResponse>("/auth/social/exchange", { ticket });
  if (!res.data?.token) {
    throw new Error("소셜 로그인 토큰 교환에 실패했습니다.");
  }
  return res.data;
}

export async function fetchSocialSignupProfile(ticket: string): Promise<SocialSignupProfile> {
  const res = await api.get<SocialSignupProfile>("/auth/social/signup-profile", {
    params: { ticket },
  });
  if (!res.data?.ticket) {
    throw new Error("소셜 가입 정보를 불러오지 못했습니다.");
  }
  return res.data;
}

export async function linkExistingSocialAccount(
  payload: SocialLinkExistingPayload
): Promise<SocialExchangeResponse> {
  const res = await api.post<SocialExchangeResponse>("/auth/social/link-existing", payload);
  if (!res.data?.token) {
    throw new Error("기존 계정 연결에 실패했습니다.");
  }
  return res.data;
}

// -----------------------------------------------------------------------------
// 본인인증 (KG 이니시스 간편인증 / 휴대폰 / 아이핀)
// -----------------------------------------------------------------------------

export interface CertConfig {
  enabled: boolean;
  /** 0: disabled, 1: test, 2: production */
  mode: number;
  /** cf_cert_req */
  required: boolean;
  /** cf_cert_find */
  find_enabled: boolean;
  /** "" | "inicis" — 간편인증 공급자 */
  simple: string;
  /** "" | "kcb" | "kcp" | "kcp_v2" | "lg" — 휴대폰 인증 공급자 */
  hp: string;
  /** "" | "kcb" | "kcp" — 아이핀 공급자 */
  ipin: string;
  use_hp: boolean;
  require_hp: boolean;
}

export async function fetchCertConfig(): Promise<CertConfig> {
  const fallback = {
    enabled: false,
    mode: 0,
    required: false,
    find_enabled: false,
    simple: "",
    hp: "",
    ipin: "",
    use_hp: false,
    require_hp: false,
  };

  try {
    const res = await api.get<CertConfig>("/auth/cert/config");
    if (!res.data) {
      return fallback;
    }
    return { ...fallback, ...res.data };
  } catch {
    return fallback;
  }
}

import { apiBaseUrlForRuntime } from "@/lib/config";
import { parseApiEnvelope } from "@/lib/api-response";
import type { ApiResponse } from "@/lib/api-response";
import { koreanApiErrorMessage, koreanApiFieldErrors } from "@/lib/api-error-messages";
import { storageGet, storageRemove } from "@/lib/safe-storage";

// Server-side: call PHP API directly. Client-side: use Next.js proxy to avoid CORS.
const API_URL = apiBaseUrlForRuntime();
const DEFAULT_API_TIMEOUT_MS = 15_000;
const TOKEN_COOKIE = 'g5_token';
const REFRESH_COOKIE = 'g5_refresh';
const AUTO_LOGIN_COOKIE = 'g5_auto_login';
const AUTH_HINT_COOKIE = 'g5_auth_hint';
/**
 * 그누보드5 자동로그인과 같은 의미:
 * - g5_token: access token. 항상 session cookie.
 * - g5_refresh: auto login 선택 시 30일 cookie, 미선택 시 session cookie.
 * - g5_auto_login: refresh token rotation 때 persistent/session 상태를 유지하기 위한 marker.
 */
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export type { ApiResponse };

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function cookieSecurityAttributes(): string {
  if (typeof document === 'undefined') return '';
  return window.location.protocol === 'https:' ? '; Secure' : '';
}

function setCookie(name: string, value: string, maxAgeSeconds?: number) {
  if (typeof document === 'undefined') return;
  // maxAge 없으면 session cookie. 있으면 영속 cookie.
  const maxAge = typeof maxAgeSeconds === 'number' ? `; max-age=${maxAgeSeconds}` : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax${maxAge}${cookieSecurityAttributes()}`;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax${cookieSecurityAttributes()}`;
}

function shouldPersistClientAuthCookies(): boolean {
  return false;
}

function clearClientAuthCookies() {
  if (typeof document === 'undefined') return;
  if (!shouldPersistClientAuthCookies()) {
    deleteCookie(TOKEN_COOKIE);
    deleteCookie(REFRESH_COOKIE);
    deleteCookie(AUTO_LOGIN_COOKIE);
  }
}

function setAuthHint(autoLogin?: boolean) {
  setCookie(AUTH_HINT_COOKIE, '1', autoLogin ? REFRESH_COOKIE_MAX_AGE : undefined);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS
): Promise<Response> {
  if (typeof AbortController === 'undefined' || timeoutMs <= 0) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const setTimer =
    typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout;
  const clearTimer =
    typeof window !== 'undefined' ? window.clearTimeout.bind(window) : clearTimeout;
  const timeoutId = setTimer(() => controller.abort(), timeoutMs);
  const parentSignal = init.signal;
  const abortFromParent = () => controller.abort();

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener('abort', abortFromParent, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !parentSignal?.aborted) {
      throw new ApiError('요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.', 408);
    }
    throw error;
  } finally {
    clearTimer(timeoutId);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  /**
   * 동시 요청 여럿이 같이 401 받아도 refresh 는 한 번만 — 진행 중 promise 공유.
   */
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    if (typeof window !== 'undefined') {
      // Migrate legacy localStorage into memory, then remove it from persistent JS storage.
      const legacy = storageGet(TOKEN_COOKIE);
      if (legacy) {
        this.token = legacy;
        storageRemove(TOKEN_COOKIE);
      }
      clearClientAuthCookies();
    }
  }

  private canAttemptCookieRefresh(): boolean {
    return typeof window !== 'undefined';
  }

  private shouldAttemptRefresh(path: string): boolean {
    const pathname = path.split(/[?#]/)[0] || '';
    if (pathname === '/auth/refresh') return false;
    return ![
      '/auth/login',
      '/auth/register',
      '/auth/password-reset',
      '/auth/verify-email',
      '/auth/resend-verification',
      '/auth/check-id',
      '/auth/check-email',
    ].some((authPath) => pathname === authPath || pathname.startsWith(`${authPath}/`));
  }

  hasAuthHint(): boolean {
    if (this.token || this.refreshToken) return true;
    if (typeof window === 'undefined') return false;
    return (
      getCookie(AUTH_HINT_COOKIE) === '1' ||
      getCookie(TOKEN_COOKIE) !== null ||
      getCookie(REFRESH_COOKIE) !== null
    );
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        deleteCookie(TOKEN_COOKIE);
      } else {
        deleteCookie(TOKEN_COOKIE);
        deleteCookie(AUTH_HINT_COOKIE);
      }
    }
  }

  setRefreshToken(token: string | null, options?: { autoLogin?: boolean }) {
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      if (!token) {
        clearClientAuthCookies();
        deleteCookie(AUTH_HINT_COOKIE);
        return;
      }

      const hasExplicitAutoLogin = typeof options?.autoLogin === 'boolean';
      const autoLogin = hasExplicitAutoLogin
        ? options.autoLogin
        : getCookie(AUTO_LOGIN_COOKIE) === '1';

      clearClientAuthCookies();
      if (hasExplicitAutoLogin || getCookie(AUTH_HINT_COOKIE) !== '1') {
        setAuthHint(autoLogin);
      }
    }
  }

  getToken() {
    return this.token;
  }

  getRefreshToken() {
    return this.refreshToken;
  }

  /**
   * Refresh token 으로 access token 교환. 결과 access token 반환 (실패 시 null).
   * 동시에 여러 요청이 호출하면 in-flight promise 공유 → 서버 부하 / race 제거.
   */
  async refreshAccessToken(): Promise<string | null> {
    if (!this.refreshToken && (!this.canAttemptCookieRefresh() || !this.hasAuthHint())) return null;
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const body = this.refreshToken ? JSON.stringify({ refresh_token: this.refreshToken }) : undefined;
        const res = await fetchWithTimeout(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'include',
          body,
        });
        if (!res.ok) {
          // 401/403 → refresh token 도 만료 또는 revoked. 둘 다 폐기.
          if (res.status === 401 || res.status === 403) {
            this.setToken(null);
            this.setRefreshToken(null);
          }
          return null;
        }
        const env = parseApiEnvelope<{ token: string; refresh_token?: string }>(await res.json());
        if (!env.success || !env.data?.token) return null;
        this.setToken(env.data.token);
        if (env.data.refresh_token) this.setRefreshToken(env.data.refresh_token);
        return env.data.token;
      } catch {
        return null;
      }
    })();

    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestInit & { _retried?: boolean }
  ): Promise<ApiResponse<T>> {
    const { _retried, ...fetchOptions } = options ?? {};
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetchWithTimeout(`${this.baseUrl}${path}`, {
      method,
      headers,
      credentials: fetchOptions.credentials ?? 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...fetchOptions,
    });

    // 401 + refresh 가능 + 미재시도 + refresh 대상 엔드포인트인 경우 → access 교환 후 재시도.
    if (
      res.status === 401 &&
      !options?._retried &&
      this.shouldAttemptRefresh(path) &&
      (this.refreshToken || (this.canAttemptCookieRefresh() && this.hasAuthHint()))
    ) {
      const newToken = await this.refreshAccessToken();
      if (newToken) {
        return this.request<T>(method, path, body, { ...options, _retried: true });
      }
    }

    return this.handleResponse<T>(res);
  }

  private async handleResponse<T>(res: Response): Promise<ApiResponse<T>> {
    let data: ApiResponse<T>;
    try {
      data = parseApiEnvelope<T>(await res.json());
    } catch {
      data = {
        success: false,
        message: res.statusText || 'API Error',
      };
    }

    if (!res.ok) {
      if (res.status === 401 && this.token) {
        // refresh 도 실패한 끝-단계 401 → 세션 만료 처리.
        this.setToken(null);
        this.setRefreshToken(null);
        if (typeof window !== 'undefined') {
          // Dispatch custom event so auth store can react
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
      }
      // API 는 오류를 영어로 준다. 화면(토스트 등)에는 한국어로 내고 원문은 rawMessage 로 남긴다.
      // errors.code(EMAIL_NOT_VERIFIED 등)는 번역하면 사라지므로 원문 그대로 따로 싣는다.
      const rawCode = (data.errors as Record<string, unknown> | undefined)?.code;
      throw new ApiError(
        koreanApiErrorMessage(data.message, res.status),
        res.status,
        koreanApiFieldErrors(data.errors as Record<string, string | string[]> | undefined, res.status),
        data.message,
        typeof rawCode === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode) ? rawCode : undefined
      );
    }

    return data;
  }

  get<T>(path: string, options?: { params?: Record<string, unknown> }) {
    let url = path;
    if (options?.params) {
      const query = Object.entries(options.params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (query) url += (url.includes('?') ? '&' : '?') + query;
    }
    return this.request<T>('GET', url);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body);
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }

  async upload<T>(
    path: string,
    formData: FormData,
    options?: { _retried?: boolean }
  ): Promise<ApiResponse<T>> {
    const { _retried } = options ?? {};
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetchWithTimeout(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    if (
      res.status === 401 &&
      !_retried &&
      this.shouldAttemptRefresh(path) &&
      (this.refreshToken || (this.canAttemptCookieRefresh() && this.hasAuthHint()))
    ) {
      const newToken = await this.refreshAccessToken();
      if (newToken) {
        return this.upload<T>(path, formData, { _retried: true });
      }
    }

    return this.handleResponse<T>(res);
  }
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string>;
  /** 서버가 보낸 원래 메시지(영어일 수 있다). message 는 화면에 낼 한국어. */
  rawMessage?: string;
  /** 서버가 errors.code 로 준 기계용 오류 코드(예: EMAIL_NOT_VERIFIED). */
  code?: string;

  constructor(message: string, status: number, errors?: Record<string, string>, rawMessage?: string, code?: string) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.rawMessage = rawMessage;
    this.code = code;
  }
}

export const api = new ApiClient(API_URL);
export const apiClient = api;

export type * from './shop-types';

/**
 * Server-side auth helpers — RSC / Server Components 에서 사용.
 *
 * 클라이언트의 useAuthStore.initialize 는 cookie 읽기가 client-only 라
 * SSR 시점엔 항상 user=null. 결과: 헤더가 "로그인" 으로 그려진 다음 hydration 후
 * "내 닉네임" 으로 바뀜 — flashing.
 *
 * 이 헬퍼는 cookies() 로 access token 읽어 /v1/auth/me 호출 → server 에서 user 확정.
 * RootLayout 이 이 결과를 AuthProvider 의 initialUser 로 전달하면 client 가 첫
 * 렌더부터 정확한 user 상태로 시작.
 *
 * 토큰 만료/네트워크 실패 시 null 반환 — UX 막지 않음 (그 페이지는 비로그인 상태로 렌더).
 * refresh 흐름은 client 가 hydration 후 자동 시도.
 */
import { cookies } from 'next/headers';
import { apiBaseUrlForRuntime } from '@/lib/config';
import { parseApiEnvelope } from '@/lib/api-response';

const TOKEN_COOKIE = 'g5_token';

export interface ServerUser {
  mb_id: string;
  mb_nick: string;
  mb_name: string;
  mb_email: string;
  mb_level: number;
  mb_point: number;
  mb_icon_path?: string;
  mb_image_path?: string;
  is_super_admin?: boolean;
}

export async function getCurrentUser(): Promise<ServerUser | null> {
  const jar = await cookies();
  const token = jar.get(TOKEN_COOKIE)?.value;
  if (!token) return null;

  const apiUrl = apiBaseUrlForRuntime();
  try {
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      // Per-user auth state must not be shared or kept stale across requests.
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const env = parseApiEnvelope<{
      member: Record<string, string | number | undefined>;
      is_super_admin?: boolean;
    }>(await res.json());
    if (!env.success || !env.data?.member) return null;

    const m = env.data.member;
    const mbId = String(m.mb_id ?? '');
    if (!mbId) return null;
    return {
      mb_id: mbId,
      mb_nick: String(m.mb_nick ?? ''),
      mb_name: String(m.mb_name ?? ''),
      mb_email: String(m.mb_email ?? ''),
      mb_level: Number(m.mb_level ?? 0),
      mb_point: Number(m.mb_point ?? 0),
      mb_icon_path: m.mb_icon_path ? String(m.mb_icon_path) : undefined,
      mb_image_path: m.mb_image_path ? String(m.mb_image_path) : undefined,
      is_super_admin: !!env.data.is_super_admin,
    };
  } catch {
    // 네트워크 단절 / API 다운 — 비로그인 fallback. 사용자는 hydration 후 회복.
    return null;
  }
}

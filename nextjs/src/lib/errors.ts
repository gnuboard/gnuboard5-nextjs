/**
 * unknown 에러에서 user-facing 메시지 안전 추출.
 *
 * 사용 패턴:
 *   try { ... } catch (e: unknown) {
 *     toast.error(errorMessage(e, '저장에 실패했어요'));
 *   }
 *
 * - ApiError: 서버가 보낸 user-friendly message 우선.
 * - 일반 Error: .message.
 * - 문자열 / { message: string }: 그대로.
 * - 그 외: fallback.
 *
 * `catch (e: any)` 패턴 대신 `catch (e: unknown)` 으로 표준화.
 */
import { ApiError } from '@/lib/api';

export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return fallback;
}

/**
 * ApiError 인스턴스인지 판정 + 상태 코드별 분기 헬퍼.
 */
export function isAuthError(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403);
}

export function isNotFoundError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

export function isThrottleError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 429;
}

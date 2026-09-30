/**
 * 가벼운 A/B feature flag — 운영자가 NEXT_PUBLIC_FEATURE_FLAGS 환경변수에
 * JSON 으로 정의. GrowthBook / Statsig 도입 전 prototype 용.
 *
 *   NEXT_PUBLIC_FEATURE_FLAGS='{"newCheckout":true,"miniCart":1,"abTestArm":"B"}'
 *
 * 사용:
 *   import { useFlag, getFlag } from '@/lib/flags';
 *   const enabled = useFlag('newCheckout', false);  // client (re-renders on toggle)
 *   const arm = getFlag('abTestArm', 'A');           // any context
 *
 * 추후 GrowthBook 통합 시 이 모듈만 갈아치우면 호출 사이트 변경 0.
 */
type FlagValue = boolean | number | string | null;
type FlagMap = Record<string, FlagValue>;

let cached: FlagMap | null = null;

function loadFlags(): FlagMap {
  if (cached) return cached;
  const raw = process.env.NEXT_PUBLIC_FEATURE_FLAGS;
  if (!raw) {
    cached = {};
    return cached;
  }
  try {
    cached = JSON.parse(raw) as FlagMap;
  } catch {
    cached = {};
  }
  return cached;
}

export function getFlag<T extends FlagValue>(key: string, fallback: T): T {
  const v = loadFlags()[key];
  return (v === undefined || v === null ? fallback : (v as T));
}

/**
 * Hook 형태 — env-based 라 re-render 트리거 없음. 런타임 토글이 필요하면
 * GrowthBook SDK 로 교체 시점에서 본 hook 만 client-side hydrate 로 갱신.
 */
export function useFlag<T extends FlagValue>(key: string, fallback: T): T {
  return getFlag(key, fallback);
}

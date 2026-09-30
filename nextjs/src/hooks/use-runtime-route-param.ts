"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useParams, usePathname } from "next/navigation";
import { currentPathForRuntime } from "@/lib/config";

const DEFAULT_SENTINELS = new Set(["__g5_static__", "0"]);
const EMPTY_SENTINELS: string[] = [];

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function firstParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchPatternPart(
  patternPart: string,
  value: string,
  params: Record<string, string>
): boolean {
  if (!patternPart.includes(":")) {
    return patternPart === value;
  }

  if (patternPart.startsWith(":") && !patternPart.slice(1).includes(":")) {
    params[patternPart.slice(1)] = decodeSegment(value);
    return true;
  }

  const names: string[] = [];
  let source = "^";
  let index = 0;

  while (index < patternPart.length) {
    if (patternPart[index] === ":") {
      const nameMatch = patternPart.slice(index + 1).match(/^[A-Za-z0-9_]+/);
      if (nameMatch) {
        names.push(nameMatch[0]);
        source += "([^/]+)";
        index += nameMatch[0].length + 1;
        continue;
      }
    }

    source += escapeRegex(patternPart[index]);
    index += 1;
  }

  source += "$";
  const match = value.match(new RegExp(source));
  if (!match) return false;

  names.forEach((name, nameIndex) => {
    params[name] = decodeSegment(match[nameIndex + 1]);
  });

  return true;
}

function subscribeRuntimePath(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);

  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("hashchange", onChange);
  };
}

export function extractRuntimeRouteParams(
  pathname: string,
  pattern: string | string[]
): Record<string, string> | null {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];

  for (const item of patterns) {
    const matched = extractRuntimeRouteParamsForPattern(pathname, item);
    if (matched) return matched;
  }

  return null;
}

function extractRuntimeRouteParamsForPattern(
  pathname: string,
  pattern: string
): Record<string, string> | null {
  const pathParts = trimSlashes(pathname).split("/").filter(Boolean);
  const patternParts = trimSlashes(pattern).split("/").filter(Boolean);

  if (pathParts.length !== patternParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i += 1) {
    const part = patternParts[i];
    const value = pathParts[i];

    if (!matchPatternPart(part, value, params)) {
      return null;
    }
  }

  return params;
}

function subscribeNothing(): () => void {
  return () => undefined;
}

/**
 * 브라우저가 실제 주소를 읽었으면 true.
 *
 * 하이드레이션 첫 렌더에서는 false 다. 그 렌더의 useRuntimeRouteParam 은 서버용 주소 "/" 로
 * 계산하므로, 정적 셸(__g5_static__)에서는 id 가 빈 문자열이 된다. 그때 "id 없음 → 찾을 수 없음"
 * 으로 판정하면 한 프레임 동안 "찾을 수 없음 + fallback 안내"가 번쩍인다. id 가 비었을 때의
 * 판정은 이 값이 true 가 된 뒤로 미룬다.
 */
export function useRuntimeRouteReady(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
}

export function useRuntimeRouteParam(
  name: string,
  pattern: string | string[],
  fallback?: string | string[],
  options: { sentinelValues?: string[] } = {}
): string {
  const pathname = usePathname();
  const params = useParams<Record<string, string | string[]>>();
  const sentinelValues = options.sentinelValues ?? EMPTY_SENTINELS;
  const runtimePath = useSyncExternalStore(
    subscribeRuntimePath,
    () => currentPathForRuntime(pathname || undefined),
    () => "/"
  );

  return useMemo(() => {
    const sentinelSet = new Set([...DEFAULT_SENTINELS, ...sentinelValues]);
    const matched = extractRuntimeRouteParams(runtimePath, pattern)?.[name];
    if (matched && !sentinelSet.has(matched)) {
      return matched;
    }

    const fallbackValue = firstParamValue(fallback);
    if (fallbackValue && !sentinelSet.has(fallbackValue)) {
      return fallbackValue;
    }

    const routeValue = firstParamValue(params?.[name]);
    if (routeValue && !sentinelSet.has(routeValue)) {
      return routeValue;
    }

    return "";
  }, [fallback, name, params, pattern, runtimePath, sentinelValues]);
}

export const DEFAULT_RUNTIME_CONFIG_KEY = "__G5_APP_CONFIG__";
export const LEGACY_RUNTIME_CONFIG_KEY = "__G5_NEXTJS25_CONFIG__";

import type { RuntimeSeoConfig } from "@/lib/seo-config";

export interface RuntimeConfigScriptPayload {
  apiBaseUrl: string;
  g5BaseUrl: string;
  appBaseUrl: string;
  themeSource: string;
  seo?: RuntimeSeoConfig;
  siteName?: string;
}

export function normalizeRuntimeConfigKey(value: string | undefined): string {
  return value?.trim() || DEFAULT_RUNTIME_CONFIG_KEY;
}

export function safeJsonForInlineScript(value: unknown): string {
  return (JSON.stringify(value) ?? "null").replace(/[<>&\u2028\u2029]/g, (char) => {
    switch (char) {
      case "<":
        return "\\u003c";
      case ">":
        return "\\u003e";
      case "&":
        return "\\u0026";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        return char;
    }
  });
}

export function runtimeConfigScriptSource(
  payload: RuntimeConfigScriptPayload,
  options: { runtimeConfigKey?: string } = {}
): string {
  const runtimeConfigKey = normalizeRuntimeConfigKey(options.runtimeConfigKey);
  const runtimeConfigKeyJson = safeJsonForInlineScript(runtimeConfigKey);
  const legacyRuntimeConfigKeyJson = safeJsonForInlineScript(LEGACY_RUNTIME_CONFIG_KEY);

  return [
    `var __g5cfg = window[${runtimeConfigKeyJson}] || window[${legacyRuntimeConfigKeyJson}] || {};`,
    `window[${runtimeConfigKeyJson}] = Object.assign(${safeJsonForInlineScript(payload)}, __g5cfg);`,
    `window[${legacyRuntimeConfigKeyJson}] = window[${runtimeConfigKeyJson}];`,
  ].join("");
}

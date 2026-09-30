"use client";

/**
 * Report a caught error instead of silently swallowing it.
 *
 * Use in client-side `catch` blocks where the UI intentionally degrades (e.g.
 * falls back to cached/empty data) but the failure should still be observable.
 * Keep this helper free of static Sentry imports so static builds do not pull
 * server-only instrumentation into client-only fallback paths.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  console.error("[reportError]", context?.scope ?? "", error);
}

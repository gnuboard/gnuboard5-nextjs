/**
 * Server-side fetch with a hard timeout.
 *
 * The shop proxy routes forward to a legacy PHP backend. Without a timeout, a
 * stalled backend keeps the Next.js request handler open indefinitely, which
 * under load exhausts the handler pool and takes down the whole app. This wraps
 * fetch with an AbortController so every upstream call fails fast instead.
 */

/** Default upstream timeout for legacy shop proxy calls (ms). */
export const DEFAULT_PROXY_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_PROXY_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True when an error is the AbortError thrown by fetchWithTimeout on timeout.
 * Lets callers distinguish "backend too slow" from other network failures.
 */
export function isFetchTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  );
}

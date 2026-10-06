/**
 * 로그인 · 소셜 로그인 뒤에 돌아갈 주소(?redirect=)를 이 사이트 안의 경로로만 받는다. 다른 사이트면 null.
 *
 * new URL(값, 이 사이트) 로 풀어 출처를 비교한 뒤 경로만 다시 붙이는데, "..//evil.com" 같은 값은
 * "https://이 사이트//evil.com" 으로 풀려 출처 검사를 통과하고 경로가 "//evil.com" 으로 남는다.
 * "//" 로 시작하는 경로는 브라우저가 다른 사이트 주소로 읽으므로 거른다.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value || typeof window === "undefined") return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}

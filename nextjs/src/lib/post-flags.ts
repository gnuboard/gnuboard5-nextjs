/** 글 · 댓글의 비밀 여부를 가진 것 — API 의 is_secret 과 그누보드 wr_option("html1,secret,mail" 같은 쉼표 목록). */
export interface SecretFlagSource {
  is_secret?: boolean | null;
  wr_option?: string | null;
}

/**
 * 비밀글인가: API 가 준 is_secret, 없으면 wr_option 에 "secret" 이 들었나
 * (API 의 api_is_secret_option() · 그누보드 원본 strstr($wr_option, 'secret') 과 같은 판정).
 * 글쓰기 수정 화면 · 홈 위젯 · 쇼핑 홈 공지가 같이 쓴다.
 */
export function isSecretPost(post: SecretFlagSource): boolean {
  return Boolean(post.is_secret) || String(post.wr_option || "").includes("secret");
}

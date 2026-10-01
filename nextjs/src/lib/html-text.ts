/**
 * HTML 에서 글자만 뽑는다 — 카드의 한두 줄 요약용.
 *
 * 결과는 React 가 텍스트로 그리므로(자동 이스케이프) 정화가 필요 없다. 그래서 sanitize-html
 * (htmlparser2 포함 약 180KB)을 부르는 lib/sanitize.ts 의 htmlToPlainText 대신 이것을 쓴다 —
 * 목록 화면 번들에 HTML 파서가 들어가지 않게. 결과를 dangerouslySetInnerHTML 에 넣지 말 것.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntity(entity: string, body: string): string {
  if (body.startsWith("#")) {
    const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
}

export function htmlToText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity)
    .replace(/\s+/g, " ")
    .trim();
}

export type DefaultContentLink = {
  co_id: string;
  label: string;
  strong?: boolean;
};

export const DEFAULT_CONTENT_LINKS: DefaultContentLink[] = [
  { co_id: "company", label: "회사소개" },
  { co_id: "privacy", label: "개인정보처리방침", strong: true },
  { co_id: "provision", label: "이용약관" },
];

export function contentHref(coId: string) {
  return `/content/${encodeURIComponent(coId)}`;
}

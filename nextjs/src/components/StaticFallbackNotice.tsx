import { Info } from "lucide-react";

type StaticFallbackKind = "post" | "product" | "board" | "content" | "category" | "event" | "page";

type StaticFallbackNoticeProps = {
  kind?: StaticFallbackKind;
  className?: string;
};

const labels: Record<StaticFallbackKind, string> = {
  post: "게시글",
  product: "상품",
  board: "게시판",
  content: "안내 페이지",
  category: "상품 분류",
  event: "기획전",
  page: "페이지",
};

/**
 * 정적 셸이 실제 기록을 못 찾았을 때 개발자에게 이유를 알려 주는 상자.
 * "static export", "Vercel" 같은 개발 용어라 운영 빌드에서는 그리지 않는다 — 손님에게는 각 화면의
 * "찾을 수 없습니다" 문구와 돌아가기 단추만 보인다.
 */
export function StaticFallbackNotice({ kind = "page", className }: StaticFallbackNoticeProps) {
  if (process.env.NODE_ENV === "production") return null;

  const label = labels[kind];

  return (
    <div
      className={[
        "mt-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-left text-sm text-base-content",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex gap-3">
        <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold">정적 미리보기 fallback 페이지입니다.</p>
          <p>
            이 {label}이 실제로 없을 수도 있지만, static export 배포에서는 빌드 후
            새로 생긴 상세 URL을 즉시 렌더링하지 못할 수 있습니다. 운영 Vercel
            프로젝트는 server runtime 배포를 사용하면 새 상세 URL을 바로 확인할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface MypagePanelProps {
  title: ReactNode;
  /** 제목 아래 한 줄 설명. */
  description?: ReactNode;
  /** 제목 오른쪽 단추(쪽지 쓰기 · 모두 읽음 등). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * 마이페이지 메뉴 화면의 흰 카드 한 장 — 제목 · 설명 · 오른쪽 단추 · 본문을 같은 틀에 둔다.
 * 스크랩 · 프로필 수정처럼 화면 전체가 카드 하나에 담겨야 회색 바탕 위에서 메뉴마다 모양이 같다.
 */
export function MypagePanel({ title, description, actions, children }: MypagePanelProps) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

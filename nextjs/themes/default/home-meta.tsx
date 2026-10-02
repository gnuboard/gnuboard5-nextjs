import { UserRound } from "lucide-react";
import { MemberSideview } from "@/components/MemberSideview";
import { formatListDate } from "@/lib/utils";

/**
 * 첫 화면 목록의 날짜 — 레퍼런스 latest 스킨의 datetime2 처럼 오늘 글은 "17:33", 그 밖은 "09-24".
 * 해가 지난 글도 월-일만 쓴다(연도까지 쓰면 좁은 행에서 제목이 밀린다).
 */
/** 목록 줄 날짜 — 앱 공용 formatListDate(오늘이면 시:분, 아니면 월-일). 테마 안에서 부르던 이름을 그대로 둔다. */
export function soluneListDate(datetime: string): string {
  return formatListDate(datetime);
}

export type SoluneAuthorInfo = {
  mbId?: string | null;
  name: string;
  email?: string | null;
  homepage?: string | null;
  iconUrl?: string | null;
};

/**
 * 목록 · 갤러리의 글쓴이. 레퍼런스처럼 회원은 사진(없으면 회색 기본 얼굴) + 이름이고 누르면 회원
 * 사이드뷰가 열린다. 비회원은 이름 글자만(MemberSideview 가 사진을 떼고 글자만 낸다).
 */
export function SoluneAuthor({ author, className }: { author: SoluneAuthorInfo; className: string }) {
  const name = author.name.trim();
  if (!name) return null;

  return (
    <MemberSideview
      mbId={author.mbId}
      name={name}
      email={author.email}
      homepage={author.homepage}
      className={className}
    >
      <span className="solune-author-photo" aria-hidden="true">
        {author.iconUrl ? (
          // 회원 사진은 그누보드 data 폴더의 작은 그림이라 next/image 최적화를 거치지 않는다.
          <img src={author.iconUrl} alt="" width={22} height={22} loading="lazy" />
        ) : (
          <UserRound size={14} strokeWidth={2.2} />
        )}
      </span>
      <span className="solune-author-name">{name}</span>
    </MemberSideview>
  );
}

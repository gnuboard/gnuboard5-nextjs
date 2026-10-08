"use client";

import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { g5PhpUrlForRuntime } from "@/lib/config";
import { shouldBypassImageOptimization } from "@/lib/image";
import { useAuthStore } from "@/store/auth";
import { useMemberKey, type MemberKeyState } from "@/hooks/useMemberKey";
import { memberProfilePath, memberRecentPath } from "@/lib/member-key";

export interface MemberSideviewProps {
  /** g5_member.mb_id. 비회원이면 비어 있거나 undefined 입니다. */
  mbId?: string | null;
  /** 화면에 표시할 회원 이름 또는 닉네임입니다. */
  name: string;
  /** 메일보내기 메뉴를 노출할 이메일입니다. */
  email?: string | null;
  /** 홈페이지 메뉴를 노출할 URL입니다. */
  homepage?: string | null;
  /** 회원 아이콘 URL입니다. */
  iconUrl?: string | null;
  /** 작성자 검색 메뉴를 현재 게시판으로 제한할 때 사용합니다. */
  boTable?: string | null;
  className?: string;
  /** 이름 단추 안에 넣을 내용. 없으면 회원 아이콘 + 이름을 쓴다(테마가 자기 아바타를 넣을 때). */
  children?: React.ReactNode;
}

const ICON_SIZE = 18;

export function MemberSideview({
  mbId,
  name,
  email,
  homepage,
  iconUrl,
  boTable,
  className,
  children,
}: MemberSideviewProps) {
  const isSuperAdmin = useAuthStore((state) => !!state.user?.is_super_admin);

  if (!mbId) {
    if (boTable && name) {
      return (
        <Link
          href={`/search?bo_table=${encodeURIComponent(boTable)}&sfl=wr_name&stx=${encodeURIComponent(name)}`}
          className={cn("hover:underline", className)}
          rel="nofollow"
        >
          {name}
        </Link>
      );
    }
    // 비회원은 레퍼런스(sv_guest 없는 첫 화면 · 새글)처럼 이름 글자만 — 아바타도 누를 거리도 없다.
    return <span className={cn("member-sideview-guest", className)}>{name}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          aria-label={`${name} 회원 메뉴 열기`}
        >
          {children ?? (
            <>
              {iconUrl ? (
                <Image
                  src={iconUrl}
                  alt=""
                  width={ICON_SIZE}
                  height={ICON_SIZE}
                  className="rounded-full"
                  unoptimized={shouldBypassImageOptimization(iconUrl)}
                />
              ) : null}
              <span>{name}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="member-sideview-menu w-44 p-1" align="start">
        <SideviewMenu mbId={mbId} email={email} homepage={homepage} boTable={boTable} isSuperAdmin={isSuperAdmin} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * 펼친 메뉴. 메뉴가 열릴 때만 그려지므로 회원 공개 키도 그때 묻는다 — 자기소개 · 전체게시물 주소에는
 * 아이디 대신 그 키를 쓴다(검색엔진 · 링크로 아이디가 퍼지지 않게). 없는 회원이면 두 항목을 숨기고,
 * 잠깐 묻지 못했으면(요청 한도 · 네트워크) 흐리게 두었다가 메뉴를 다시 열 때 다시 묻는다.
 */
function SideviewMenu({
  mbId,
  email,
  homepage,
  boTable,
  isSuperAdmin,
}: {
  mbId: string;
  email?: string | null;
  homepage?: string | null;
  boTable?: string | null;
  isSuperAdmin: boolean;
}) {
  const memberKey = useMemberKey(mbId);

  return (
    <ul className="text-sm">
      <SideviewItem href={`/mypage/memos/new?recv=${encodeURIComponent(mbId)}`}>
        쪽지보내기
      </SideviewItem>

      {email ? (
        <SideviewItem href={`mailto:${email}`} external>
          메일보내기
        </SideviewItem>
      ) : null}

      {homepage ? (
        <SideviewItem href={ensureHttp(homepage)} external>
          홈페이지
        </SideviewItem>
      ) : null}

      <MemberKeyItem memberKey={memberKey} href={(key) => memberProfilePath(mbId, key)}>
        자기소개
      </MemberKeyItem>

      {boTable ? (
        <SideviewItem
          href={`/search?bo_table=${encodeURIComponent(boTable)}&sfl=mb_id&stx=${encodeURIComponent(mbId)}`}
        >
          아이디로 검색
        </SideviewItem>
      ) : null}

      <MemberKeyItem memberKey={memberKey} href={(key) => memberRecentPath(mbId, key)}>
        전체게시물
      </MemberKeyItem>

      {/* 그누보드 get_sideview 처럼 최고관리자에게만 관리자 화면의 회원 수정 · 포인트 내역을 새 탭으로 연다. */}
      {isSuperAdmin ? (
        <>
          <SideviewItem href={g5PhpUrlForRuntime(`/adm/member_form.php?w=u&mb_id=${encodeURIComponent(mbId)}`)} external>
            회원정보변경
          </SideviewItem>
          <SideviewItem href={g5PhpUrlForRuntime(`/adm/point_list.php?sfl=mb_id&stx=${encodeURIComponent(mbId)}`)} external>
            포인트내역
          </SideviewItem>
        </>
      ) : null}

    </ul>
  );
}

/** 회원 공개 키로 주소를 만드는 항목. 묻는 중 · 잠깐 실패면 누를 수 없게, 없는 회원이면 숨긴다. */
function MemberKeyItem({
  memberKey,
  href,
  children,
}: {
  memberKey: MemberKeyState;
  href: (key: string) => string;
  children: React.ReactNode;
}) {
  if (memberKey.status === "missing") return null;
  if (memberKey.status === "ready") {
    return <SideviewItem href={href(memberKey.key)}>{children}</SideviewItem>;
  }
  const failed = memberKey.status === "error";
  return (
    <li>
      <span
        aria-disabled="true"
        title={failed ? "잠시 후 메뉴를 다시 열어 주세요." : undefined}
        className={cn(
          "block rounded px-2 py-1.5 text-muted-foreground",
          failed ? "cursor-not-allowed" : "cursor-progress",
        )}
      >
        {children}
      </span>
    </li>
  );
}

function SideviewItem({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  if (external) {
    return (
      <li>
        <a
          href={href}
          target="_blank"
          rel="noopener nofollow"
          className="block rounded px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
        >
          {children}
        </a>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={href}
        className="block rounded px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
      >
        {children}
      </Link>
    </li>
  );
}

function ensureHttp(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `http://${url}`;
}

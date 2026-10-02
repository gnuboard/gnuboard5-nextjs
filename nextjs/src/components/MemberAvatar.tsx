"use client";

import { useState } from "react";
import Image from "next/image";
import { shouldBypassImageOptimization } from "@/lib/image";
import { memberAvatarUrl, memberInitial, type MemberAvatarSource } from "@/lib/member-avatar";
import { cn } from "@/lib/utils";

interface MemberAvatarProps {
  /** 그림이 없을 때 첫 글자를 뽑을 이름(닉네임) */
  name?: string | null;
  /** mb_image_path · mb_icon_path 를 가진 것(글 · 목록 줄 · 회원) */
  member?: MemberAvatarSource | null;
  /** 원의 크기 · 색은 테마 클래스가 정한다(예: solune-avatar solune-view-avatar) */
  className?: string;
  /** next/image 에 넘길 화면 크기(px) — 원의 실제 크기와 맞추면 된다 */
  size?: number;
}

/**
 * 회원 아바타 원. 회원이미지(프로필 사진) → 회원아이콘 → 이니셜 순서(memberAvatarUrl).
 * 그림 주소가 깨지면(지운 파일 · 막힌 주소) 빈 원 대신 이니셜로 돌아간다.
 * 장식이라 읽지 않는다 — 이름은 바로 옆 글쓴이 링크가 읽힌다.
 */
export function MemberAvatar({ name, member, className, size = 40 }: MemberAvatarProps) {
  const url = memberAvatarUrl(member);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== "" && failedUrl !== url;

  return (
    <span className={cn("member-avatar overflow-hidden", className)} aria-hidden="true">
      {showImage ? (
        <Image
          src={url}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          unoptimized={shouldBypassImageOptimization(url)}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        memberInitial(name)
      )}
    </span>
  );
}

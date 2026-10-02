"use client";

import { useEffect, useState } from "react";
import { getMemberKey } from "@/services/member";

/**
 * 회원 공개 키 묻기(services/member getMemberKey)의 상태.
 *  - loading: 묻는 중
 *  - ready: key 를 받았다("" 이면 키를 만들 수 없는 설치본 — 예전 주소로 물러선다)
 *  - missing: 없는 회원(탈퇴 · 차단 포함)
 *  - error: 잠깐의 실패(요청 한도 · 네트워크). 다시 열면 다시 묻는다.
 */
export type MemberKeyState =
  | { status: "loading" }
  | { status: "ready"; key: string }
  | { status: "missing" }
  | { status: "error" };

export function useMemberKey(mbId: string): MemberKeyState {
  const [result, setResult] = useState<{ mbId: string; state: MemberKeyState } | null>(null);

  useEffect(() => {
    let ignore = false;
    getMemberKey(mbId)
      .then((key) => {
        if (!ignore) setResult({ mbId, state: key === null ? { status: "missing" } : { status: "ready", key } });
      })
      .catch(() => {
        if (!ignore) setResult({ mbId, state: { status: "error" } });
      });
    return () => {
      ignore = true;
    };
  }, [mbId]);

  return result && result.mbId === mbId ? result.state : { status: "loading" };
}

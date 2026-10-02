"use client";

import { useEffect, useState } from "react";
import { getMemberKey } from "@/services/member";

/**
 * 회원 공개 키를 묻는다(services/member getMemberKey). 묻는 중이면 undefined,
 * 없는 회원 · 실패면 null, 키를 만들 수 없는 설치본이면 "".
 */
export function useMemberKey(mbId: string): string | null | undefined {
  const [result, setResult] = useState<{ mbId: string; key: string | null } | null>(null);

  useEffect(() => {
    let ignore = false;
    getMemberKey(mbId).then((key) => {
      if (!ignore) setResult({ mbId, key });
    });
    return () => {
      ignore = true;
    };
  }, [mbId]);

  return result && result.mbId === mbId ? result.key : undefined;
}

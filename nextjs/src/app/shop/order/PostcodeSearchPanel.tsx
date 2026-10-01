"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toastError } from "@/lib/toast";
import type { DaumPostcodeData } from "@/types/daum-postcode";

/** 위젯이 첫 높이를 알려 주기 전까지 쓸 값. 검색 전 안내 화면이 대략 이 높이다. */
const INITIAL_HEIGHT = 420;
/** 좁은 화면에서는 제안 목록이 길면 화면을 다 덮는다. */
const NARROW_VIEWPORT = 640;

type PostcodeSearchPanelProps = {
  open: boolean;
  /** 패널 제목에 붙는 대상 이름 — 주문자/받는 분 중 어느 쪽 주소인지 알려 준다. */
  label: string;
  onClose: () => void;
  onComplete: (data: DaumPostcodeData) => void;
};

/**
 * 주소 검색을 새 창이 아니라 이 자리에 끼워 넣는다.
 *
 * 새 창으로 띄우면(Postcode.open) 창이 가려지거나 차단되는 일이 있고, 무엇보다 주문서에서
 * 눈이 떠난다. 레거시 그누보드 주문서(js/common.js 의 win_zip 첫 번째 방식)도 같은 이유로
 * 주소 입력칸 옆에 끼워 넣는다. 여기서는 우편번호 칸 바로 아래에 편다.
 *
 * 위젯이 iframe 을 직접 넣으므로 이 div 안은 React 가 건드리지 않는다. 높이는 위젯이
 * onresize 로 알려 주는 값을 따른다 — 검색 결과가 늘면 같이 늘어난다.
 */
export function PostcodeSearchPanel({
  open,
  label,
  onClose,
  onComplete,
}: PostcodeSearchPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT);

  // onComplete 가 매 렌더 새 함수여도 위젯을 다시 끼우지 않도록 최신 값만 들고 있는다.
  // 렌더 중에는 ref 를 고치지 않는다(react-hooks/refs) — 레이아웃 효과는 아래 효과들보다 먼저 돈다.
  const completeRef = useRef(onComplete);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    completeRef.current = onComplete;
    closeRef.current = onClose;
  }, [onComplete, onClose]);

  const handleClose = useCallback(() => {
    closeRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;

    const host = hostRef.current;
    if (!host) return;

    if (!window.daum?.Postcode) {
      toastError(
        "우편번호 검색 서비스를 사용할 수 없습니다. 우편번호와 주소를 직접 입력해 주세요."
      );
      closeRef.current();
      return;
    }

    // 다시 열 때 앞서 넣은 iframe 이 남아 있으면 두 개가 겹친다.
    host.innerHTML = "";
    setHeight(INITIAL_HEIGHT);

    new window.daum.Postcode({
      oncomplete: (data) => {
        completeRef.current(data);
        closeRef.current();
      },
      onresize: (size) => setHeight(size.height),
      width: "100%",
      height: "100%",
      maxSuggestItems: window.innerWidth < NARROW_VIEWPORT ? 6 : 10,
    }).embed(host);

    // 펼쳐진 자리가 화면 밖이면 눈에 보이게 끌어온다.
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    return () => {
      host.innerHTML = "";
    };
  }, [open]);

  // 열려 있는 동안 Esc 로 닫는다.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="mt-2 overflow-hidden rounded-[8px] border border-border bg-background shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
        <p className="text-sm font-semibold text-foreground">{label} 주소 검색</p>
        <button
          type="button"
          onClick={handleClose}
          aria-label="주소 검색 닫기"
          className="inline-flex size-7 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[2px] focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      {/* 위젯이 이 안에 iframe 을 넣는다. 자식은 React 가 관리하지 않는다. */}
      <div ref={hostRef} style={{ height }} />
    </div>
  );
}

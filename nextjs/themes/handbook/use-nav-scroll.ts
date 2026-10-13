"use client";

import { useEffect, useRef, type RefObject } from "react";
import { storageGet, storageSet } from "@/lib/safe-storage";

const STORE_PREFIX = "handbook:nav-scroll:";

/** 기억해 둔 스크롤 위치. 시크릿 창처럼 저장이 막혀 있으면 storageGet 이 null 을 주어 기억하지 않을 뿐이다. */
function read(key: string): number | null {
  const raw = storageGet(key, "session");
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * 지금 읽는 글의 목차 항목. `/dev_manual/23` 에서는 책 목차(`/dev_manual`)까지
 * 함께 활성으로 표시되므로 주소가 가장 긴 것을 고른다.
 */
function activeLink(box: HTMLElement): HTMLElement | null {
  return [...box.querySelectorAll<HTMLElement>(".doc-nav-link.is-active")].reduce<HTMLElement | null>(
    (best, link) =>
      !best || (link.getAttribute("href") ?? "").length > (best.getAttribute("href") ?? "").length
        ? link
        : best,
    null
  );
}

/**
 * 사이드바 목차의 스크롤 위치를 페이지 이동 사이에 기억한다.
 *
 * 챕터 주소(`/dev_manual/23`)는 서버 rewrite 로 만든 짧은 주소여서 Next 클라이언트
 * 라우터가 풀지 못하고 문서를 통째로 다시 읽는다. 그때 사이드바도 새로 만들어져
 * 스크롤이 맨 위로 돌아가고, 방금 고른 항목이 화면 밖으로 사라진다. 위치를 세션에
 * 적어 두었다가 다시 그려질 때 되돌려 놓는다. 적어 둔 위치가 없으면(첫 방문이나
 * 다른 경로로 들어온 경우) 대신 현재 항목을 화면 안으로 데려온다.
 *
 * 책마다 목차가 다르므로 위치도 책별로 따로 기억한다. `pathname` 을 함께 받는
 * 까닭은 현재 항목 표시가 붙는 시점이 마운트보다 한 박자 늦기 때문이다.
 */
export function useNavScrollMemory(
  ref: RefObject<HTMLElement | null>,
  book: string,
  pathname: string
) {
  const restoredFor = useRef<string | null>(null);
  const placedFor = useRef<string | null>(null);

  // 굴린 위치를 계속 적어 둔다.
  useEffect(() => {
    const box = ref.current;
    if (!box) return;

    const storeKey = `${STORE_PREFIX}${book}`;
    let frame = 0;
    const save = () => {
      frame = 0;
      // 보이지 않는 사이드바(관리자 설정으로 숨긴 넓은 화면의 display:none)는 위치가 늘 0 이라 적지 않는다 —
      // 적으면 같은 매뉴얼의 기억해 둔 위치를 0 으로 덮는다.
      if (box.getClientRects().length === 0) return;
      // 저장이 막혀 있으면 storageSet 이 false 를 줄 뿐 — 조용히 넘어간다.
      storageSet(storeKey, String(box.scrollTop), "session");
    };
    const onScroll = () => {
      // 스크롤 한 번에 한 번만 적는다.
      if (frame === 0) frame = requestAnimationFrame(save);
    };

    box.addEventListener("scroll", onScroll, { passive: true });
    // 문서를 통째로 다시 읽는 이동이라도 떠나기 직전 값은 남긴다.
    window.addEventListener("pagehide", save);

    return () => {
      box.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [ref, book]);

  // 책 하나당 한 번만 자리를 잡는다.
  useEffect(() => {
    const box = ref.current;
    if (!box || placedFor.current === book) return;

    // 기억해 둔 자리로 되돌린다. 되돌리는 것도 책 하나당 한 번뿐이라, 그 사이에
    // 사람이 목차를 굴렸다면 그 자리를 빼앗지 않는다.
    if (restoredFor.current !== book) {
      restoredFor.current = book;
      const saved = read(`${STORE_PREFIX}${book}`);
      if (saved !== null) box.scrollTop = saved;
    }

    // 현재 항목 표시는 한 박자 뒤에 붙는다. 아직 없으면 다음 기회를 기다린다.
    const active = activeLink(box);
    if (!active) return;

    // 되돌린 자리에서 지금 읽는 글이 안 보이면 화면 한가운데로 데려온다.
    const frame = box.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.top < frame.top || item.bottom > frame.bottom) {
      box.scrollTop = Math.max(0, box.scrollTop + (item.top - frame.top) - box.clientHeight / 2);
    }
    placedFor.current = book;
  }, [ref, book, pathname]);
}

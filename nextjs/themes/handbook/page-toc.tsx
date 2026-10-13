"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type TocItem = { slug: string; text: string; level: 2 | 3 };

/**
 * 목차로 삼을 제목. 글 본문(.prose) 안만 본다 — 본문 밖의 "댓글" 같은 제목까지
 * 넣으면 문서 목차가 아니라 화면 구조 목록이 된다. h1 은 글 제목이라 뺀다.
 */
const CONTENT_SELECTOR = "#main-content .prose";
const HEADING_SELECTOR = `${CONTENT_SELECTOR} h2, ${CONTENT_SELECTOR} h3`;
/** 이만큼도 안 되는 글은 목차를 만들어 봐야 화면만 어지럽다. */
const MIN_ITEMS = 2;
/** 본문이 다시 그려질 때마다 훑지 않도록 잠시 모아서 처리한다. */
const RESCAN_DELAY = 200;
/** 상단 바 아래로 제목이 들어왔다고 볼 지점. */
const HEADER_OFFSET = 120;

/** 주소의 #앵커를 푼다. "#100%" 처럼 % 가 잘못 들어 있으면 그대로 둔다 — 던지면 화면 전체가 오류 화면이 된다. */
function decodeHash(hash: string): string {
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

function slugify(text: string, index: number): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return base ? `${base}-${index}` : `section-${index}`;
}

function sameList(a: TocItem[], b: TocItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.slug === b[i].slug && item.text === b[i].text);
}

/**
 * 오른쪽 문서 목차. 본문의 제목을 훑어 만들고, 스크롤에 따라 지금 읽는 절을 표시한다.
 *
 * 본문은 게시글 HTML 을 앱이 통째로 그린 영역이라 React 가 관리한다. 그래서 제목에
 * id 를 붙이면 서버가 보낸 HTML 과 달라져 하이드레이션 불일치가 난다. 대신 제목
 * 요소를 그대로 들고 있으면서 이동과 관찰을 하고, 주소의 앵커는 글자에서 만든
 * 이름(slug)으로 흉내 낸다 — 링크를 복사해 다시 열어도 그 자리를 찾아간다.
 */
export function HandbookPageToc() {
  const pathname = usePathname();
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeSlug, setActiveSlug] = useState("");
  const activeSlugRef = useRef("");
  const headingsRef = useRef<HTMLHeadingElement[]>([]);

  useEffect(() => {
    activeSlugRef.current = activeSlug;
  }, [activeSlug]);

  const scrollToIndex = useCallback((index: number) => {
    const target = headingsRef.current[index];
    if (!target) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, []);

  useEffect(() => {
    let alive = true;
    let intersection: IntersectionObserver | null = null;
    let timer: number | undefined;
    let openedFromHash = false;

    function watchHeadings(headings: HTMLHeadingElement[], slugs: string[]) {
      intersection?.disconnect();
      if (headings.length === 0) return;

      const indexOf = new Map<Element, number>(headings.map((el, index) => [el, index]));
      const visible = new Set<number>();

      intersection = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const index = indexOf.get(entry.target);
            if (index === undefined) continue;
            if (entry.isIntersecting) visible.add(index);
            else visible.delete(index);
          }

          if (visible.size > 0) {
            setActiveSlug(slugs[Math.min(...visible)]);
            return;
          }

          // 띠 안에 아무것도 없으면(절 하나가 화면보다 길 때) 지나온 마지막 제목을 쓴다.
          const passed = headings.filter((el) => el.getBoundingClientRect().top < HEADER_OFFSET);
          if (passed.length > 0) setActiveSlug(slugs[passed.length - 1]);
        },
        { rootMargin: "-88px 0px -72% 0px", threshold: 0 }
      );

      headings.forEach((el) => intersection?.observe(el));
    }

    function scan() {
      if (!alive) return;

      const headings = Array.from(
        document.querySelectorAll<HTMLHeadingElement>(HEADING_SELECTOR)
      ).filter((el) => (el.textContent || "").trim().length > 0);

      const enough = headings.length >= MIN_ITEMS;
      const next: TocItem[] = enough
        ? headings.map((el, index) => ({
            slug: slugify(el.textContent || "", index),
            text: (el.textContent || "").trim(),
            level: el.tagName === "H3" ? 3 : 2,
          }))
        : [];

      headingsRef.current = enough ? headings : [];
      setItems((prev) => (sameList(prev, next) ? prev : next));

      if (next.length > 0 && !next.some((item) => item.slug === activeSlugRef.current)) {
        setActiveSlug(next[0].slug);
      }

      // 노드가 교체됐을 수 있으므로 목록이 같아도 관찰은 다시 건다.
      watchHeadings(headingsRef.current, next.map((item) => item.slug));

      // 앵커를 달고 들어온 경우 그 자리로 한 번 보내 준다.
      if (!openedFromHash && next.length > 0 && window.location.hash) {
        const wanted = decodeHash(window.location.hash.slice(1));
        const index = next.findIndex((item) => item.slug === wanted);
        if (index >= 0) {
          openedFromHash = true;
          setActiveSlug(next[index].slug);
          window.requestAnimationFrame(() => scrollToIndex(index));
        }
      }
    }

    scan();

    const main =
      document.querySelector(CONTENT_SELECTOR)?.parentElement
      ?? document.getElementById("main-content");
    const mutation = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, RESCAN_DELAY);
    });
    if (main) mutation.observe(main, { childList: true, subtree: true });

    return () => {
      alive = false;
      mutation.disconnect();
      intersection?.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname, scrollToIndex]);

  if (items.length === 0) return null;

  return (
    <aside className="doc-toc" aria-labelledby="doc-toc-heading">
      <div className="doc-toc-inner">
        <p id="doc-toc-heading" className="doc-toc-title">
          이 문서의 목차
        </p>
        <nav aria-label="이 문서의 목차">
          <ul className="doc-toc-list">
            {items.map((item, index) => (
              <li key={item.slug} className={`doc-toc-item is-h${item.level}`}>
                <a
                  href={`#${item.slug}`}
                  className={`doc-toc-link${item.slug === activeSlug ? " is-active" : ""}`}
                  aria-current={item.slug === activeSlug ? "true" : undefined}
                  onClick={(event) => {
                    if (!headingsRef.current[index]) return; // 아직 못 찾았으면 기본 동작에 맡긴다
                    event.preventDefault();
                    scrollToIndex(index);
                    history.replaceState(null, "", `#${item.slug}`);
                    setActiveSlug(item.slug);
                  }}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

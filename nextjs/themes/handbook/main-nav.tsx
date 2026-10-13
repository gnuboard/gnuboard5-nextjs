"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { menuNavLink, type MenuItem } from "@/components/layout/menu";

/** 관리자 > 메뉴설정의 메뉴 한 칸. */
export type SiteMenuItem = {
  label: string;
  href: string;
  target?: "_blank";
  children: SiteMenuItem[];
};

/**
 * 관리자 > 메뉴설정의 메뉴를 기본 테마(Next.js Default)의 메인메뉴와 같은 규칙으로 바꾼다.
 * 메뉴설정은 링크를 그누보드 전체 주소(G5_URL/bbs/board.php?bo_table=notice 등)로 저장하므로
 * 앱 주소(/notice 등)로 바꾸고, 링크가 비었거나 위험한(javascript: 등) 상위 메뉴는 첫 하위 메뉴의 링크로 잇는다.
 */
export function siteMenuItems(menus: MenuItem[]): SiteMenuItem[] {
  return menus
    .map(siteMenuItem)
    .filter((item): item is SiteMenuItem => item !== null);
}

function siteMenuItem(menu: MenuItem): SiteMenuItem | null {
  const label = (menu.me_name || "").trim();
  if (!label) return null;
  const children = siteMenuItems(menu.children ?? []);
  // 링크가 비었거나 위험한 상위 메뉴는 첫 하위 메뉴의 링크로 잇는다 — 빼면 하위 메뉴까지 사라진다(menuNavLink).
  const link = menuNavLink(menu, children);
  return link ? { label, ...link, children } : null;
}

/** 메뉴 링크 하나 — 새 창 · 바깥 주소는 <a>, 사이트 안 주소는 G5Link. 상단 메뉴와 서랍 메뉴가 함께 쓴다. */
export function MenuAnchor({
  item,
  className,
  onNavigate,
  current = false,
  children,
}: {
  item: SiteMenuItem;
  className: string;
  onNavigate?: () => void;
  /** 지금 보고 있는 화면의 메뉴 — aria-current 를 단다(사이드바 메뉴 묶음). */
  current?: boolean;
  children: React.ReactNode;
}) {
  const ariaCurrent = current ? ("page" as const) : undefined;
  if (item.target === "_blank" || /^https?:\/\//i.test(item.href)) {
    return (
      <a
        href={item.href}
        target={item.target}
        rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
        className={className}
        aria-current={ariaCurrent}
        onClick={onNavigate}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} aria-current={ariaCurrent} onClick={onNavigate}>
      {children}
    </Link>
  );
}

/** "더보기" 칸의 번호 — 닫힘(dismissed) 상태를 메뉴 칸과 같은 방식으로 다룬다. */
const MORE_SLOT = -1;

/**
 * 상단 바에 한 줄로 들어가는 메뉴 수. 메뉴가 많으면(관리자 메뉴는 자르지 않는다) 넘치는 것을 "더보기"에 모은다.
 * 숨긴 측정 줄(.doc-mainnav-measure)에서 칸마다 너비를 재 nav 너비와 견준다. 첫 렌더는 모두(서버 HTML 과 같게)이고
 * 화면에 붙은 뒤 잰다. 1280px 미만에서는 nav 가 숨어(너비 0) 서랍 메뉴가 같은 메뉴를 다 보인다.
 */
function useFittingCount(
  navRef: React.RefObject<HTMLElement | null>,
  measureRef: React.RefObject<HTMLUListElement | null>,
  count: number,
  labelsKey: string
): number {
  const [fitting, setFitting] = useState(count);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;
    const update = () => {
      const available = nav.getBoundingClientRect().width;
      const widths = Array.from(measure.children, (element) => element.getBoundingClientRect().width);
      const moreWidth = widths.pop() ?? 0;
      const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
      const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(widths.length - 1, 0);
      if (available === 0 || total <= available) {
        setFitting(count);
        return;
      }
      let used = moreWidth;
      let fits = 0;
      for (const width of widths) {
        if (used + gap + width > available) break;
        used += gap + width;
        fits += 1;
      }
      setFitting(fits);
    };
    update();
    // nav 너비뿐 아니라 칸마다의 너비(메뉴 이름이 바뀌거나 글꼴 · 확대가 바뀔 때)도 본다.
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    Array.from(measure.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [navRef, measureRef, count, labelsKey]);

  return Math.min(fitting, count);
}

/** 하위 메뉴 링크 목록 — 메뉴 칸의 패널과 "더보기" 패널이 함께 쓴다. */
function SubMenuLinks({ item, onNavigate }: { item: SiteMenuItem; onNavigate: () => void }) {
  return (
    <ul className="doc-mainnav-links" aria-label={item.label}>
      {item.children.map((child, childIndex) => (
        <li key={`${child.href}:${childIndex}`}>
          <MenuAnchor item={child} className="doc-mainnav-link" onNavigate={onNavigate}>
            {child.label}
          </MenuAnchor>
        </li>
      ))}
    </ul>
  );
}

/**
 * 상단 바의 메인메뉴. 하위 메뉴는 마우스를 올리거나(:hover) 키보드로 들어오면(:focus-within)
 * 펼쳐진다 — 기본 테마 메인메뉴와 같은 동작. 메뉴를 눌러 이동해도 포인터와 초점이 그 자리에
 * 남아 패널이 떠 있으므로, 누르면 그 칸을 "닫힘"으로 두고 포인터가 칸을 벗어나면 다시 연다.
 * 한 줄에 다 들어가지 않으면 뒤쪽 메뉴를 "더보기" 칸에 하위 메뉴와 함께 모은다 — 메뉴는 하나도 빼지 않는다.
 */
export function HandbookMainNav({ items }: { items: SiteMenuItem[] }) {
  const [dismissed, setDismissed] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLUListElement>(null);
  const fitting = useFittingCount(navRef, measureRef, items.length, items.map((item) => item.label).join(""));
  if (items.length === 0) return null;

  const inline = items.filter((_, index) => index < fitting);
  const overflow = items.filter((_, index) => index >= fitting);

  const dismiss = (slot: number) => {
    // 초점을 먼저 뺀다 — 그 blur 가 이 칸의 "닫힘"을 푸는(onBlur) 일이 setDismissed 보다 뒤에 오면 두 번째 누름에 다시 열린다.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setDismissed(slot);
  };

  // Escape 로 하위 메뉴를 닫고 초점은 칸의 단추에 둔다(WCAG 1.4.13). 초점이 칸을 벗어나면 다시 열 수 있게 푼다.
  const slotProps = (slot: number, hasPanel: boolean) => ({
    className: `doc-mainnav-item${slot === MORE_SLOT ? " doc-mainnav-more" : ""}${dismissed === slot ? " is-dismissed" : ""}`,
    onMouseLeave: dismissed === slot ? () => setDismissed(null) : undefined,
    onKeyDown: (event: React.KeyboardEvent<HTMLLIElement>) => {
      if (event.key !== "Escape" || !hasPanel) return;
      setDismissed(slot);
      event.currentTarget.querySelector<HTMLElement>(".doc-mainnav-trigger")?.focus();
    },
    onBlur: (event: React.FocusEvent<HTMLLIElement>) => {
      if (dismissed === slot && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setDismissed(null);
      }
    },
  });

  return (
    <nav className="doc-mainnav" aria-label="메인메뉴" ref={navRef}>
      <ul className="doc-mainnav-list">
        {inline.map((item, index) => (
          <li key={`${item.label}:${index}`} {...slotProps(index, item.children.length > 0)}>
            <MenuAnchor item={item} className="doc-mainnav-trigger" onNavigate={() => dismiss(index)}>
              <span>{item.label}</span>
              {item.children.length > 0 ? <ChevronDown className="doc-mainnav-caret" size={13} aria-hidden /> : null}
            </MenuAnchor>
            {item.children.length > 0 ? (
              <div className="doc-mainnav-panel">
                <SubMenuLinks item={item} onNavigate={() => dismiss(index)} />
              </div>
            ) : null}
          </li>
        ))}
        {overflow.length > 0 ? (
          <li {...slotProps(MORE_SLOT, true)}>
            <button
              type="button"
              className="doc-mainnav-trigger"
              onClick={() => {
                if (dismissed === MORE_SLOT) setDismissed(null);
              }}
            >
              <span>더보기</span>
              <ChevronDown className="doc-mainnav-caret" size={13} aria-hidden />
            </button>
            <div className="doc-mainnav-panel doc-mainnav-more-panel">
              {overflow.map((item, index) => (
                <div className="doc-mainnav-more-group" key={`${item.label}:${index}`}>
                  <MenuAnchor item={item} className="doc-mainnav-link doc-mainnav-more-title" onNavigate={() => dismiss(MORE_SLOT)}>
                    {item.label}
                  </MenuAnchor>
                  {item.children.length > 0 ? <SubMenuLinks item={item} onNavigate={() => dismiss(MORE_SLOT)} /> : null}
                </div>
              ))}
            </div>
          </li>
        ) : null}
      </ul>
      {/* 측정 줄 — 칸마다 한 줄 너비를 잰다(useFittingCount). 보이지도 읽히지도 않는다. 마지막은 "더보기" 칸. */}
      <ul className="doc-mainnav-list doc-mainnav-measure" ref={measureRef} aria-hidden inert>
        {items.map((item, index) => (
          <li key={`${item.label}:${index}`} className="doc-mainnav-item">
            <span className="doc-mainnav-trigger">
              <span>{item.label}</span>
              {item.children.length > 0 ? <ChevronDown className="doc-mainnav-caret" size={13} aria-hidden /> : null}
            </span>
          </li>
        ))}
        <li className="doc-mainnav-item">
          <span className="doc-mainnav-trigger">
            <span>더보기</span>
            <ChevronDown className="doc-mainnav-caret" size={13} aria-hidden />
          </span>
        </li>
      </ul>
    </nav>
  );
}

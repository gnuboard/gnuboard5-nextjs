"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MenuAnchor, type SiteMenuItem } from "./main-nav";

/**
 * 서랍 맨 위의 메뉴 — 관리자 메뉴설정을 그대로, 상위 메뉴마다 접고 펴는 묶음으로 보인다.
 * 상단 바 메인메뉴가 보이는 1280px 이상에서는 숨긴다(theme.mainnav.css 의 .is-site-menu).
 * 상위 메뉴도 링크다(AGENTS.override.md 메뉴 동기화 규칙) — 이름을 누르면 그 링크로 가고,
 * 곁의 화살표가 하위 메뉴를 편다. 항목은 하나도 빼거나 자르지 않는다.
 */
export function DrawerSiteMenu({
  items,
  onNavigate,
  persistent = false,
}: {
  items: SiteMenuItem[];
  onNavigate: () => void;
  /**
   * 1280px 이상에서도 보인다 — 사이드바에 달리 보일 것이 없을 때(매뉴얼이 없고 어느 메뉴 묶음에도 들지 않는 화면).
   * 그때는 상단 메뉴와 이름이 겹치지 않게 "사이트 메뉴"라고 부른다.
   */
  persistent?: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const baseId = useId();

  if (items.length === 0) return null;

  return (
    <nav
      className={`doc-nav-section is-site-menu doc-drawer-menu${persistent ? " is-persistent" : ""}`}
      aria-label={persistent ? "사이트 메뉴" : "메인메뉴"}
    >
      <p className="doc-nav-label">메뉴</p>
      <ul>
        {items.map((item, index) => {
          const hasChildren = item.children.length > 0;
          const open = openIndex === index;
          const childrenId = `${baseId}-${index}`;
          return (
            <li key={`${item.label}:${index}`}>
              <div className="doc-drawer-menu-row">
                <MenuAnchor item={item} className="doc-drawer-menu-top" onNavigate={onNavigate}>
                  {item.label}
                </MenuAnchor>
                {hasChildren ? (
                  <button
                    type="button"
                    className="doc-drawer-menu-toggle"
                    aria-expanded={open}
                    aria-controls={childrenId}
                    aria-label={`${item.label} 하위 메뉴 ${open ? "접기" : "펼치기"}`}
                    onClick={() => setOpenIndex(open ? null : index)}
                  >
                    <ChevronDown size={16} aria-hidden />
                  </button>
                ) : null}
              </div>
              {hasChildren && open ? (
                <ul id={childrenId} className="doc-nav-children">
                  {item.children.map((child, childIndex) => (
                    <li key={`${child.href}:${childIndex}`}>
                      <MenuAnchor item={child} className="doc-nav-link is-child" onNavigate={onNavigate}>
                        {child.label}
                      </MenuAnchor>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import { Compass } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { canonicalDocPath, isMenuPathActive, type BookGroup } from "./book-nav";
import { bookIndexHref } from "./book-selector";
import { MenuAnchor, type SiteMenuItem } from "./main-nav";

/**
 * 매뉴얼이 아닌 화면의 사이드바 — 지금 주소가 속한 관리자 메뉴 묶음(예: 커뮤니티의 공지사항 · 자유게시판 …).
 * 묶음 이름도 링크다(메뉴 동기화 규칙). 지금 화면의 메뉴를 강조하고, 아래에 매뉴얼로 돌아가는 링크를 둔다.
 */
export function SidebarMenuGroup({
  group,
  path,
  onNavigate,
}: {
  group: SiteMenuItem;
  path: string;
  onNavigate: () => void;
}) {
  // 여러 메뉴가 맞으면(예: /free 와 /free/12) 가장 구체적인 링크 하나만 강조한다.
  const activeHref = group.children
    .filter((item) => isMenuPathActive(item.href, path))
    .sort((a, b) => canonicalDocPath(b.href).length - canonicalDocPath(a.href).length)[0]?.href;
  const titleActive = group.children.length === 0 && isMenuPathActive(group.href, path);

  return (
    <nav className="doc-nav-section doc-side-menu" aria-label={group.label}>
      <MenuAnchor
        item={group}
        className={`doc-side-menu-title${titleActive ? " is-active" : ""}`}
        current={titleActive}
        onNavigate={onNavigate}
      >
        {group.label}
      </MenuAnchor>
      {group.children.length > 0 ? (
        <ul>
          {group.children.map((item, index) => {
            const active = item.href === activeHref;
            return (
              <li key={`${item.href}:${index}`}>
                <MenuAnchor
                  item={item}
                  className={`doc-nav-link${active ? " is-active" : ""}`}
                  current={active}
                  onNavigate={onNavigate}
                >
                  <span className="doc-nav-dot" aria-hidden />
                  <span className="min-w-0 flex-1 truncate" title={item.label}>
                    {item.label}
                  </span>
                </MenuAnchor>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Link href="/" className="doc-booksel-index doc-side-browse" onClick={onNavigate}>
        <Compass size={15} aria-hidden />
        <span>매뉴얼 둘러보기</span>
      </Link>
    </nav>
  );
}

/**
 * 첫 화면과 어느 메뉴 묶음에도 들지 않는 화면의 사이드바 — 묶음(관리자 메뉴설정의 상위 메뉴)별 매뉴얼 목록을
 * 펼쳐 둔다. 매뉴얼 목차는 매뉴얼 화면에서만 보인다.
 */
export function BookBrowseList({ groups, onNavigate }: { groups: BookGroup[]; onNavigate: () => void }) {
  if (groups.length === 0) return null;

  return (
    <nav className="doc-book-browse" aria-label="매뉴얼 둘러보기">
      <p className="doc-nav-label">매뉴얼 둘러보기</p>
      {groups.map((group, groupIndex) => (
        <div className="doc-book-browse-group" key={`${group.label}:${groupIndex}`}>
          {group.label ? <p className="doc-booksel-grouplabel">{group.label}</p> : null}
          <ul>
            {group.books.map((book) => (
              <li key={book.table}>
                <Link href={bookIndexHref(book)} className="doc-booksel-option doc-book-browse-link" onClick={onNavigate}>
                  <span className="doc-booksel-option-text">
                    <span>{book.label}</span>
                    {book.hint ? <small>{book.hint}</small> : null}
                  </span>
                  <span className="doc-booksel-count">{book.count}장</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

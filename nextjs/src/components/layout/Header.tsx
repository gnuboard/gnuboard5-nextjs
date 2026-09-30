"use client";

import {
  useEffect,
  useId,
  useState,
  type AnchorHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { ChevronDown } from "lucide-react";
import { HeaderClientActions } from "@/components/layout/HeaderClientActions";
import { isExternalMenuLink, menuAnchorTarget, menuHref, type MenuItem } from "@/components/layout/menu";
import { themeComponents, themeConfig } from "@/lib/theme";
import { useRuntimeMenus } from "@/hooks/useRuntimeMenus";
import type { ServerUser } from "@/lib/auth-server";

function MenuLink({
  menu,
  className,
  children,
  linkProps,
}: {
  menu: MenuItem;
  className: string;
  children: ReactNode;
  linkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">;
}) {
  const href = menuHref(menu.me_link);
  const target = menuAnchorTarget(menu.me_target);

  if (isExternalMenuLink(href)) {
    return (
      <a href={href} target={target} rel={target === "_blank" ? "noopener noreferrer" : undefined} className={className} {...linkProps}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} {...linkProps}>
      {children}
    </Link>
  );
}

function getMenuItems(menuId: string): HTMLElement[] {
  const menu = document.getElementById(menuId);
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function focusFirstMenuItem(menuId: string) {
  requestAnimationFrame(() => {
    getMenuItems(menuId)[0]?.focus();
  });
}

function moveMenuFocus(event: ReactKeyboardEvent<HTMLElement>, menuId: string, offset: number) {
  const items = getMenuItems(menuId);
  if (items.length === 0) return;

  const currentIndex = items.indexOf(event.currentTarget);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + offset + items.length) % items.length;
  items[nextIndex]?.focus();
}

function DesktopNav({ menus }: { menus: MenuItem[] }) {
  const primaryMenus = menus;
  const [openMenuCode, setOpenMenuCode] = useState<string | null>(null);
  const idPrefix = useId();

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenuCode(null);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <nav className="hidden shrink-0 items-center gap-1 text-[13px] xl:flex">
      {primaryMenus.map((menu) => {
        const children = menu.children ?? [];
        const hasChildren = children.length > 0;
        const isOpen = openMenuCode === menu.me_code;
        const menuId = `${idPrefix}-${menu.me_code}-menu`;

        return (
          <div
            key={menu.me_code}
            className="relative shrink-0"
            onMouseEnter={() => {
              if (hasChildren) setOpenMenuCode(menu.me_code);
            }}
            onMouseLeave={() => {
              setOpenMenuCode((current) => (current === menu.me_code ? null : current));
            }}
            onFocus={() => {
              if (hasChildren) setOpenMenuCode(menu.me_code);
            }}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                setOpenMenuCode((current) => (current === menu.me_code ? null : current));
              }
            }}
          >
            <MenuLink
              menu={menu}
              className="flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] px-3 font-medium text-[#333333] transition-colors hover:bg-accent hover:text-primary"
              linkProps={
                hasChildren
                  ? {
                      "aria-haspopup": "menu",
                      "aria-expanded": isOpen,
                      "aria-controls": menuId,
                      onKeyDown: (event) => {
                        if (event.key === "Escape") {
                          setOpenMenuCode(null);
                          return;
                        }

                        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
                          event.preventDefault();
                          setOpenMenuCode(menu.me_code);
                          focusFirstMenuItem(menuId);
                        }
                      },
                    }
                  : undefined
              }
            >
              {menu.me_name}
              {hasChildren && <ChevronDown className="size-3" />}
            </MenuLink>

            {hasChildren && (
              <div
                className={`absolute left-0 top-full z-50 pt-1 transition-opacity duration-150 ${
                  isOpen ? "visible opacity-100" : "invisible opacity-0"
                }`}
              >
                <div
                  id={menuId}
                  role="menu"
                  aria-label={`${menu.me_name} 하위 메뉴`}
                  className="min-w-[172px] rounded-[4px] border bg-popover p-1 shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
                >
                  {children.map((child) => (
                    <MenuLink
                      key={child.me_code}
                      menu={child}
                      className="block whitespace-nowrap rounded-[4px] px-3 py-2 text-sm text-[#333333] transition-colors hover:bg-accent hover:text-primary focus:bg-accent focus:text-primary focus:outline-none"
                      linkProps={{
                        role: "menuitem",
                        tabIndex: isOpen ? 0 : -1,
                        onKeyDown: (event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setOpenMenuCode(null);
                            return;
                          }

                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            moveMenuFocus(event, menuId, 1);
                            return;
                          }

                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            moveMenuFocus(event, menuId, -1);
                            return;
                          }

                          if (event.key === "Home") {
                            event.preventDefault();
                            getMenuItems(menuId)[0]?.focus();
                            return;
                          }

                          if (event.key === "End") {
                            event.preventDefault();
                            const items = getMenuItems(menuId);
                            items[items.length - 1]?.focus();
                          }
                        },
                      }}
                    >
                      {child.me_name}
                    </MenuLink>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Link
        href="/recent"
        className="flex h-10 shrink-0 items-center whitespace-nowrap rounded-[4px] px-3 font-medium text-[#333333] transition-colors hover:bg-accent hover:text-primary"
      >
        최신글
      </Link>
      <Link
        href="/shop"
        className="flex h-10 shrink-0 items-center whitespace-nowrap rounded-[4px] px-3 font-medium text-[#333333] transition-colors hover:bg-accent hover:text-primary"
      >
        쇼핑
      </Link>
      <Link
        href="/faq"
        className="flex h-10 shrink-0 items-center whitespace-nowrap rounded-[4px] px-3 font-medium text-[#333333] transition-colors hover:bg-accent hover:text-primary"
      >
        FAQ
      </Link>
    </nav>
  );
}

function DefaultHeaderBrand() {
  return (
    <>
      <span className="flex size-8 items-center justify-center rounded-[4px] bg-primary text-base font-black text-white">
        {themeConfig.site.logoMark}
      </span>
      <span className="text-xl font-black tracking-normal text-primary">{themeConfig.site.logoText}</span>
    </>
  );
}

export function Header({
  initialMenus = [],
  initialUser = null,
}: {
  initialMenus?: MenuItem[];
  initialUser?: ServerUser | null;
}) {
  const HeaderBrand = themeComponents.HeaderBrand;
  const menus = useRuntimeMenus(initialMenus);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#e9ebee] bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center px-4">
        <Link href="/" className="mr-5 flex shrink-0 items-center gap-2" aria-label={`${themeConfig.site.name} home`}>
          {HeaderBrand ? <HeaderBrand config={themeConfig} /> : <DefaultHeaderBrand />}
        </Link>

        <DesktopNav menus={menus} />
        <HeaderClientActions menus={menus} initialUser={initialUser} />
      </div>
    </header>
  );
}

export type { MenuItem };
export default Header;

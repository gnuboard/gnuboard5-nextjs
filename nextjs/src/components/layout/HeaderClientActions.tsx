"use client";

import * as React from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter } from "next/navigation";
import {
  LogOutIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { useSearchSuggestions } from "@/hooks/useSearchSuggestions";
import { useShopProductSuggest } from "@/hooks/useShopProductSuggest";
import type { BbsRewriteMode } from "@/lib/board-url";
import { shopProductHref } from "@/lib/product-url";
import { gaSearch } from "@/lib/analytics";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { isExternalMenuLink, menuAnchorTarget, menuHref, type MenuItem } from "@/components/layout/menu";
import type { ServerUser } from "@/lib/auth-server";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { CartMiniPopover } from "@/components/layout/CartMiniPopover";
import { LoginModal } from "@/components/auth/LoginModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/store/auth";
import { getClientPublicSettings } from "@/services/settings";
import { memberAvatarUrl, memberInitial } from "@/lib/member-avatar";
import { formatProductPrice } from "@/lib/shop-product-state";

function MobileMenuLink({
  menu,
  className,
  onClick,
}: {
  menu: MenuItem;
  className: string;
  onClick: () => void;
}) {
  const href = menuHref(menu.me_link);
  const target = menuAnchorTarget(menu.me_target);

  if (isExternalMenuLink(href)) {
    return (
      <a href={href} target={target} rel={target === "_blank" ? "noopener noreferrer" : undefined} className={className} onClick={onClick}>
        {menu.me_name}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {menu.me_name}
    </Link>
  );
}

export function HeaderClientActions({
  menus,
  initialUser = null,
}: {
  menus: MenuItem[];
  initialUser?: ServerUser | null;
}) {
  const router = useRouter();
  const { user, logout, isInitialized } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [loginModalOpen, setLoginModalOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [productRewriteMode, setProductRewriteMode] = React.useState<BbsRewriteMode>(0);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);
  const mobileSearchTriggerRef = React.useRef<HTMLButtonElement>(null);
  const mobileSearchPanelRef = React.useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = React.useRef<HTMLInputElement>(null);
  const mobileSearchPanelId = React.useId();
  const { suggestions } = useSearchSuggestions(searchQuery, searchFocused);
  const { items: productSuggestions } = useShopProductSuggest(searchQuery, searchFocused);

  const closeMobileSearch = React.useCallback(() => {
    setSearchOpen(false);
    requestAnimationFrame(() => mobileSearchTriggerRef.current?.focus());
  }, []);

  React.useEffect(() => {
    let alive = true;
    getClientPublicSettings()
      .then((settings) => {
        if (alive) setProductRewriteMode(settings.cf_bbs_rewrite);
      })
      .catch(() => {
        if (alive) setProductRewriteMode(0);
      });

    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!searchOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileSearchInputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileSearch();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMobileSearch, searchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    gaSearch(query);
    runtimeRouterPush(router, `/search?q=${encodeURIComponent(query)}`);
    setSearchQuery("");
    setSearchOpen(false);
    setSearchFocused(false);
  };

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    runtimeRouterPush(router, "/");
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const openLoginModal = () => {
    setMobileMenuOpen(false);
    setLoginModalOpen(true);
  };
  const handleMobileSearchPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;

    const panel = mobileSearchPanelRef.current;
    if (!panel) return;

    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const hasSuggestions = suggestions.length > 0 || productSuggestions.length > 0;
  const displayUser = isInitialized ? user : initialUser;
  const authReady = isInitialized || !!initialUser;

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <form onSubmit={handleSearch} className="hidden items-center xl:flex">
          <div className="relative" ref={searchContainerRef}>
            <div className="naver-search h-11 w-[260px] border-[2px] 2xl:w-[300px]">
              <input
                type="search"
                name="q"
                aria-label="검색어"
                placeholder="검색어를 입력하세요"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="!h-10 !text-[17px]"
              />
              <button type="submit" aria-label="검색" className="!h-10 !w-11">
                <SearchIcon className="size-5" />
              </button>
            </div>

            {searchFocused && hasSuggestions && (
              <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[300px] rounded-[4px] border bg-popover p-1 shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={`${suggestion}-${idx}`}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-[4px] px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSearchFocused(false);
                      runtimeRouterPush(router, `/search?q=${encodeURIComponent(suggestion)}`);
                      setSearchQuery("");
                    }}
                  >
                    <SearchIcon className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{suggestion}</span>
                  </button>
                ))}

                {productSuggestions.length > 0 && (
                  <>
                    {suggestions.length > 0 && <div className="my-1 border-t" />}
                    <p className="px-3 py-1 text-[10px] font-bold uppercase text-[#6b7280]">
                      상품
                    </p>
                    {productSuggestions.slice(0, 5).map((p) => (
                      <button
                        key={p.it_id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-[4px] px-3 py-1.5 text-left text-sm hover:bg-accent"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSearchFocused(false);
                          runtimeRouterPush(router, shopProductHref(p, productRewriteMode));
                          setSearchQuery("");
                        }}
                      >
                        <span className="flex-1 truncate">{p.it_name}</span>
                        <span className="text-xs text-[#6b7280]">
                          {formatProductPrice(p)}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </form>

        <Button
          ref={mobileSearchTriggerRef}
          variant="ghost"
          size="icon"
          className="xl:hidden"
          onClick={() => setSearchOpen((open) => !open)}
          aria-expanded={searchOpen}
          aria-controls={mobileSearchPanelId}
          aria-haspopup="dialog"
        >
          <SearchIcon className="size-5" />
          <span className="sr-only">검색</span>
        </Button>

        <CartMiniPopover />
        <NotificationBell />

        {!authReady ? (
          <div className="hidden w-[132px] shrink-0 items-center justify-end md:flex" aria-hidden="true">
            <span className="skeleton size-9 rounded-full" />
          </div>
        ) : displayUser ? (
          <div className="flex shrink-0 md:w-[132px] md:justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="size-7">
                    {memberAvatarUrl(displayUser) && (
                      <AvatarImage src={memberAvatarUrl(displayUser)} alt={displayUser.mb_nick} />
                    )}
                    <AvatarFallback className="text-xs">
                      {memberInitial(displayUser.mb_nick)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-[4px]">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{displayUser.mb_nick}</span>
                    <span className="text-xs text-muted-foreground">{displayUser.mb_email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/mypage">
                    <UserIcon className="mr-2 size-4" />
                    마이페이지
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/mypage/profile">
                    <SettingsIcon className="mr-2 size-4" />
                    설정
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOutIcon className="mr-2 size-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="hidden w-[132px] shrink-0 items-center justify-end gap-2 md:flex">
            <Button variant="ghost" size="sm" type="button" onClick={openLoginModal}>
              로그인
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">회원가입</Link>
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => {
            setSearchOpen(false);
            setMobileMenuOpen(true);
          }}
        >
          {mobileMenuOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          <span className="sr-only">메뉴</span>
        </Button>
      </div>

      {searchOpen && (
        <div
          id={mobileSearchPanelId}
          ref={mobileSearchPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="모바일 검색"
          className="absolute left-0 right-0 top-16 z-[60] border-t bg-white p-3 xl:hidden"
          onKeyDown={handleMobileSearchPanelKeyDown}
        >
          <form onSubmit={handleSearch}>
            <div className="flex items-center gap-2">
              <div className="naver-search min-w-0 flex-1 border-[2px]">
                <input
                  ref={mobileSearchInputRef}
                  type="search"
                  name="q"
                  aria-label="검색어"
                  placeholder="검색어를 입력하세요"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" aria-label="검색">
                  <SearchIcon className="size-5" />
                </button>
              </div>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={closeMobileSearch}>
                <XIcon className="size-5" />
                <span className="sr-only">검색 닫기</span>
              </Button>
            </div>
          </form>
        </div>
      )}

      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent
          showCloseButton={false}
          className="fixed inset-y-0 left-auto right-0 top-0 z-[70] flex h-[100dvh] w-[min(88vw,360px)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l border-r-0 bg-white p-0 shadow-[-8px_0_24px_rgba(0,0,0,0.16)] duration-200 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-[360px] md:hidden"
        >
          <DialogHeader className="border-b px-5 py-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-base font-bold text-[#202124]">메뉴</DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-[4px]"
                onClick={closeMobileMenu}
              >
                <XIcon className="size-5" />
                <span className="sr-only">메뉴 닫기</span>
              </Button>
            </div>
            <DialogDescription className="sr-only">모바일 사이트 메뉴</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto py-4">
            <div className="mx-4 mb-4 rounded-[6px] border bg-[#f8faf9] p-4">
              {!authReady ? (
                <div className="space-y-3" aria-hidden="true">
                  <div className="flex items-center gap-3">
                    <span className="skeleton size-10 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <span className="skeleton block h-4 w-24 rounded-[4px]" />
                      <span className="skeleton block h-3 w-36 rounded-[4px]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <span className="skeleton h-9 rounded-[4px]" />
                    <span className="skeleton h-9 rounded-[4px]" />
                  </div>
                </div>
              ) : displayUser ? (
                <>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      {memberAvatarUrl(displayUser) && (
                        <AvatarImage src={memberAvatarUrl(displayUser)} alt={displayUser.mb_nick} />
                      )}
                      <AvatarFallback>{memberInitial(displayUser.mb_nick)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#202124]">{displayUser.mb_nick}</p>
                      <p className="truncate text-xs text-muted-foreground">{displayUser.mb_email}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="h-9 rounded-[4px]" asChild>
                      <Link href="/mypage" onClick={closeMobileMenu}>
                        마이페이지
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 rounded-[4px]"
                      onClick={handleLogout}
                    >
                      로그아웃
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-[#202124]">로그인이 필요합니다</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button type="button" size="sm" className="h-9 rounded-[4px]" onClick={openLoginModal}>
                      로그인
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 rounded-[4px]" asChild>
                      <Link href="/register" onClick={closeMobileMenu}>
                        회원가입
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </div>

            <nav aria-label="모바일 메뉴" className="space-y-1 px-3">
              {menus.map((menu) => (
                <div key={menu.me_code}>
                  <MobileMenuLink
                    menu={menu}
                    className="flex min-h-11 items-center rounded-[6px] px-3 text-[15px] font-semibold text-[#202124] transition-colors hover:bg-accent hover:text-primary"
                    onClick={closeMobileMenu}
                  />
                  {menu.children && menu.children.length > 0 && (
                    <div className="ml-3 border-l border-[#e9ebee] pl-3">
                      {menu.children.map((child) => (
                        <MobileMenuLink
                          key={child.me_code}
                          menu={child}
                          className="flex min-h-9 items-center rounded-[6px] px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                          onClick={closeMobileMenu}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="my-3 h-px bg-border" />

              <Link
                className="flex min-h-11 items-center rounded-[6px] px-3 text-[15px] font-semibold text-[#202124] transition-colors hover:bg-accent hover:text-primary"
                href="/recent"
                onClick={closeMobileMenu}
              >
                최신글
              </Link>
              <Link
                className="flex min-h-11 items-center rounded-[6px] px-3 text-[15px] font-semibold text-[#202124] transition-colors hover:bg-accent hover:text-primary"
                href="/shop"
                onClick={closeMobileMenu}
              >
                쇼핑
              </Link>
              <Link
                className="flex min-h-11 items-center rounded-[6px] px-3 text-[15px] font-semibold text-[#202124] transition-colors hover:bg-accent hover:text-primary"
                href="/faq"
                onClick={closeMobileMenu}
              >
                FAQ
              </Link>
            </nav>
          </div>
        </DialogContent>
      </Dialog>

      {!displayUser && <LoginModal open={loginModalOpen} onOpenChange={setLoginModalOpen} />}
    </>
  );
}

"use client";

import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { ShopCategory } from "@/lib/api";
import { cn } from "@/lib/utils";

function categoryHref(category: ShopCategory) {
  return `/shop/list-${encodeURIComponent(category.ca_id)}`;
}

function CategoryDropdownItem({
  category,
  depth,
  pathname,
}: {
  category: ShopCategory;
  depth: number;
  pathname: string;
}) {
  const hasChildren = category.children && category.children.length > 0;
  const active = isCategoryActive(pathname, category);

  return (
    <li>
      <Link
        href={categoryHref(category)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center justify-between rounded-[4px] px-3 py-2 text-[13px] text-[#333]",
          "hover:bg-[#f5f6f7] hover:text-[#0c8040] focus-visible:bg-[#f5f6f7] focus-visible:text-[#0c8040]",
          active && "bg-[#f5f6f7] text-[#0c8040]"
        )}
        style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {depth > 0 && <span className="text-[#dadce0]">&gt;</span>}
          <span className={cn("truncate", depth === 0 && "font-semibold")}>
            {category.ca_name}
          </span>
        </span>
        {category.item_count !== undefined && category.item_count > 0 && (
          <span className="ml-3 text-[12px] text-[#6b7280]">
            {category.item_count}
          </span>
        )}
      </Link>
      {hasChildren && (
        <ul className="mt-1 border-l border-[#e9ebee] pl-1">
          {category.children!.map((child) => (
            <CategoryDropdownItem
              key={child.ca_id}
              category={child}
              depth={depth + 1}
              pathname={pathname}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CategoryNav({ categories }: { categories: ShopCategory[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const openMobileCategory = categories.find(
    (category) => category.ca_id === openCategoryId && category.children?.length
  );

  const staticLinks = [
    { href: "/shop/products", label: "전체 상품" },
    { href: "/shop/reviews", label: "사용후기" },
    { href: "/shop/qas", label: "상품문의" },
    { href: "/shop/events", label: "기획전" },
    { href: "/shop/couponzone", label: "쿠폰존" },
  ];

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (!navRef.current || !(nextTarget instanceof Node)) {
      setOpenCategoryId(null);
      return;
    }
    if (!navRef.current.contains(nextTarget)) {
      setOpenCategoryId(null);
    }
  };

  const handleCategoryKeyDown = (
    event: KeyboardEvent<HTMLAnchorElement>,
    category: ShopCategory
  ) => {
    const hasChildren = category.children && category.children.length > 0;
    if (!hasChildren) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpenCategoryId(category.ca_id);
      window.setTimeout(() => {
        navRef.current
          ?.querySelector<HTMLElement>(`[data-category-menu="${category.ca_id}"] a`)
          ?.focus();
      }, 0);
    }
    if (event.key === "Escape") {
      setOpenCategoryId(null);
      event.currentTarget.focus();
    }
  };

  return (
    <nav
      ref={navRef}
      aria-label="쇼핑몰 카테고리"
      className="w-full border-b border-[#e9ebee] bg-white"
      onBlur={closeWhenFocusLeaves}
      onMouseLeave={() => setOpenCategoryId(null)}
    >
      <div className="site-container px-4">
        <ul className="scrollbar-hide flex items-center gap-1 overflow-x-auto py-2 text-[13px] md:flex-wrap md:overflow-visible">
          {staticLinks.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/shop/products" && pathname.startsWith(item.href));

            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-[4px] px-3 font-semibold",
                    "whitespace-nowrap transition-colors hover:bg-[#f5f6f7]",
                    active ? "text-[#0c8040]" : "text-[#333] hover:text-[#0c8040]"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
          {categories.map((cat) => {
            const hasChildren = cat.children && cat.children.length > 0;
            const open = openCategoryId === cat.ca_id;
            const active = isCategoryActive(pathname, cat);

            return (
              <li
                key={cat.ca_id}
                className="relative flex shrink-0 items-center"
                onMouseEnter={() => {
                  if (hasChildren) setOpenCategoryId(cat.ca_id);
                }}
              >
                <Link
                  href={categoryHref(cat)}
                  aria-current={active ? "page" : undefined}
                  aria-haspopup={hasChildren ? "true" : undefined}
                  aria-expanded={hasChildren ? open : undefined}
                  onFocus={() => {
                    if (hasChildren) setOpenCategoryId(cat.ca_id);
                  }}
                  onKeyDown={(event) => handleCategoryKeyDown(event, cat)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-[4px] px-3 font-medium",
                    "whitespace-nowrap text-[#333] transition-colors hover:bg-[#f5f6f7] hover:text-[#0c8040] focus-visible:bg-[#f5f6f7] focus-visible:text-[#0c8040]",
                    active && "text-[#0c8040]"
                  )}
                >
                  {cat.ca_name}
                </Link>
                {hasChildren && (
                  <button
                    type="button"
                    className={cn(
                      "ml-0.5 inline-flex h-9 w-8 items-center justify-center rounded-[4px] text-[#6b7280] md:hidden",
                      "hover:bg-[#f5f6f7] hover:text-[#0c8040] focus-visible:bg-[#f5f6f7] focus-visible:text-[#0c8040]"
                    )}
                    aria-label={`${cat.ca_name} 하위 카테고리 보기`}
                    aria-expanded={open}
                    onClick={() => setOpenCategoryId(open ? null : cat.ca_id)}
                  >
                    <ChevronDown
                      className={cn("size-4 transition-transform", open && "rotate-180")}
                    />
                  </button>
                )}
                {hasChildren && (
                  <ul
                    data-category-menu={cat.ca_id}
                    className={cn(
                      "hidden md:absolute md:left-0 md:top-full md:z-50 md:mt-1 md:block md:min-w-[220px]",
                      "rounded-[4px] border border-[#dadce0] bg-white p-1 shadow-[0_2px_8px_rgba(0,0,0,0.1)]",
                      open ? "md:visible" : "md:invisible"
                    )}
                  >
                    {cat.children!.map((sub) => (
                      <CategoryDropdownItem
                        key={sub.ca_id}
                        category={sub}
                        depth={0}
                        pathname={pathname}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {openMobileCategory && (
          <div className="border-t border-[#e9ebee] py-2 md:hidden">
            <ul className="grid gap-1">
              {openMobileCategory.children!.map((child) => (
                <CategoryDropdownItem
                  key={child.ca_id}
                  category={child}
                  depth={0}
                  pathname={pathname}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </nav>
  );
}

function isCategoryActive(pathname: string, category: ShopCategory): boolean {
  if (pathname === categoryHref(category)) return true;
  return Boolean(category.children?.some((child) => isCategoryActive(pathname, child)));
}

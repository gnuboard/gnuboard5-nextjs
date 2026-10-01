import { expect, test } from "@playwright/test";
import { isExternalMenuLink, isUnsafeMenuLink, menuAnchorTarget, menuHref } from "../src/components/layout/menu";
import { g5BaseUrlForRuntime } from "../src/lib/config";
import { relativeRedirectTargetsShop } from "../src/lib/g5-short-url-utils";
import {
  legacyShopTypeRedirectPath,
  shopLoginContextPath,
  shopServiceContextPath,
  shopTypeCanonicalPath,
} from "../src/lib/server-route-context";

test.describe("menu links", () => {
  test("blocks javascript menu URLs", () => {
    expect(isUnsafeMenuLink("javascript:alert(1)")).toBe(true);
    expect(isUnsafeMenuLink(" JavaScript:alert(1)")).toBe(true);
    expect(menuHref("javascript:alert(1)")).toBe("#");
    expect(menuHref(" JavaScript:alert(1)")).toBe("#");
  });

  test("preserves safe menu URL schemes", () => {
    expect(isExternalMenuLink("https://example.com")).toBe(true);
    expect(menuHref("https://example.com")).toBe("https://example.com");
    expect(menuHref("#content")).toBe("#content");
    expect(menuHref("mailto:help@example.com")).toBe("mailto:help@example.com");
    expect(menuHref("tel:01012345678")).toBe("tel:01012345678");
  });

  test("follows the administrator new-window setting", () => {
    expect(menuAnchorTarget("self")).toBeUndefined();
    expect(menuAnchorTarget("_self")).toBeUndefined();
    expect(menuAnchorTarget("blank")).toBe("_blank");
    expect(menuAnchorTarget("_blank")).toBe("_blank");
  });

  test("normalizes absolute G5 legacy URLs to local app routes", () => {
    const g5BaseUrl = g5BaseUrlForRuntime();
    expect(menuHref(`${g5BaseUrl}/bbs/content.php?co_id=intro`)).toBe("/content/intro");
    expect(menuHref(`${g5BaseUrl}/bbs/board.php?bo_table=free&wr_id=6`)).toBe("/free/6");
    expect(menuHref(`${g5BaseUrl}/shop/item.php?it_id=1446772772`)).toBe("/shop/1446772772");
    // 관리자 > 메뉴설정의 기본 링크들(G5_URL 로 저장된다) — 프런트 화면이 있으면 그 주소로 간다.
    expect(menuHref(`${g5BaseUrl}/bbs/new.php`)).toBe("/recent");
    expect(menuHref(`${g5BaseUrl}/bbs/search.php`)).toBe("/search");
    expect(menuHref(`${g5BaseUrl}/bbs/register.php`)).toBe("/register");
    expect(menuHref(`${g5BaseUrl}/bbs/login.php`)).toBe("/login");
    expect(menuHref(`${g5BaseUrl}/bbs/point.php`)).toBe("/mypage/points");
  });

  test("sends the Gnuboard site root to the app home", () => {
    const g5BaseUrl = g5BaseUrlForRuntime();
    expect(menuHref(`${g5BaseUrl}/`)).toBe("/");
    expect(menuHref(g5BaseUrl)).toBe("/");
    expect(menuHref(`${g5BaseUrl}/index.php`)).toBe("/");
  });

  test("keeps Gnuboard pages that have no app screen as /bbs paths", () => {
    // 앱 화면이 없는 페이지는 /bbs/*.php 그대로 — PHP 설치본은 그누보드가, 서버 런타임은
    // app/bbs/[...path] 가 원래 그누보드 주소로 넘긴다.
    const g5BaseUrl = g5BaseUrlForRuntime();
    expect(menuHref(`${g5BaseUrl}/bbs/current_connect.php`)).toBe("/bbs/current_connect.php");
  });

  test("keeps legacy shop login redirects in the shop context", () => {
    expect(relativeRedirectTargetsShop("/shop")).toBe(true);
    expect(relativeRedirectTargetsShop("/shop/wishlist?from=legacy#items")).toBe(true);
    expect(relativeRedirectTargetsShop("/shopper")).toBe(false);
    expect(relativeRedirectTargetsShop("https://evil.example/shop")).toBe(false);
    expect(relativeRedirectTargetsShop("//evil.example/shop")).toBe(false);
    expect(relativeRedirectTargetsShop("/shop\\evil")).toBe(false);
  });

  test("builds clean server-side shop context redirects", () => {
    expect(shopLoginContextPath({ redirect: "/shop/wishlist" })).toBe(
      "/shop/login?redirect=%2Fshop%2Fwishlist"
    );
    expect(shopLoginContextPath({ redirect: "https://evil.example/shop" })).toBeNull();
    expect(shopServiceContextPath({ service: "shop", page: "2" }, "/shop/qas/new")).toBe(
      "/shop/qas/new?page=2"
    );
    expect(shopServiceContextPath({ service: "community" }, "/shop/register")).toBeNull();
  });

  test("normalizes legacy product type routes without leaking internal query keys", () => {
    expect(legacyShopTypeRedirectPath({ it_type2: "1", page: "3" })).toBe(
      "/shop/type-2?page=3"
    );
    expect(legacyShopTypeRedirectPath({ g5_type: "2" })).toBeNull();
    expect(shopTypeCanonicalPath({ g5_type: "4" })).toBe("/shop/type-4");
    expect(shopTypeCanonicalPath({})).toBe("/shop/products");
  });

  test("preserves migrated external content URLs when the API has not resolved them locally", () => {
    expect(menuHref("https://hiswillch.org/bbs/content.php?co_id=intro")).toBe(
      "https://hiswillch.org/bbs/content.php?co_id=intro"
    );
    expect(menuHref("https://hiswillch.org/mobile/content.php?co_id=guide")).toBe(
      "https://hiswillch.org/mobile/content.php?co_id=guide"
    );
    expect(menuHref("https://hiswillch.org/bbs/board.php?bo_table=sermon&sca=weekly")).toBe(
      "https://hiswillch.org/bbs/board.php?bo_table=sermon&sca=weekly"
    );
  });
});

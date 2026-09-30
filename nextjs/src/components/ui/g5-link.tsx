import NextLink from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { hrefForNextRouter } from "@/lib/config";

type G5LinkProps = ComponentProps<typeof NextLink>;

/**
 * Drop-in replacement for `next/link` that defaults `prefetch` to `false`.
 *
 * Under `output: export` (the static theme build) the framework still issues
 * RSC prefetch requests (`/path?_rsc=…`) for in-viewport links, and the static
 * host answers them with 404 — harmless to navigation but noisy in the console.
 * Static exports have no RSC payloads to prefetch, so disabling it loses
 * nothing. Callers can still opt back in with `prefetch`.
 *
 * href 에 설치 경로가 이미 붙어 있으면 떼어 낸다. `g5ShortHref()` 같은 헬퍼는
 * `<a href>`·`<form action>`·`location` 용으로 설치 경로를 붙여 주는데, Next 의
 * Link 는 basePath 를 스스로 붙이므로 그대로 넘기면 `/gnu5512/gnu5512/free` 가 된다.
 */
function routerHref(href: G5LinkProps["href"]): G5LinkProps["href"] {
  if (typeof href === "string") return hrefForNextRouter(href);
  if (href && typeof href === "object" && typeof href.pathname === "string") {
    return { ...href, pathname: hrefForNextRouter(href.pathname) };
  }
  return href;
}

const G5Link = forwardRef<HTMLAnchorElement, G5LinkProps>(function G5Link(
  { prefetch = false, href, ...props },
  ref
) {
  return <NextLink ref={ref} prefetch={prefetch} href={routerHref(href)} {...props} />;
});

export { G5Link };
export default G5Link;

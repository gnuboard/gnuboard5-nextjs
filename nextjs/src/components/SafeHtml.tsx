import { createElement, type HTMLAttributes } from "react";
import {
  sanitizeCommerceHtml,
  sanitizeHtml,
  sanitizeInlineHtml,
  sanitizeUserHtml,
} from "@/lib/sanitize";

export type SafeHtmlPolicy = "content" | "commerce" | "inline" | "user";

type SafeHtmlTag = "article" | "div" | "span" | "td";

type SafeHtmlProps = HTMLAttributes<HTMLElement> & {
  as?: SafeHtmlTag;
  html: string | null | undefined;
  policy?: SafeHtmlPolicy;
};

export function safeHtmlForPolicy(
  html: string | null | undefined,
  policy: SafeHtmlPolicy = "content"
): string {
  switch (policy) {
    case "commerce":
      return sanitizeCommerceHtml(html);
    case "inline":
      return sanitizeInlineHtml(html);
    case "user":
      return sanitizeUserHtml(html);
    case "content":
    default:
      return sanitizeHtml(html);
  }
}

export function SafeHtml({
  as = "div",
  html,
  policy = "content",
  ...props
}: SafeHtmlProps) {
  return createElement(as, {
    ...props,
    dangerouslySetInnerHTML: { __html: safeHtmlForPolicy(html, policy) },
  });
}

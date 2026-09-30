"use client";

import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import { X, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompareStore } from "@/store/compare";
import { shouldBypassImageOptimization } from "@/lib/image";

/**
 * 화면 하단 고정 비교 트레이 — 1~4개 상품을 골라 비교 페이지로 이동.
 *   - items 0 이면 렌더 안 함.
 *   - 모바일에서도 동작하도록 sticky bottom.
 */
export function CompareTray() {
  const { items, remove, clear } = useCompareStore();
  if (items.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:bottom-0 print:hidden">
      <div className="container mx-auto flex items-center gap-2 px-4 py-2">
        <GitCompare className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-xs font-medium">비교 ({items.length}/4)</span>
        <ul className="flex flex-1 items-center gap-2 overflow-x-auto">
          {items.map((it) => (
            <li
              key={it.it_id}
              className="relative flex flex-shrink-0 items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs"
            >
              {it.image_url ? (
                <Image
                  src={it.image_url}
                  alt={it.it_name}
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded object-cover"
                  unoptimized={shouldBypassImageOptimization(it.image_url)}
                />
              ) : null}
              <span className="max-w-[100px] truncate">{it.it_name}</span>
              <button
                type="button"
                onClick={() => remove(it.it_id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-accent"
                aria-label={`${it.it_name} 비교 해제`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        {/* `disabled` does not propagate to a Next.js <Link>, so an asChild
            Button would still navigate. Render a real disabled button until at
            least 2 items are selected. */}
        {items.length >= 2 ? (
          <Button asChild size="sm">
            <Link href="/shop/compare">비교하기</Link>
          </Button>
        ) : (
          <Button size="sm" disabled>
            비교하기
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={clear}>
          전체 해제
        </Button>
      </div>
    </div>
  );
}

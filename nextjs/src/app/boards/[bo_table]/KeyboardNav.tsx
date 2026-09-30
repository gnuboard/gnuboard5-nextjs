"use client";

import { useEffect } from "react";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";

interface KeyboardNavProps {
  postLinks: { wrId: number; boTable: string; href?: string }[];
}

export function KeyboardNav({ postLinks }: KeyboardNavProps) {
  const { focusedIndex } = useKeyboardNav({
    items: postLinks,
    enabled: true,
  });

  useEffect(() => {
    if (focusedIndex < 0) return;

    const rows = document.querySelectorAll<HTMLTableRowElement>(
      "[data-keyboard-nav-row]"
    );

    rows.forEach((row, i) => {
      if (i === focusedIndex) {
        row.classList.add("ring-2", "ring-primary", "ring-inset", "bg-primary/5");
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        row.classList.remove("ring-2", "ring-primary", "ring-inset", "bg-primary/5");
      }
    });

    return () => {
      rows.forEach((row) => {
        row.classList.remove("ring-2", "ring-primary", "ring-inset", "bg-primary/5");
      });
    };
  }, [focusedIndex]);

  return (
    <div className="board-list-keyhint text-xs text-muted-foreground text-right mb-2">
      <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">j</kbd>
      <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono ml-1">k</kbd>
      {" "}
      <span>탐색</span>
      {" / "}
      <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">Enter</kbd>
      {" "}
      <span>열기</span>
    </div>
  );
}

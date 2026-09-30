"use client";

import { useState, useEffect, useCallback } from "react";
import { g5ShortHref } from "@/lib/g5-short-url";

interface KeyboardNavOptions {
  items: { wrId: number; boTable: string; href?: string }[];
  enabled?: boolean;
}

export function useKeyboardNav({ items, enabled = true }: KeyboardNavOptions) {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || items.length === 0) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (isInput) return;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, items.length - 1));
          break;
        }
        case "k": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "Enter": {
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            e.preventDefault();
            const item = items[focusedIndex];
            window.location.href = item.href || g5ShortHref(`/boards/${item.boTable}/${item.wrId}`);
          }
          break;
        }
        case "Escape": {
          setFocusedIndex(-1);
          break;
        }
      }
    },
    [enabled, items, focusedIndex]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { focusedIndex, setFocusedIndex };
}

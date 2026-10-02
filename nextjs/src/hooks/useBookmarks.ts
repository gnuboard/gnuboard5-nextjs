"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { storageGet, storageSet } from "@/lib/safe-storage";

const STORAGE_KEY = "post_bookmarks";
const MAX_ENTRIES = 100;

export interface Bookmark {
  boTable: string;
  wrId: string;
  subject: string;
  savedAt: string;
}

function getBookmarksFromStorage(): Bookmark[] {
  try {
    const raw = storageGet(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: Bookmark[]): void {
  try {
    cachedSnapshot = JSON.stringify(bookmarks);
    storageSet(STORAGE_KEY, cachedSnapshot);
  } catch {
    // storage full or unavailable
  }
}

let cachedSnapshot = "[]";

function subscribe(callback: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };

  const check = () => {
    const current = storageGet(STORAGE_KEY) ?? "[]";
    if (current !== cachedSnapshot) {
      cachedSnapshot = current;
      callback();
    }
  };

  window.addEventListener("storage", handler);
  const interval = setInterval(check, 1000);

  return () => {
    window.removeEventListener("storage", handler);
    clearInterval(interval);
  };
}

function snapshotSelector(): string {
  try {
    return storageGet(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function serverSelector(): string {
  return "[]";
}

export function useBookmarks() {
  const raw = useSyncExternalStore(subscribe, snapshotSelector, serverSelector);
  const bookmarks: Bookmark[] = useMemo(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }, [raw]);

  const isBookmarked = useCallback(
    (boTable: string, wrId: string): boolean => {
      return bookmarks.some((b) => b.boTable === boTable && b.wrId === wrId);
    },
    [bookmarks]
  );

  const addBookmark = useCallback(
    (boTable: string, wrId: string, subject: string): void => {
      const current = getBookmarksFromStorage();
      const exists = current.some(
        (b) => b.boTable === boTable && b.wrId === wrId
      );
      if (exists) return;

      const newBookmark: Bookmark = {
        boTable,
        wrId,
        subject,
        savedAt: new Date().toISOString(),
      };

      const updated = [...current, newBookmark];
      // FIFO eviction if exceeding max
      const trimmed =
        updated.length > MAX_ENTRIES
          ? updated.slice(updated.length - MAX_ENTRIES)
          : updated;

      saveBookmarks(trimmed);
    },
    []
  );

  const removeBookmark = useCallback(
    (boTable: string, wrId: string): void => {
      const current = getBookmarksFromStorage();
      const filtered = current.filter(
        (b) => !(b.boTable === boTable && b.wrId === wrId)
      );
      saveBookmarks(filtered);
    },
    []
  );

  return { bookmarks, addBookmark, removeBookmark, isBookmarked };
}

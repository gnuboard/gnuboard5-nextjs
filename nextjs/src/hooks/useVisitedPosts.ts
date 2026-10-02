"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { storageGet, storageSet } from "@/lib/safe-storage";

const STORAGE_KEY = "visited_posts";
const MAX_ENTRIES = 500;

function makeKey(boTable: string, wrId: string | number): string {
  return `${boTable}_${wrId}`;
}

function getSnapshot(): string[] {
  try {
    const raw = storageGet(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
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

export function useVisitedPosts() {
  const raw = useSyncExternalStore(subscribe, snapshotSelector, serverSelector);
  const visited: string[] = useMemo(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }, [raw]);

  const visitedSet = useMemo(() => new Set(visited), [visited]);

  const isVisited = useCallback(
    (boTable: string, wrId: string | number): boolean => {
      return visitedSet.has(makeKey(boTable, wrId));
    },
    [visitedSet]
  );

  const markVisited = useCallback(
    (boTable: string, wrId: string | number): void => {
      const key = makeKey(boTable, wrId);
      const current = getSnapshot();
      if (current.includes(key)) return;

      const updated = [...current, key];
      // FIFO eviction if exceeding max
      const trimmed = updated.length > MAX_ENTRIES
        ? updated.slice(updated.length - MAX_ENTRIES)
        : updated;

      try {
        storageSet(STORAGE_KEY, JSON.stringify(trimmed));
        cachedSnapshot = JSON.stringify(trimmed);
      } catch {
        // storage full or unavailable
      }
    },
    []
  );

  return { isVisited, markVisited };
}

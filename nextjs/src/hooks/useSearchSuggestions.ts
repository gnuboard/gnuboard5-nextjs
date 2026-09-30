"use client";

import { useState, useEffect, useRef } from "react";
import { getClientSearchSuggestions } from "@/services/search";

export function useSearchSuggestions(query: string, enabled: boolean) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    if (!enabled || query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    clearTimeout(timerRef.current);
    let cancelled = false;

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const nextSuggestions = await getClientSearchSuggestions(query);
        if (!cancelled) setSuggestions(nextSuggestions);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
      if (!cancelled) setLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [query, enabled]);

  return { suggestions, loading };
}

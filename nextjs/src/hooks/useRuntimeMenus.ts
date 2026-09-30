"use client";

import { useEffect, useState } from "react";
import type { MenuItem } from "@/components/layout/menu";
import { readApiResponse } from "@/lib/api-response";
import { apiUrl } from "@/lib/config";
import { menuItemListSchema } from "@/lib/schemas";

export function useRuntimeMenus(initialMenus?: MenuItem[]): MenuItem[] {
  const [menus, setMenus] = useState<MenuItem[]>(initialMenus ?? []);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    async function refreshMenus() {
      try {
        const response = await fetch(apiUrl("/menus"), {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const parsed = await readApiResponse(response, menuItemListSchema);

        if (alive && response.ok && parsed.success && parsed.data !== undefined) {
          setMenus(parsed.data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        // Keep the build-time menu as a safe fallback when the runtime API is unavailable.
        console.warn("[useRuntimeMenus] Failed to refresh menus from runtime API.", error);
      }
    }

    refreshMenus();

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  return menus;
}

"use client";

import { useEffect, useState } from "react";
import { rootPublicAssetUrl } from "@/lib/config";
import { getClientPublicSettings } from "@/services/settings";

const CACHE_PREFIX = "gnuboard-";

function resolveUrl(path: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return new URL(path, window.location.href).href;
  } catch {
    return null;
  }
}

async function clearGnuboardCaches() {
  if (typeof window === "undefined" || !("caches" in window)) return;

  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .map((key) => caches.delete(key))
  );
}

async function cleanupLegacyServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const desiredScriptUrl = resolveUrl(rootPublicAssetUrl("/sw.js"));
  const desiredScopeUrl = resolveUrl(serviceWorkerScopePath());
  const registrations = await navigator.serviceWorker.getRegistrations();
  let removedLegacyRegistration = false;

  await Promise.all(
    registrations.map(async (registration) => {
      const activeScriptUrl =
        registration.active?.scriptURL ||
        registration.waiting?.scriptURL ||
        registration.installing?.scriptURL ||
        "";
      const isDesiredRegistration =
        desiredScriptUrl &&
        desiredScopeUrl &&
        activeScriptUrl === desiredScriptUrl &&
        registration.scope === desiredScopeUrl;

      if (isDesiredRegistration) return;

      const sameOrigin =
        activeScriptUrl === "" || activeScriptUrl.startsWith(window.location.origin);
      if (!sameOrigin) return;

      removedLegacyRegistration = true;
      await registration.unregister();
    })
  );

  if (removedLegacyRegistration) {
    await clearGnuboardCaches();
  }
}

function serviceWorkerScopePath(): string {
  const scope = rootPublicAssetUrl("/");
  return scope.endsWith("/") ? scope : `${scope}/`;
}

export function PWAProvider() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    cleanupLegacyServiceWorkers().catch(() => {
      // Legacy SW cleanup failed; the app can continue without PWA cleanup.
    });
  }, []);

  useEffect(() => {
    async function checkPWA() {
      try {
        const settings = await getClientPublicSettings();
        if (settings.pwa_enabled) {
          setEnabled(true);
        }
      } catch {
        // ignore
      }
    }
    checkPWA();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Add manifest link
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = rootPublicAssetUrl("/manifest.webmanifest");
      document.head.appendChild(link);
    }

    // Add theme-color meta
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = "#2563eb";
      document.head.appendChild(meta);
    }

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(rootPublicAssetUrl("/sw.js"), { scope: serviceWorkerScopePath() })
        .catch(() => {
          // SW registration failed
        });
    }
  }, [enabled]);

  return null;
}

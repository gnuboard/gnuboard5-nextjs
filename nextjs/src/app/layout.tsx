import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import "@g5-theme/theme.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ThemeSlotsProvider } from "@/components/providers/ThemeSlotsProvider";
import { PageLoadingProvider } from "@/components/providers/PageLoadingProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/toaster";
import { BackToTop } from "@/components/layout/BackToTop";
import { MobileNav } from "@/components/layout/MobileNav";
import { CompareTray } from "@/components/shop/CompareTray";
import { PWAProvider } from "@/components/providers/PWAProvider";
import { WebVitals } from "@/components/WebVitals";
import { MaintenanceBeacon } from "@/components/MaintenanceBeacon";
import { API_BASE_URL, APP_BASE_URL, CLIENT_API_BASE_URL, G5_BASE_URL, rootPublicAssetUrl } from "@/lib/config";
import { runtimeConfigScriptSource } from "@/lib/runtime-config-script";
import { usesServerRuntime } from "@/lib/next-runtime";
import { getMenuItems } from "@/services/menus";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/seo/JsonLd";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { LegacyRouteBridge } from "@/components/legacy-route-bridge";
import { RuntimeNavigationBridge } from "@/components/runtime-navigation-bridge";
import { themeComponents, themeConfig } from "@/lib/theme";
import { runtimeSeoConfig, serverSeoSettings } from "@/lib/seo-config";
import { serverSiteName } from "@/lib/site-name";
import type { ServerUser } from "@/lib/auth-server";

const SITE_DESC = themeConfig.site.description;
const ICON_192_URL = rootPublicAssetUrl('/icon-192.png');
const ICON_512_URL = rootPublicAssetUrl('/icon-512.png');
const OG_DEFAULT_URL = rootPublicAssetUrl('/og-default.png');
const SERVER_RUNTIME = usesServerRuntime();
// 검색엔진 노출(G5_NEXTJS_SEO). 정적 빌드에서는 빌드 때 값이고, 테마 브리지가 요청 때 설치본의 api/.env 로 덮어쓴다.
const SEO_SETTINGS = serverSeoSettings();

function runtimeConfigScript(siteName: string): string {
  // Theme-neutral runtime-config global (see lib/config.ts). The gnuboard PHP bridge
  // injects the same global with the active theme's URLs; those win over these build-time
  // defaults. A legacy nextjs25 alias is kept so a bundle still merges values injected by
  // not-yet-updated PHP during a deploy.
  return runtimeConfigScriptSource(
    {
      apiBaseUrl: SERVER_RUNTIME ? CLIENT_API_BASE_URL : API_BASE_URL,
      g5BaseUrl: G5_BASE_URL,
      appBaseUrl: APP_BASE_URL,
      themeSource: themeConfig.name,
      seo: runtimeSeoConfig(SEO_SETTINGS),
      siteName,
    },
    { runtimeConfigKey: process.env.NEXT_PUBLIC_RUNTIME_CONFIG_KEY }
  );
}

async function getInitialUserForLayout(): Promise<ServerUser | null> {
  if (!SERVER_RUNTIME) {
    return null;
  }

  const { getCurrentUser } = await import("@/lib/auth-server");
  return getCurrentUser();
}

/** 사이트 이름은 설치본마다 다르다(cf_title) — site-name.ts 참고. */
export async function generateMetadata(): Promise<Metadata> {
  const SITE_NAME = await serverSiteName();

  return {
  metadataBase: new URL(APP_BASE_URL),
  title: {
    default: SITE_NAME,
    // 자식 페이지가 generateMetadata 로 title 만 넘기면 "글 제목 — 사이트명" 형태로 합성
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  // 브라우저 탭 파비콘 — 정적 호스트의 route.php 가 icon-[0-9]+\.png 를 서빙하므로
  // 별도 favicon.ico 없이 기존 PWA 아이콘을 재사용. <link rel="icon"> 가 주입되어
  // 브라우저가 /favicon.ico 를 추가로 찾지 않게 되어 404 도 사라진다.
  icons: {
    icon: [{ url: ICON_192_URL, type: 'image/png', sizes: '192x192' }],
    shortcut: [ICON_192_URL],
    apple: [{ url: ICON_512_URL, sizes: '512x512' }],
  },
  // 카톡 / Twitter 등 공유 시 카드 미리보기.
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESC,
    locale: 'ko_KR',
    url: APP_BASE_URL,
    images: [
      {
        url: OG_DEFAULT_URL,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESC,
    images: [OG_DEFAULT_URL],
  },
  robots: SEO_SETTINGS.enabled
    ? {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
      }
    : { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ThemeLayoutShell = themeComponents.LayoutShell;
  const [menus, initialUser, siteName] = await Promise.all([
    getMenuItems(),
    getInitialUserForLayout(),
    serverSiteName(),
  ]);

  return (
    <html lang="ko" suppressHydrationWarning>
      <body data-g5-theme-source={themeConfig.name}>
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript(siteName) }} />
        {/* SEO — Organization + WebSite SearchAction JSON-LD. 모든 페이지에 한 번씩. */}
        <OrganizationJsonLd name={siteName} />
        <WebSiteJsonLd name={siteName} />
        {/* GA4 — NEXT_PUBLIC_GA_ID 미설정 시 자동 skip. */}
        <GoogleAnalytics id={process.env.NEXT_PUBLIC_GA_ID} />
        {/* 접근성 — 키보드 사용자가 첫 Tab 으로 본문 바로 이동. */}
        <a href="#main-content" className="skip-link">본문 바로가기</a>
        <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" disableTransitionOnChange>
          <AuthProvider initialUser={initialUser}>
          {/* 테마의 클라이언트 프레젠테이션 슬롯만 골라 컨텍스트로 넘긴다. */}
          <ThemeSlotsProvider
            slots={{
              BoardListRow: themeComponents.BoardListRow,
              ProductCard: themeComponents.ProductCard,
              BoardViewHeader: themeComponents.BoardViewHeader,
              ShopListHeader: themeComponents.ShopListHeader,
              ProductDetailTabs: themeComponents.ProductDetailTabs,
            }}
          >
            {ThemeLayoutShell ? (
              <ThemeLayoutShell config={themeConfig} menus={menus}>
                {children}
              </ThemeLayoutShell>
            ) : (
              <div className="min-h-screen flex flex-col">
                <Header initialMenus={menus} initialUser={initialUser} />
                <main id="main-content" className="flex-1 pb-16 md:pb-0">{children}</main>
                <Footer />
              </div>
            )}
            <Toaster />
            {!ThemeLayoutShell && <BackToTop />}
            {!ThemeLayoutShell && <MobileNav />}
            <CompareTray />
            <PWAProvider />
            <WebVitals />
            <MaintenanceBeacon />
            <LegacyRouteBridge />
            <RuntimeNavigationBridge />
            <Suspense fallback={null}>
              <PageLoadingProvider />
            </Suspense>
          </ThemeSlotsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

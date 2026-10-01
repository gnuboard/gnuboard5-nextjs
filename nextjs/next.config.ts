import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { assertThemeSource, resolveThemeSourceName, themeSourceDir } from './scripts/theme-source-name.mjs';
import {
  canonicalShopServerRedirects,
  contextualShopServerRewrites,
  shortBoardServerRewrites,
  shortShopServerRewrites,
} from './scripts/route-rules.mjs';
import { PRIVATE_NOINDEX_SOURCES } from './scripts/lib/route-policy-rules.mjs';
import { runtimeConfigScriptSource } from './src/lib/runtime-config-script';
import { usesServerRuntime } from './src/lib/next-runtime';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const SERVER_RUNTIME = usesServerRuntime();
const STATIC_EXPORT = !SERVER_RUNTIME;
const REQUIRED_PRODUCTION_ENV = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_G5_URL',
] as const;
const DEV_API_BASE_URL = 'http://localhost/api/v1';
const DEV_G5_BASE_URL = 'http://localhost';
const DEV_APP_BASE_URL = 'http://localhost:3000';

const THEME_SOURCE = assertThemeSource(resolveThemeSourceName());
const THEME_SOURCE_DIR = themeSourceDir(THEME_SOURCE);
const THEME_ALIASES: Record<string, string> = {
  '@g5-theme/components': join(THEME_SOURCE_DIR, 'components.tsx'),
  '@g5-theme/theme.config': join(THEME_SOURCE_DIR, 'theme.config.ts'),
  '@g5-theme/theme.css': join(THEME_SOURCE_DIR, 'theme.css'),
  '@g5-theme': THEME_SOURCE_DIR,
};
const THEME_TURBOPACK_SOURCE = `./themes/${THEME_SOURCE}`;
const THEME_TURBOPACK_ALIASES: Record<string, string> = {
  '@g5-theme/components': `${THEME_TURBOPACK_SOURCE}/components.tsx`,
  '@g5-theme/theme.config': `${THEME_TURBOPACK_SOURCE}/theme.config.ts`,
  '@g5-theme/theme.css': `${THEME_TURBOPACK_SOURCE}/theme.css`,
  '@g5-theme': THEME_TURBOPACK_SOURCE,
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function publicRuntimeUrl(
  name: (typeof REQUIRED_PRODUCTION_ENV)[number],
  developmentFallback: string
): string {
  return trimTrailingSlash(process.env[name]?.trim() || developmentFallback);
}

function requireProductionEnv(name: (typeof REQUIRED_PRODUCTION_ENV)[number]): string {
  const value = process.env[name]?.trim() ?? '';
  if (process.env.NODE_ENV === 'production' && value === '') {
    throw new Error(`Missing ${name}. Production builds must pin public runtime URLs.`);
  }

  return value;
}

for (const name of REQUIRED_PRODUCTION_ENV) {
  requireProductionEnv(name);
}

function apiRewriteDestination(): string {
  const value = process.env.G5_API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL;
  if (value) return trimTrailingSlash(value);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing G5_API_INTERNAL_URL or NEXT_PUBLIC_API_URL for production server runtime.');
  }
  return 'http://localhost/api/v1';
}

function originFromUrl(value?: string): string {
  if (!value) return '';

  try {
    return new URL(trimTrailingSlash(value)).origin;
  } catch {
    return '';
  }
}

const DEFAULT_IMAGE_HOSTS = [
  'graph.facebook.com',
  'lh3.googleusercontent.com',
  'k.kakaocdn.net',
  'phinf.pstatic.net',
];
const DEFAULT_LOCAL_IMAGE_HOSTS = [
  'localhost',
  '127.0.0.1',
];

const extraHosts = (process.env.NEXT_IMAGE_EXTRA_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);
const localImageHosts = [
  ...DEFAULT_LOCAL_IMAGE_HOSTS,
  ...(process.env.NEXT_IMAGE_LOCAL_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean),
].filter((host, index, hosts) => hosts.indexOf(host) === index);

const ALLOWED_IMAGE_HOSTS = [...new Set([...DEFAULT_IMAGE_HOSTS, ...extraHosts])];

const isDev = process.env.NODE_ENV !== 'production';

// 설치 폴더를 모르는 채로 한 번만 빌드한다. 자리표시자를 basePath 로 박아 두면 Next 가
// 링크·라우터·청크 경로를 전부 같은 접두사로 만들고, PHP 브리지(plugin/webapp/bridge/common.php)가
// 응답 시점에 이 값을 실제 설치 경로로 바꾼다. 페이로드 속 경로만 골라 고치다 하이드레이션이
// 멈추던 문제가 원천적으로 사라진다. G5_PORTABLE_BUILD=0 이면 예전 방식으로 돈다.
// scripts/build-next.mjs 와 plugin/webapp/bridge/common.php 의 문자열과 같아야 한다.
const PORTABLE_STATIC_BUILD = STATIC_EXPORT && !isDev && process.env.G5_PORTABLE_BUILD !== '0';
const G5_BASE_PATH_PLACEHOLDER = '/__g5base__';
const strictCsp = process.env.NEXT_CSP_STRICT === '1';
const cspReportOnly = process.env.NEXT_CSP_REPORT_ONLY === '1';
const allowUnsafeInlineScript = !strictCsp || process.env.NEXT_CSP_ALLOW_UNSAFE_INLINE === '1';
const allowUnsafeInlineStyle = !strictCsp || process.env.NEXT_CSP_ALLOW_UNSAFE_INLINE_STYLE === '1';
const includeRuntimeConfigScriptHash = strictCsp && !allowUnsafeInlineScript;
const runtimeConfigScript = runtimeConfigScriptSource(
  {
    apiBaseUrl: SERVER_RUNTIME
      ? '/api/v1'
      : publicRuntimeUrl('NEXT_PUBLIC_API_URL', DEV_API_BASE_URL),
    g5BaseUrl: publicRuntimeUrl('NEXT_PUBLIC_G5_URL', DEV_G5_BASE_URL),
    appBaseUrl: publicRuntimeUrl('NEXT_PUBLIC_APP_URL', DEV_APP_BASE_URL),
    themeSource: THEME_SOURCE,
  },
  { runtimeConfigKey: process.env.NEXT_PUBLIC_RUNTIME_CONFIG_KEY }
);
const runtimeConfigScriptHash = `'sha256-${createHash('sha256')
  .update(runtimeConfigScript)
  .digest('base64')}'`;
const pgFrameSources = [
  'https://*.tosspayments.com',
  'https://testpay.kcp.co.kr',
  'https://*.kcp.co.kr',
  'https://stdpay.inicis.com',
  'https://stgstdpay.inicis.com',
  'https://*.inicis.com',
  'https://web.nicepay.co.kr',
  'https://*.nicepay.co.kr',
].join(' ');
const pgScriptSources = pgFrameSources;
const postcodeScriptSources = 'https://t1.daumcdn.net';
const postcodeImageSources = ['https://t1.daumcdn.net', 'https://t1.kakaocdn.net'].join(' ');
const postcodeFrameSources = ['https://postcode.map.daum.net', 'https://postcode.map.kakao.com'].join(' ');
const apiConnectSources = [
  originFromUrl(process.env.NEXT_PUBLIC_API_URL),
  originFromUrl(process.env.NEXT_PUBLIC_G5_URL),
  originFromUrl(process.env.G5_API_INTERNAL_URL),
]
  .filter((source) => source.startsWith('https://'))
  .filter((source, index, sources) => sources.indexOf(source) === index)
  .join(' ');
const scriptSources = [
  `'self'`,
  ...(includeRuntimeConfigScriptHash ? [runtimeConfigScriptHash] : []),
  ...(allowUnsafeInlineScript ? [`'unsafe-inline'`] : []),
  ...(process.env.NEXT_CSP_ALLOW_UNSAFE_EVAL === '1' ? [`'unsafe-eval'`] : []),
  'https://js.tosspayments.com',
  pgScriptSources,
  postcodeScriptSources,
].join(' ');
const csp = [
  `default-src 'self'`,
  `script-src ${scriptSources}`,
  `style-src 'self'${allowUnsafeInlineStyle ? ` 'unsafe-inline'` : ''}`,
  `img-src 'self' blob: data: https: ${postcodeImageSources}`,
  `font-src 'self' data:`,
  `connect-src 'self' ${apiConnectSources} ${isDev ? 'http://localhost http://localhost:* ws://localhost:*' : ''}`.trim(),
  `frame-src ${pgFrameSources} ${postcodeFrameSources}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self' ${pgFrameSources}`,
  `object-src 'none'`,
].join('; ');

const noindexHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0, private' },
  { key: 'Pragma', value: 'no-cache' },
];

const privateNoindexSources = PRIVATE_NOINDEX_SOURCES;

const longBoardCanonicalRedirects: NonNullable<NextConfig['redirects']> = async () => [
  {
    source: '/boards/:bo_table/write',
    destination: '/:bo_table/write',
    permanent: true,
  },
  {
    source: '/boards/:bo_table/rss',
    destination: '/rss/:bo_table',
    permanent: true,
  },
  {
    source: '/boards/:bo_table/:wr_id',
    destination: '/:bo_table/:wr_id',
    permanent: true,
  },
  {
    source: '/boards/:bo_table',
    destination: '/:bo_table',
    permanent: true,
  },
];

const youngCartServerRedirects: NonNullable<NextConfig['redirects']> = async () => [
  {
    source: '/shop/index.php',
    destination: '/shop/',
    permanent: true,
  },
  {
    source: '/shop/cart.php',
    destination: '/shop/cart',
    permanent: true,
  },
  {
    source: '/shop/wishlist.php',
    destination: '/shop/wishlist',
    permanent: true,
  },
  {
    source: '/shop/couponzone.php',
    destination: '/shop/couponzone',
    permanent: true,
  },
  {
    source: '/shop/search.php',
    destination: '/shop/search',
    permanent: true,
  },
  {
    source: '/shop/largeimage.php',
    destination: '/shop/largeimage',
    permanent: true,
  },
  {
    source: '/shop/mypage.php',
    destination: '/mypage',
    permanent: true,
  },
  {
    source: '/shop/orderinquiry.php',
    destination: '/shop/orders',
    permanent: true,
  },
  {
    source: '/shop/personalpay.php',
    destination: '/shop/personalpay',
    permanent: true,
  },
];

const legacyAdminServerRedirects: NonNullable<NextConfig['redirects']> = async () => {
  const destination = `${publicRuntimeUrl('NEXT_PUBLIC_G5_URL', DEV_G5_BASE_URL)}/adm`;
  return [
    { source: '/admin', destination, permanent: false },
    { source: '/admin/:path*', destination, permanent: false },
  ];
};

const themeAliasServerRedirects: NonNullable<NextConfig['redirects']> = async () => [
  { source: '/community', destination: '/', permanent: true },
  { source: '/organic', destination: '/shop', permanent: true },
];

const serverRuntimeConfig: NextConfig = STATIC_EXPORT
  ? {}
  : {
      async headers() {
        return [
          ...privateNoindexSources.map((source) => ({
            source,
            headers: noindexHeaders,
          })),
          {
            source: '/:path*.txt',
            headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
          },
          {
            source: '/(.*)',
            headers: [
              { key: 'X-Content-Type-Options', value: 'nosniff' },
              { key: 'X-Frame-Options', value: 'DENY' },
              { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
              { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
              { key: 'X-DNS-Prefetch-Control', value: 'on' },
              ...(isDev
                ? []
                : [
                    { key: cspReportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', value: csp },
                    {
                      key: 'Strict-Transport-Security',
                      value: 'max-age=31536000; includeSubDomains',
                    },
                  ]),
            ],
          },
        ];
      },
      async redirects() {
        return [
          ...(await legacyAdminServerRedirects()),
          ...(await themeAliasServerRedirects()),
          ...(await longBoardCanonicalRedirects()),
          ...canonicalShopServerRedirects(),
          ...(await youngCartServerRedirects()),
          {
            source: '/member/:path*',
            destination: '/mypage',
            permanent: false,
          },
        ];
      },
      async rewrites() {
        const g5ApiUrl = apiRewriteDestination();
        return {
          beforeFiles: [
            ...contextualShopServerRewrites(),
            {
              source: '/api/v1',
              destination: g5ApiUrl,
            },
            {
              source: '/api/v1/:path*',
              destination: `${g5ApiUrl}/:path*`,
            },
            {
              source: '/api/g5/:path*',
              destination: `${g5ApiUrl}/:path*`,
            },
          ],
          afterFiles: [...shortShopServerRewrites(), ...shortBoardServerRewrites()],
        };
      },
    };

const nextConfig: NextConfig = {
  ...(STATIC_EXPORT ? { output: 'export' as const } : {}),
  ...(PORTABLE_STATIC_BUILD ? { basePath: G5_BASE_PATH_PLACEHOLDER } : {}),
  // Theme-agnostic by default: one build artifact can serve any theme/<name> folder.
  // 그 대신 브리지가 HTML 의 /_next/ 를 실행 시점에 치환하는데, 그 치환이 RSC
  // 페이로드 안의 경로까지 건드려 하이드레이션이 멈춘다. 배포 위치가 하나로
  // 정해진 사이트는 이 값을 주면 빌드 때부터 경로가 맞아 치환이 필요 없다.
  // 휴대용 빌드(위 basePath 자리표시자)에서는 필요 없다. 예전 방식(G5_PORTABLE_BUILD=0)용.
  ...(process.env.G5_NEXT_ASSET_PREFIX
    ? { assetPrefix: process.env.G5_NEXT_ASSET_PREFIX }
    : {}),
  generateBuildId: async () => process.env.G5_NEXT_BUILD_ID || (STATIC_EXPORT ? 'g5-static' : 'g5-server'),
  distDir: process.env.G5_NEXT_DIST_DIR || '.next',
  trailingSlash: false,
  env: {
    G5_NEXT_RUNTIME: SERVER_RUNTIME ? 'server' : 'static',
    G5_THEME_SOURCE: THEME_SOURCE,
  },
  /*
   * 청크를 덜 쪼갠다.
   *
   * 이 빌드는 그누보드 설치본 안의 정적 파일로 서빙되고, 그 호스트(Cafe24 공유호스팅 등)는
   * 대개 HTTP/1.1 이다. 재보면 청크가 사실상 한 번에 하나씩 내려온다 — 홈에서 JS 28 개가
   * 첫 요청 33ms 부터 마지막 완료 2293ms 까지 2.26 초에 걸쳐 도착했다. Turbopack 의 기본
   * requestCost(200KB)는 HTTP/2 를 가정한 값이라 우리 환경에서는 요청 하나를 너무 싸게
   * 매긴다. 요청을 비싸게 매기고 한 화면의 청크 수에 상한을 둬서 첫 화면을 먼저 살린다.
   *
   * 대가: 화면을 옮길 때 이미 받은 것과 겹치는 큰 청크를 다시 받을 수 있다. 정적 자원은
   * immutable 로 1 년 캐시되므로 재방문에는 영향이 없고, 지금은 첫 방문 비용이 더 크다.
   * priorityRoutes 는 처음 들어오는 화면 — 커뮤니티 홈과 쇼핑 홈.
   *
   * experimental 이므로 Next 를 올릴 때 이 블록이 아직 유효한지 확인할 것.
   */
  experimental: {
    turbopackChunking: {
      requestCost: 600_000,
      minChunkSize: 150_000,
      maxChunkCountPerGroup: 12,
      priorityRoutes: [/^\/$/, /^\/shop$/],
    },
  },
  turbopack: {
    resolveAlias: THEME_TURBOPACK_ALIASES,
  },
  images: {
    unoptimized: STATIC_EXPORT,
    remotePatterns: [
      ...(isDev || STATIC_EXPORT || process.env.NEXT_IMAGE_ALLOW_LOCAL_HOSTS === '1'
        ? localImageHosts.map((hostname) => ({ protocol: 'http' as const, hostname }))
        : []),
      ...ALLOWED_IMAGE_HOSTS.map((hostname) => ({
        protocol: 'https' as const,
        hostname,
      })),
    ],
  },
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      ...THEME_ALIASES,
    };

    return config;
  },
  ...serverRuntimeConfig,
};

const SENTRY_ENABLED = !!(process.env.SENTRY_AUTH_TOKEN && process.env.NEXT_PUBLIC_SENTRY_DSN);

const baseConfig = withBundleAnalyzer(nextConfig);

export default SENTRY_ENABLED
  ? withSentryConfig(baseConfig, {
      silent: !process.env.CI,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      widenClientFileUpload: true,
      sourcemaps: { disable: false },
      disableLogger: true,
      ...(process.env.NEXT_PUBLIC_SENTRY_TUNNEL_ROUTE
        ? { tunnelRoute: process.env.NEXT_PUBLIC_SENTRY_TUNNEL_ROUTE }
        : {}),
    })
  : baseConfig;

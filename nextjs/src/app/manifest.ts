import type { MetadataRoute } from 'next';
import { themeConfig } from '@g5-theme/theme.config';
import { rootPublicAssetUrl } from '@/lib/config';
import { serverSiteName } from '@/lib/site-name';

export const dynamic = 'force-static';

/**
 * PWA manifest — Next 13+ metadata route. 이전엔 public/manifest.json 정적 파일을
 * 사용했지만 manifest.ts 로 옮기면 metadata API 와 통합되고 환경 변수로 동적 조정 가능.
 *
 * 기존 public/manifest.json 은 그대로 둬도 무방하지만 빌드 시 /manifest.webmanifest
 * 가 자동 송출되며 metadata 의 manifest 필드도 자동 연결됨.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // 설치본의 사이트 제목(cf_title). 정적 빌드는 테마 기본값이고 테마 브리지가 요청 때 바꾼다.
  const siteName = await serverSiteName();
  const themeColor = themeConfig.site.themeColor ?? '#2563eb';

  return {
    name: siteName,
    short_name: themeConfig.site.logoText || siteName,
    description: themeConfig.site.description,
    start_url: rootPublicAssetUrl('/'),
    scope: rootPublicAssetUrl('/'),
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColor,
    orientation: 'portrait',
    icons: [
      { src: rootPublicAssetUrl('/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: rootPublicAssetUrl('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

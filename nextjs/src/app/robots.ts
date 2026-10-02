import type { MetadataRoute } from 'next';
import { APP_BASE_URL } from '@/lib/config';
import { serverSeoSettings } from '@/lib/seo-config';

export const dynamic = 'force-static';

/**
 * Vercel(Next 서버)용 robots.txt. 테마 설치본에서는 테마 브리지가 요청 때 설치본의 api/.env 로 다시 만든다.
 * G5_NEXTJS_SEO 가 off(기본값)면 전체를 막는다.
 */
export default function robots(): MetadataRoute.Robots {
  const base = APP_BASE_URL.replace(/\/+$/, '');
  if (!serverSeoSettings().enabled) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 로그인 / 회원 영역은 크롤링 막기 — 검색 엔진이 인증 페이지를 인덱싱하면
        // 빈 페이지가 노출됨.
        disallow: [
          '/login',
          '/register',
          '/forgot-password',
          '/mypage',
          // 회원 자기소개 — 로그인해야 보이고 주소에 회원 키가 든다(예전 주소는 아이디).
          '/members',
          '/admin',
          '/api',
          // 쇼핑 — 개인 장바구니/주문/결제 흐름은 인덱싱 불필요.
          '/shop/cart',
          '/shop/order',
          '/shop/orders',
          '/shop/payment',
          '/shop/personalpay',
          '/shop/search',
          '/shop/wishlist',
          '/search',
        ],
      },
      // bad-bot 들 명시 차단 — 필요하면 운영자가 NEXT_BLOCKED_BOTS 환경변수로 추가.
    ],
    sitemap: [`${base}/sitemap.xml`, `${base}/sitemap-posts.xml`],
  };
}

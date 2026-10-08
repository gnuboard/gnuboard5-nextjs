import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseCsvEnv(name, fallback) {
  if (!Object.prototype.hasOwnProperty.call(process.env, name)) {
    return fallback;
  }

  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

for (const arg of process.argv.slice(2)) {
  if (
    !['--require-auth', '--seed-auth', '--mobile'].includes(arg)
  ) {
    console.error(`[check-local-browser] Unknown argument: ${arg}`);
    console.error(
      '[check-local-browser] Supported arguments: --require-auth, --seed-auth, --mobile'
    );
    process.exit(1);
  }
}

/**
 * 테마마다 셸 모양이 다르면 그 테마 폴더의 smoke.json 이 기대 선택자를 정한다
 * ({ "communityShell": [...], "shopShell": [...] }). 없으면 머리 · 바닥 기본값.
 * 테마 이름을 이 공용 파일에 적지 않는다 — 공개 배포판에는 공개 테마만 실린다.
 */
function themeShellSelectors(themeSource) {
  const bodySelector = `body[data-g5-theme-source="${themeSource}"]`;
  const defaults = { communityShell: [bodySelector, 'header'], shopShell: [bodySelector, 'header', 'footer'] };
  const smokePath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'themes', themeSource, 'smoke.json');
  if (!existsSync(smokePath)) return defaults;
  const custom = JSON.parse(readFileSync(smokePath, 'utf8'));
  return {
    communityShell: [bodySelector, ...(custom.communityShell ?? defaults.communityShell.slice(1))],
    shopShell: [bodySelector, ...(custom.shopShell ?? defaults.shopShell.slice(1))],
  };
}

export function createLocalBrowserChecks({ expectedApiUrl, themeSource = 'default' }) {
const { communityShell: communityShellSelectors, shopShell: shopShellSelectors } = themeShellSelectors(themeSource);
const communityForbiddenSelectors = [];
const shopForbiddenSelectors = [];
const homeExpectedSelectors = communityShellSelectors;
const shopHomeExpectedSelectors = [...shopShellSelectors, 'main', 'a[href^="/shop/"]'];
const smokePaths = [
  {
    label: 'home',
    path: '/',
    checkShortLinks: true,
    expectedSelectors: homeExpectedSelectors,
    expectedHeaderHrefs: parseCsvEnv('LOCAL_SMOKE_EXPECTED_HEADER_HREFS', []),
    forbiddenHeaderHrefParts: parseCsvEnv('LOCAL_SMOKE_FORBIDDEN_HEADER_HREF_PARTS', [
      '/boards/notice',
      '/boards/free',
      '/boards/qa',
      '/boards/cm_free',
      '/boards/n_gallery',
    ]),
  },
  {
    label: 'board list',
    path: process.env.LOCAL_SMOKE_BOARD_PATH || '/free',
    expectedApiParts: ['/settings', '/boards/free', '/boards/free/posts'],
    expectedTitleIncludes: '자유게시판',
    expectedH1: '자유게시판',
  },
  {
    label: 'board post',
    path: process.env.LOCAL_SMOKE_POST_PATH || '/free/6',
    expectedApiParts: parseCsvEnv('LOCAL_SMOKE_POST_EXPECTED_API_PARTS', [
      '/settings',
      '/boards/free',
      '/posts/free/6',
    ]),
    expectedTitleIncludes: 'Сериал Моя геройская академия',
    expectedH1:
      'Сериал Моя геройская академия: Вне закона (2 сезон) 6 серия смотреть онлайн в HD 1080 Lordfilm',
    expectedJsonLdTypes: ['Article', 'BreadcrumbList'],
  },
  {
    label: 'board post seo',
    path:
      process.env.LOCAL_SMOKE_POST_SEO_PATH ||
      '/free/%D0%A1%D0%B5%D1%80%D0%B8%D0%B0%D0%BB-%D0%9C%D0%BE%D1%8F-%D0%B3%D0%B5%D1%80%D0%BE%D0%B9%D1%81%D0%BA%D0%B0%D1%8F-%D0%B0%D0%BA%D0%B0%D0%B4%D0%B5%D0%BC%D0%B8%D1%8F-%D0%92%D0%BD%D0%B5-%D0%B7%D0%B0%D0%BA%D0%BE%D0%BD%D0%B0-2-%D1%81%D0%B5%D0%B7%D0%BE%D0%BD/',
    expectedFinalPath: process.env.LOCAL_SMOKE_POST_PATH || '/free/6',
    expectedApiParts: parseCsvEnv('LOCAL_SMOKE_POST_SEO_EXPECTED_API_PARTS', [
      '/settings',
      '/boards/free',
      '/posts/free/seo/',
    ]),
    expectedTitleIncludes: 'Сериал Моя геройская академия',
    expectedH1:
      'Сериал Моя геройская академия: Вне закона (2 сезон) 6 серия смотреть онлайн в HD 1080 Lordfilm',
    expectedJsonLdTypes: ['Article', 'BreadcrumbList'],
  },
  {
    label: 'board write',
    path: process.env.LOCAL_SMOKE_WRITE_PATH || '/free/write',
    expectedFinalPath: process.env.LOCAL_SMOKE_WRITE_FINAL_PATH || '/login?redirect=%2Ffree%2Fwrite',
    expectedApiParts: ['/boards/free'],
    expectedSelectors: [
      'form',
      'input[name="mb_id"]',
      'input[name="mb_password"]',
      ...communityShellSelectors,
    ],
    forbiddenSelectors: communityForbiddenSelectors,
    skipSeoUrlCheck: true,
  },
  {
    label: 'content',
    path: process.env.LOCAL_SMOKE_CONTENT_PATH || '/content/company',
    expectedApiParts: parseCsvEnv('LOCAL_SMOKE_CONTENT_EXPECTED_API_PARTS', []),
    expectedTitleIncludes: '회사소개',
    expectedH1: '회사소개',
  },
  {
    label: 'faq',
    path: process.env.LOCAL_SMOKE_FAQ_PATH || '/faq',
    expectedApiParts: ['/settings', '/faqs'],
    expectedTitleIncludes: 'FAQ',
  },
  {
    label: 'polls',
    path: process.env.LOCAL_SMOKE_POLLS_PATH || '/polls',
    expectedApiParts: ['/settings', '/polls/current'],
    expectedTitleIncludes: '설문조사',
    allowedBadResponses: [`404 ${expectedApiUrl}/polls/current`],
  },
  {
    label: 'recent',
    path: process.env.LOCAL_SMOKE_RECENT_PATH || '/recent',
    expectedApiParts: ['/settings', '/recent/groups', '/recent?page=1'],
    expectedTitleIncludes: '새글',
  },
  {
    label: 'search',
    path: process.env.LOCAL_SMOKE_SEARCH_PATH || '/search?q=test',
    expectedApiParts: ['/settings', '/search?q=test'],
    expectedTitleIncludes: '검색',
    allowSeoQueryStripping: true,
  },
  {
    label: 'shop home',
    path: process.env.LOCAL_SMOKE_SHOP_HOME_PATH || '/shop',
    expectedApiParts: ['/settings'],
    expectedTitleIncludes: '쇼핑몰',
    expectedSelectors: shopHomeExpectedSelectors,
    forbiddenSelectors: [],
  },
  {
    label: 'shop support new',
    path: process.env.LOCAL_SMOKE_SHOP_SUPPORT_NEW_PATH || '/shop/qas/new',
    expectedFinalPath:
      process.env.LOCAL_SMOKE_SHOP_SUPPORT_NEW_FINAL_PATH ||
      '/shop/login?redirect=%2Fshop%2Fqas%2Fnew',
    expectedSelectors: shopShellSelectors,
    forbiddenSelectors: [],
    skipSeoUrlCheck: true,
  },
  {
    label: 'shop content',
    path: process.env.LOCAL_SMOKE_SHOP_CONTENT_PATH || '/shop/content/company',
    expectedApiParts: ['/settings'],
    expectedTitleIncludes: '회사소개',
    expectedSelectors: [...shopShellSelectors, 'main'],
    forbiddenSelectors: [],
  },
  {
    label: 'shop product',
    path: process.env.LOCAL_SMOKE_PRODUCT_PATH || '/shop/1446772772',
    expectedApiParts: parseCsvEnv('LOCAL_SMOKE_PRODUCT_EXPECTED_API_PARTS', ['/settings']),
    expectedTitleIncludes: 'TH-블락체크 셔츠-그레이2 [면세]',
    expectedH1: 'TH-블락체크 셔츠-그레이2 [면세]',
    expectedJsonLdTypes: ['Product', 'BreadcrumbList'],
  },
  {
    label: 'shop product seo',
    path:
      process.env.LOCAL_SMOKE_PRODUCT_SEO_PATH ||
      '/shop/th-%EB%B8%94%EB%9D%BD%EC%B2%B4%ED%81%AC-%EC%85%94%EC%B8%A0-%EA%B7%B8%EB%A0%88%EC%9D%B42-%EB%A9%B4%EC%84%B8/',
    expectedApiParts: parseCsvEnv('LOCAL_SMOKE_PRODUCT_SEO_EXPECTED_API_PARTS', ['/settings']),
    expectedJsonLdTypes: ['Product', 'BreadcrumbList'],
    skipSeoUrlCheck: true,
  },
  {
    label: 'shop category',
    path: process.env.LOCAL_SMOKE_CATEGORY_PATH || '/shop/list-2010101010',
    expectedApiParts: parseCsvEnv('LOCAL_SMOKE_CATEGORY_EXPECTED_API_PARTS', [
      '/settings',
      '/shop/categories/2010101010',
    ]),
    expectedTitleIncludes: '체크',
    expectedH1: '체크',
    expectedSelectors: [],
  },
  {
    label: 'shop type',
    path: process.env.LOCAL_SMOKE_TYPE_PATH || '/shop/type-1',
    expectedApiParts: parseCsvEnv('LOCAL_SMOKE_TYPE_EXPECTED_API_PARTS', ['/settings']),
    expectedTitleIncludes: '베스트 상품',
    expectedH1: '베스트 상품',
  },
  {
    label: 'shop search',
    path: process.env.LOCAL_SMOKE_SHOP_SEARCH_PATH || '/shop/search?q=TH&qcaid=2010101010&qname=1',
    expectedApiParts: ['/settings', '/shop/products?', 'q=TH', 'ca_id=2010101010', 'qname=1'],
    expectedTitleIncludes: 'TH',
    allowSeoQueryStripping: true,
  },
  {
    label: 'shop largeimage',
    path: process.env.LOCAL_SMOKE_SHOP_LARGEIMAGE_PATH || '/shop/largeimage?it_id=1446772772&no=1',
    expectedApiParts: parseCsvEnv('LOCAL_SMOKE_SHOP_LARGEIMAGE_EXPECTED_API_PARTS', ['/settings']),
    expectedTitleIncludes: '큰 이미지',
    expectedSelectors: ['a[href^="/shop/"]'],
  },
  {
    label: 'shop events',
    path: process.env.LOCAL_SMOKE_EVENTS_PATH || '/shop/events',
    expectedApiParts: ['/settings', '/shop/events'],
    expectedTitleIncludes: '기획전',
    expectedH1: '기획전',
  },
  {
    label: 'shop couponzone',
    path: process.env.LOCAL_SMOKE_COUPONZONE_PATH || '/shop/couponzone',
    expectedApiParts: ['/settings', '/shop/coupons/zone'],
    expectedTitleIncludes: '쿠폰존',
    expectedH1: '쿠폰존',
  },
  {
    label: 'shop cart',
    path: process.env.LOCAL_SMOKE_CART_PATH || '/shop/cart',
    expectedApiParts: ['/settings', '/shop/cart'],
    expectedTitleIncludes: '장바구니',
  },
  {
    label: 'shop order guest',
    path: process.env.LOCAL_SMOKE_ORDER_PATH || '/shop/order',
    expectedFinalPath: process.env.LOCAL_SMOKE_ORDER_FINAL_PATH || '/shop/cart',
    expectedApiParts: ['/settings', '/shop/cart', '/shop/payment/config'],
    forbiddenApiParts: ['/auth/me'],
    skipSeoUrlCheck: true,
    expectedTitleIncludes: '장바구니',
  },
  {
    label: 'shop compare',
    path: process.env.LOCAL_SMOKE_COMPARE_PATH || '/shop/compare',
    expectedApiParts: ['/settings'],
    expectedTitleIncludes: '상품 비교',
  },
  {
    label: 'mypage requires login',
    path: process.env.LOCAL_SMOKE_MYPAGE_GUEST_PATH || '/mypage',
    expectedFinalPath:
      process.env.LOCAL_SMOKE_MYPAGE_GUEST_FINAL_PATH || '/login?redirect=%2Fmypage',
    expectedApiParts: ['/settings'],
    forbiddenApiParts: ['/shop/orders', '/shop/wishlist', '/members/me', '/shop/addresses'],
    expectedSelectors: [
      'form',
      'input[name="mb_id"]',
      'input[name="mb_password"]',
      ...communityShellSelectors,
    ],
    forbiddenSelectors: communityForbiddenSelectors,
    skipSeoUrlCheck: true,
  },
  {
    label: 'shop orders guest lookup',
    path: process.env.LOCAL_SMOKE_ORDERS_PATH || '/shop/orders',
    expectedApiParts: ['/settings'],
    forbiddenApiParts: ['/shop/orders'],
    expectedSelectors: [
      'form',
      'input[type="text"]',
      'input[type="password"]',
      'a[href="/shop/login?redirect=%2Fshop%2Forders"]',
      ...shopShellSelectors,
    ],
    forbiddenSelectors: shopForbiddenSelectors,
    skipSeoUrlCheck: true,
  },
  {
    label: 'shop wishlist requires login',
    path: process.env.LOCAL_SMOKE_WISHLIST_PATH || '/shop/wishlist',
    expectedFinalPath:
      process.env.LOCAL_SMOKE_WISHLIST_FINAL_PATH || '/shop/login?redirect=%2Fshop%2Fwishlist',
    expectedApiParts: ['/settings'],
    forbiddenApiParts: ['/shop/wishlist'],
    expectedSelectors: [
      'form',
      'input[name="mb_id"]',
      'input[name="mb_password"]',
      ...shopShellSelectors,
    ],
    forbiddenSelectors: shopForbiddenSelectors,
    skipSeoUrlCheck: true,
  },
];

const authSmokePaths = [
  {
    label: 'mypage authenticated',
    path: process.env.LOCAL_SMOKE_MYPAGE_PATH || '/mypage',
    expectedApiParts: [
      '/auth/me',
      '/shop/orders?per_page=1',
      '/shop/wishlist',
      '/members/me/posts?per_page=1',
      '/members/me/comments?per_page=1',
      '/shop/addresses',
    ],
    forbiddenFinalPathParts: ['/login'],
  },
  {
    label: 'shop orders authenticated',
    path: process.env.LOCAL_SMOKE_AUTH_ORDERS_PATH || '/shop/orders',
    expectedApiParts: ['/auth/me', '/shop/orders?page=1&per_page=10'],
    forbiddenFinalPathParts: ['/login'],
  },
  {
    label: 'shop wishlist authenticated',
    path: process.env.LOCAL_SMOKE_AUTH_WISHLIST_PATH || '/shop/wishlist',
    expectedApiParts: ['/auth/me', '/shop/wishlist'],
    forbiddenFinalPathParts: ['/login'],
  },
];

  return { smokePaths, authSmokePaths };
}

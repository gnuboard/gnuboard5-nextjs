type SmokePage = {
  name: string;
  path: string;
};

function csv(value: string | undefined) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function extraSmokePages(): SmokePage[] {
  const explicit = csv(process.env.UI_SMOKE_EXTRA_PATHS).map((path, index) => ({
    name: `extra-${index + 1}`,
    path: normalizePath(path),
  }));
  const postPath =
    process.env.UI_SMOKE_POST_PATH ||
    process.env.SERVER_RUNTIME_SMOKE_POST_PATH ||
    process.env.LIVE_SMOKE_POST_PATH ||
    '';
  const productPath =
    process.env.UI_SMOKE_PRODUCT_PATH ||
    process.env.SERVER_RUNTIME_SMOKE_PRODUCT_PATH ||
    process.env.LIVE_SMOKE_PRODUCT_PATH ||
    '';
  const detailPages = [
    postPath ? { name: 'configured-post-detail', path: normalizePath(postPath) } : undefined,
    productPath ? { name: 'configured-product-detail', path: normalizePath(productPath) } : undefined,
  ].filter((page): page is SmokePage => Boolean(page));

  return [...explicit, ...detailPages];
}

function uniqueSmokePages(pages: SmokePage[]) {
  const seen = new Set<string>();
  return pages.filter((page) => {
    if (seen.has(page.path)) return false;
    seen.add(page.path);
    return true;
  });
}

const baseSmokePages: SmokePage[] = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'forgot-password', path: '/forgot-password' },
  { name: 'boards', path: '/boards' },
  { name: 'board-detail', path: '/boards/__g5_static__/0' },
  { name: 'faq', path: '/faq' },
  { name: 'polls', path: '/polls' },
  { name: 'recent', path: '/recent' },
  { name: 'shop', path: '/shop' },
  { name: 'shop-cart', path: '/shop/cart' },
  { name: 'shop-compare', path: '/shop/compare' },
  { name: 'shop-couponzone', path: '/shop/couponzone' },
  { name: 'shop-events', path: '/shop/events' },
  { name: 'shop-order', path: '/shop/order' },
  { name: 'shop-orders', path: '/shop/orders' },
  { name: 'shop-personalpay', path: '/shop/personalpay' },
  { name: 'shop-products', path: '/shop/products' },
  { name: 'product-detail', path: '/shop/products/g5-static-product' },
  { name: 'product-detail-short', path: '/shop/g5-static-product' },
  { name: 'shop-reviews', path: '/shop/reviews' },
  { name: 'shop-qas', path: '/shop/qas' },
  { name: 'shop-qas-new', path: '/shop/qas/new' },
  { name: 'shop-wishlist', path: '/shop/wishlist' },
  { name: 'search', path: '/search' },
  { name: 'mypage', path: '/mypage' },
  { name: 'mypage-addresses', path: '/mypage/addresses' },
  { name: 'mypage-coupons', path: '/mypage/coupons' },
  { name: 'mypage-orders', path: '/mypage/orders' },
  { name: 'mypage-reviews', path: '/mypage/reviews' },
  { name: 'mypage-wishlist', path: '/mypage/wishlist' },
  { name: 'mypage-qas', path: '/mypage/qas' },
];

export const smokePages = uniqueSmokePages([...baseSmokePages, ...extraSmokePages()]);

export const formValidationPages = [
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'shop-register', path: '/shop/register' },
  { name: 'forgot-password', path: '/forgot-password' },
];

export const a11ySmokePaths = smokePages.map((page) => page.path);

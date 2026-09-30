import {
  SHORT_BOARD_RESERVED_ROOTS,
  SHORT_SHOP_RESERVED_SEGMENTS,
  VERCEL_SHORT_BOARD_RESERVED_ROOTS,
  VERCEL_SHORT_SHOP_RESERVED_SEGMENTS,
} from './lib/route-policy-rules.mjs';

function escapeRouteRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function reservedLookaheadPattern(roots, { suffix = true, escape = true } = {}) {
  return roots
    .map((root) => `${escape ? escapeRouteRegex(root) : root}${suffix ? '(?:/|$)' : ''}`)
    .join('|');
}

const VERCEL_SHORT_BOARD_RESERVED_PATTERN = reservedLookaheadPattern(
  VERCEL_SHORT_BOARD_RESERVED_ROOTS,
  { suffix: false }
);
const VERCEL_SHORT_BOARD_ROOT_PATTERN =
  `:bo_table((?!${VERCEL_SHORT_BOARD_RESERVED_PATTERN})[0-9A-Za-z_]+)`;
const VERCEL_SHORT_SHOP_PRODUCT_PATTERN =
  `:it_id((?!${reservedLookaheadPattern(VERCEL_SHORT_SHOP_RESERVED_SEGMENTS, {
    suffix: false,
    escape: false,
  })})[^/]+)`;

const shortBoardReservedPattern = reservedLookaheadPattern(SHORT_BOARD_RESERVED_ROOTS);
const shortBoardRootPattern = `:bo_table((?!${shortBoardReservedPattern})[0-9A-Za-z_]+)`;

const shortShopReservedPattern = reservedLookaheadPattern(SHORT_SHOP_RESERVED_SEGMENTS);
const shortShopProductPattern =
  `:it_id((?!${shortShopReservedPattern})(?!list-[0-9A-Za-z]+(?:/|$))(?!type-[1-5](?:/|$))[^/]+)`;

function rewrite(source, destination) {
  return { source, destination };
}

function fallbackPair({ source, destination, txtSource = source, txtDestination = destination }) {
  return [
    rewrite(`${txtSource}.txt`, `${txtDestination}.txt`),
    rewrite(source, destination),
  ];
}

function namedFallback(root, name, placeholder, txtPattern = '[^/]+') {
  return fallbackPair({
    source: `${root}/:${name}`,
    destination: `${root}/${placeholder}`,
    txtSource: `${root}/:${name}(${txtPattern})`,
  });
}

function productFallback(root, placeholder) {
  return [
    rewrite(`${root}/:it_id.txt`, `${root}/${placeholder}.txt`),
    rewrite(`${root}/:it_id([0-9A-Za-z_-]+).txt`, `${root}/${placeholder}.txt`),
    rewrite(`${root}/:it_id`, `${root}/${placeholder}`),
  ];
}

export const vercelStaticFallbackManifest = [
  rewrite('/boards/:bo_table/rss', '/boards/__g5_static__/rss'),
  ...fallbackPair({
    source: '/boards/:bo_table/write',
    destination: '/boards/__g5_static__/write',
  }),
  ...fallbackPair({
    source: '/boards/:bo_table/:wr_id',
    destination: '/boards/__g5_static__/0',
    txtSource: '/boards/:bo_table([0-9A-Za-z_]+)/:wr_id([0-9]+)',
  }),
  ...namedFallback('/boards', 'bo_table', '__g5_static__', '[0-9A-Za-z_]+'),
  ...namedFallback('/content', 'co_id', '__g5_static__'),
  ...namedFallback('/mypage/memos', 'me_id', '__g5_static__', '[0-9]+'),
  ...namedFallback('/mypage/qas', 'qa_id', '__g5_static__', '[0-9]+'),
  ...namedFallback('/shop/categories', 'ca_id', '__g5_static__', '[0-9A-Za-z]+'),
  ...namedFallback('/shop/events', 'ev_id', '0', '[0-9]+'),
  ...namedFallback('/shop/orders', 'od_id', '__g5_static__'),
  ...namedFallback('/shop/personalpay', 'pp_id', '__g5_static__'),
  ...productFallback('/shop/products', '__g5_static__'),
  ...namedFallback('/shop/qas/my', 'qa_id', '__g5_static__', '[0-9]+'),
  ...fallbackPair({
    source: '/shop/list-:ca_id',
    destination: '/shop/categories/__g5_static__',
    txtSource: '/shop/list-:ca_id([0-9A-Za-z]+)',
  }),
  ...fallbackPair({
    source: '/shop/type-:type',
    destination: '/shop/products',
    txtSource: '/shop/type-:type([1-5])',
  }),
  ...fallbackPair({
    source: `/shop/${VERCEL_SHORT_SHOP_PRODUCT_PATTERN}`,
    destination: '/shop/products/__g5_static__',
  }),
  ...fallbackPair({
    source: `/${VERCEL_SHORT_BOARD_ROOT_PATTERN}/write`,
    destination: '/boards/__g5_static__/write',
  }),
  ...fallbackPair({
    source: `/${VERCEL_SHORT_BOARD_ROOT_PATTERN}/:wr_id([0-9]+)`,
    destination: '/boards/__g5_static__/0',
  }),
  ...fallbackPair({
    source: `/${VERCEL_SHORT_BOARD_ROOT_PATTERN}/:slug([^/]+)`,
    destination: '/boards/__g5_static__/0',
  }),
  ...fallbackPair({
    source: `/${VERCEL_SHORT_BOARD_ROOT_PATTERN}`,
    destination: '/boards/__g5_static__',
  }),
];

export function shortShopServerRewrites() {
  return [
    rewrite('/shop/list-:ca_id([0-9A-Za-z]+)', '/shop/categories/:ca_id'),
    rewrite('/shop/type-:type([1-5])', '/shop/products?g5_type=:type'),
    rewrite(`/shop/${shortShopProductPattern}`, '/shop/products/:it_id'),
    rewrite(`/shop/${shortShopProductPattern}/`, '/shop/products/:it_id'),
  ];
}

export function contextualShopServerRewrites() {
  /** @param {string} key @param {string} value */
  const queryHas = (key, value) => ({
    type: /** @type {'query'} */ ('query'),
    key,
    value,
  });
  const shopPathValue = '(?<shop_path>/shop(?:/.*)?)';

  return [
    {
      source: '/login',
      has: [queryHas('redirect', shopPathValue)],
      destination: '/g5-runtime/context/login',
    },
    {
      source: '/login',
      has: [queryHas('url', shopPathValue)],
      destination: '/g5-runtime/context/login',
    },
    {
      source: '/register',
      has: [queryHas('service', 'shop')],
      destination: '/g5-runtime/context/register',
    },
    {
      source: '/mypage/qas/new',
      has: [queryHas('service', 'shop')],
      destination: '/g5-runtime/context/qas-new',
    },
    {
      source: '/mypage/qas/:qa_id([0-9]+)',
      has: [queryHas('service', 'shop')],
      destination: '/g5-runtime/context/qas-detail/:qa_id',
    },
    ...Array.from({ length: 5 }, (_, index) => {
      const type = index + 1;
      return {
        source: '/shop/products',
        has: [queryHas(`it_type${type}`, '1')],
        destination: `/g5-runtime/context/shop-type/${type}`,
      };
    }),
  ];
}

export function canonicalShopServerRedirects() {
  return [
    {
      source: `/shop/products/${shortShopProductPattern}`,
      destination: '/shop/:it_id',
      permanent: true,
    },
    {
      source: '/shop/categories/:ca_id([0-9A-Za-z]+)',
      destination: '/shop/list-:ca_id',
      permanent: true,
    },
  ];
}

export function shortBoardServerRewrites() {
  return [
    rewrite(`/${shortBoardRootPattern}/write`, '/boards/:bo_table/write'),
    rewrite(`/rss/${shortBoardRootPattern}`, '/boards/:bo_table/rss'),
    rewrite(`/${shortBoardRootPattern}/:wr_id(\\d+)`, '/boards/:bo_table/:wr_id'),
    rewrite(`/${shortBoardRootPattern}/:slug((?!rss$)[^/]+)/`, '/boards/:bo_table/:slug'),
    rewrite(`/${shortBoardRootPattern}/:slug((?!rss$)[^/]+)`, '/boards/:bo_table/:slug'),
    rewrite(`/${shortBoardRootPattern}`, '/boards/:bo_table'),
  ];
}

export const vercelStaticFallbackRewrites = vercelStaticFallbackManifest;

import { liveAppUrl, liveExpectedApiUrl } from './lib/live-env.mjs';

const appUrl = liveAppUrl('check-live-migration-sample');
const apiUrl = liveExpectedApiUrl(appUrl);
const smokeBoard = process.env.LIVE_SMOKE_BOARD_TABLE || 'free';
const smokeContentId = process.env.LIVE_SMOKE_CONTENT_ID || 'company';
const smokeProductId = process.env.LIVE_SMOKE_SHOP_PRODUCT_ID || '1446772772';
const smokeCategoryId = process.env.LIVE_SMOKE_SHOP_CATEGORY_ID || '2010101010';

const checks = [];

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function record(area, name, ok, detail, hint = '') {
  checks.push({
    area,
    name,
    status: ok ? 'ok' : 'fail',
    detail: detail || '',
    hint: ok ? '' : hint,
  });
}

function apiAbsoluteUrl(path) {
  return `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function apiJson(path) {
  const response = await fetch(apiAbsoluteUrl(path), {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    fail(`API request failed: ${path}`, {
      status: response.status,
      message: payload?.message || text.slice(0, 160) || response.statusText,
      payload,
    });
  }

  return payload;
}

function dataList(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

function flattenCategories(categories) {
  const flat = [];
  const stack = Array.isArray(categories) ? [...categories] : [];
  while (stack.length > 0) {
    const category = stack.shift();
    if (!category) continue;
    flat.push(category);
    if (Array.isArray(category.children)) {
      stack.push(...category.children);
    }
  }
  return flat;
}

async function checkMigrationSample() {
  const settings = await apiJson('/settings');
  record(
    'migration sample',
    'public settings',
    Boolean(settings.data?.cf_title),
    `title=${settings.data?.cf_title || '(missing)'}`,
    'live settings API must expose migrated Gnuboard config'
  );

  const boards = dataList(await apiJson('/boards'));
  const board = boards.find((item) => String(item.bo_table || '') === smokeBoard);
  record(
    'migration sample',
    'board list',
    Boolean(board),
    `boards=${boards.length} target=${board?.bo_table || '(missing)'}`,
    'live board list must include the representative migrated board'
  );

  const boardPosts = dataList(
    await apiJson(`/boards/${encodeURIComponent(smokeBoard)}/posts?per_page=3`)
  );
  record(
    'migration sample',
    'board posts',
    boardPosts.length > 0,
    `board=${smokeBoard} posts=${boardPosts.length}`,
    'representative board must expose migrated posts'
  );

  const recent = await apiJson('/recent?limit=5');
  const recentItems = dataList(recent);
  record(
    'migration sample',
    'recent posts',
    recentItems.length > 0 && Number(recent.data?.meta?.total || recent.meta?.total || 0) > 0,
    `items=${recentItems.length} total=${recent.data?.meta?.total ?? recent.meta?.total ?? '(missing)'}`,
    'recent/new-post data must not be empty after migration'
  );

  const content = await apiJson(`/content/${encodeURIComponent(smokeContentId)}`);
  record(
    'migration sample',
    'content page',
    String(content.data?.co_id || '') === smokeContentId && Boolean(content.data?.co_subject),
    `co_id=${content.data?.co_id || '(missing)'}`,
    'content management pages must be reachable through the API'
  );

  const products = dataList(await apiJson('/shop/products?per_page=8'));
  const productInList = products.find((item) => String(item.it_id || '') === smokeProductId);
  record(
    'migration sample',
    'product list',
    products.length > 0 && Boolean(productInList),
    `products=${products.length} target=${productInList?.it_id || '(missing)'}`,
    'YoungCart product list must include the representative migrated product'
  );

  const product = await apiJson(`/shop/products/${encodeURIComponent(smokeProductId)}`);
  record(
    'migration sample',
    'product detail',
    String(product.data?.it_id || '') === smokeProductId,
    `product=${product.data?.it_id || '(missing)'}`,
    'representative product detail must be readable'
  );

  const categoryRoots = dataList(await apiJson('/shop/categories'));
  const categories = flattenCategories(categoryRoots);
  const categoryInList = categories.find((item) => String(item.ca_id || '') === smokeCategoryId);
  record(
    'migration sample',
    'category tree',
    categories.length > 0 && Boolean(categoryInList),
    `categories=${categories.length} target=${categoryInList?.ca_id || '(missing)'}`,
    'YoungCart category tree must include the representative migrated category'
  );

  const category = await apiJson(`/shop/categories/${encodeURIComponent(smokeCategoryId)}`);
  record(
    'migration sample',
    'category detail',
    String(category.data?.category?.ca_id || '') === smokeCategoryId &&
      Array.isArray(category.data?.items),
    `category=${category.data?.category?.ca_id || '(missing)'} items=${
      category.data?.items?.length ?? '(missing)'
    }`,
    'representative category detail must expose migrated product rows'
  );
}

try {
  await checkMigrationSample();
} catch (error) {
  record(
    'migration sample',
    'unexpected error',
    false,
    error.message,
    error.details ? JSON.stringify(error.details) : ''
  );
}

console.table(
  checks.map(({ area, name, status, detail }) => ({
    area,
    check: name,
    status,
    detail,
  }))
);

const failures = checks.filter((check) => check.status === 'fail');
if (failures.length > 0) {
  console.error(`[check-live-migration-sample] ${failures.length} issue(s) found for ${appUrl}`);
  for (const failure of failures) {
    console.error(`- [${failure.area}] ${failure.name}: ${failure.detail}`);
    if (failure.hint) {
      console.error(`  hint: ${failure.hint}`);
    }
  }
  process.exit(1);
}

console.log(`[check-live-migration-sample] live migration sample passed for ${appUrl}`);

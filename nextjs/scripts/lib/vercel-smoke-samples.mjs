function encodeRouteSegment(value) {
  const trimmed = String(value || '').trim();
  try {
    return encodeURIComponent(decodeURIComponent(trimmed));
  } catch {
    return encodeURIComponent(trimmed);
  }
}

function apiAbsoluteUrl(apiUrl, path) {
  return `${apiUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function apiJson(apiUrl, path, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiAbsoluteUrl(apiUrl, path), {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || text.slice(0, 160) || response.statusText);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function dataList(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function extractPostPath(path) {
  const match = String(path || '').match(/^\/(?:boards\/)?([0-9A-Za-z_]+)\/([^/?#]+)\/?$/);
  if (!match) return null;
  return {
    boTable: decodeURIComponent(match[1]),
    wrIdOrSlug: decodeURIComponent(match[2]),
  };
}

function extractProductPath(path) {
  const match = String(path || '').match(/^\/shop\/(?:products\/)?([^/?#]+)\/?$/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

async function resolvePostFromPath(apiUrl, path, timeoutMs) {
  const parsed = extractPostPath(path);
  if (!parsed) return null;

  const isNumeric = /^[0-9]+$/.test(parsed.wrIdOrSlug);
  const endpoint = isNumeric
    ? `/posts/${encodeURIComponent(parsed.boTable)}/${encodeURIComponent(parsed.wrIdOrSlug)}`
    : `/posts/${encodeURIComponent(parsed.boTable)}/seo/${encodeURIComponent(parsed.wrIdOrSlug)}`;
  const payload = await apiJson(apiUrl, endpoint, timeoutMs);
  const post = payload?.data || payload;
  const subject = firstText(post?.wr_subject, post?.subject, post?.title);
  return subject ? { path, text: subject } : null;
}

async function resolveProductFromPath(apiUrl, path, timeoutMs) {
  const idOrSlug = extractProductPath(path);
  if (!idOrSlug) return null;

  const isNumeric = /^[0-9]+$/.test(idOrSlug);
  const endpoint = isNumeric
    ? `/shop/products/${encodeURIComponent(idOrSlug)}`
    : `/shop/products/seo/${encodeURIComponent(idOrSlug)}`;
  const payload = await apiJson(apiUrl, endpoint, timeoutMs);
  const product = payload?.data || payload;
  const name = firstText(product?.it_name, product?.name, product?.title);
  return name ? { path, text: name } : null;
}

export async function discoverPostSample(apiUrl, { env = process.env, timeoutMs = 10000 } = {}) {
  const targetBoard = firstText(env.SERVER_RUNTIME_SMOKE_BOARD_TABLE, env.LIVE_SMOKE_BOARD_TABLE);
  const boards = dataList(await apiJson(apiUrl, '/boards', timeoutMs));
  const board =
    (targetBoard && boards.find((item) => String(item?.bo_table || '') === targetBoard)) ||
    boards.find((item) => String(item?.bo_table || '').trim());

  if (!board?.bo_table) {
    throw new Error('No public board was returned from /boards.');
  }

  const boTable = String(board.bo_table);
  const posts = dataList(
    await apiJson(apiUrl, `/boards/${encodeURIComponent(boTable)}/posts?per_page=10`, timeoutMs)
  );
  const post = posts.find((item) => firstText(item?.wr_id) && firstText(item?.wr_subject));

  if (!post) {
    throw new Error(`No public post with title was returned from board ${boTable}.`);
  }

  return {
    path: `/boards/${encodeRouteSegment(boTable)}/${encodeRouteSegment(post.wr_id)}`,
    text: firstText(post.wr_subject, post.subject, post.title),
  };
}

export async function discoverProductSample(apiUrl, { env = process.env, timeoutMs = 10000 } = {}) {
  const productId = firstText(env.SERVER_RUNTIME_SMOKE_PRODUCT_ID, env.LIVE_SMOKE_SHOP_PRODUCT_ID);
  if (productId) {
    const payload = await apiJson(apiUrl, `/shop/products/${encodeURIComponent(productId)}`, timeoutMs);
    const product = payload?.data || payload;
    const name = firstText(product?.it_name, product?.name, product?.title);
    if (!name) {
      throw new Error(`Product ${productId} did not return a display name.`);
    }
    return {
      path: `/shop/${encodeRouteSegment(productId)}`,
      text: name,
    };
  }

  const products = dataList(await apiJson(apiUrl, '/shop/products?per_page=10', timeoutMs));
  const product = products.find((item) => firstText(item?.it_id) && firstText(item?.it_name));
  if (!product) {
    throw new Error('No public product with name was returned from /shop/products.');
  }

  return {
    path: `/shop/${encodeRouteSegment(product.it_id)}`,
    text: firstText(product.it_name, product.name, product.title),
  };
}

export async function resolveStrictSmokeSamples({
  apiUrl,
  requiredDetails,
  env = process.env,
  timeoutMs = 10000,
  log = () => {},
} = {}) {
  const trimmedApiUrl = String(apiUrl || '').trim();
  if (!trimmedApiUrl || !Array.isArray(requiredDetails) || requiredDetails.length === 0) return;

  const requireExplicitSmoke = truthy(env.VERCEL_RELEASE_REQUIRE_EXPLICIT_SMOKE);

  for (const detail of requiredDetails) {
    const pathName = detail === 'post' ? 'SERVER_RUNTIME_SMOKE_POST_PATH' : 'SERVER_RUNTIME_SMOKE_PRODUCT_PATH';
    const textName = detail === 'post' ? 'SERVER_RUNTIME_SMOKE_POST_TEXT' : 'SERVER_RUNTIME_SMOKE_PRODUCT_TEXT';
    const configuredPath = String(env[pathName] || '').trim();
    const configuredText = String(env[textName] || '').trim();
    if (configuredPath && configuredText) {
      log(`${detail} detail smoke sample: ${configuredPath} (configured)`);
      continue;
    }

    if (requireExplicitSmoke) {
      throw new Error(
        `Strict Vercel smoke requires configured ${pathName} and ${textName} because ` +
          'VERCEL_RELEASE_REQUIRE_EXPLICIT_SMOKE=1.'
      );
    }

    let sample = null;
    try {
      sample = configuredPath
        ? detail === 'post'
          ? await resolvePostFromPath(trimmedApiUrl, configuredPath, timeoutMs)
          : await resolveProductFromPath(trimmedApiUrl, configuredPath, timeoutMs)
        : detail === 'post'
          ? await discoverPostSample(trimmedApiUrl, { env, timeoutMs })
          : await discoverProductSample(trimmedApiUrl, { env, timeoutMs });
    } catch (error) {
      throw new Error(
        `Strict Vercel smoke could not resolve a ${detail} sample from NEXT_PUBLIC_API_URL. ` +
          `${error instanceof Error ? error.message : String(error)} ` +
          `Set ${pathName} and ${textName}, or the matching LIVE_SMOKE_* variables.`
      );
    }

    if (!sample?.path || !sample?.text) {
      throw new Error(`Strict Vercel smoke could not resolve a complete ${detail} sample.`);
    }

    env[pathName] ||= sample.path;
    env[textName] ||= sample.text;
    log(`${detail} detail smoke sample: ${env[pathName]}`);
  }
}

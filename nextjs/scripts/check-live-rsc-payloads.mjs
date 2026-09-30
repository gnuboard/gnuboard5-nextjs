import { liveAppUrl } from './lib/live-env.mjs';

const appUrl = liveAppUrl('check-live-rsc-payloads');
const rscPayloads = parseRedirects(
  process.env.LIVE_SMOKE_RSC_PAYLOADS ||
    '/index.txt=>/,/free.txt=>/free,/shop/products/1446772772.txt=>/shop/1446772772,/shop/1446772772.txt=>/shop/1446772772,/shop/list-2010101010.txt=>/shop/list-2010101010,/shop/type-1.txt=>/shop/type-1,/shop/reviews.txt=>/shop/reviews,/shop/qas.txt=>/shop/qas,/shop/search.txt=>/shop/search,/shop/largeimage.txt=>/shop/largeimage'
);

function parseCsv(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRedirects(value) {
  return parseCsv(value).map((item) => {
    const [from, to] = item.split('=>').map((part) => part?.trim());
    if (!from || !to) {
      throw new Error(`Invalid RSC payload expectation: ${item}`);
    }
    return { from, to };
  });
}

function absoluteUrl(path) {
  return `${appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'manual' });
  const text = await response.text();
  return { response, text };
}

function isRscPayload(text) {
  return text.includes('$Sreact.fragment') && !text.includes('404:') && !text.includes('NOT_FOUND');
}

const rows = [];

for (const payload of rscPayloads) {
  const url = `${absoluteUrl(payload.from)}?_rsc=live-rsc-check-${Date.now()}`;
  const { response, text } = await fetchText(url);
  const contentType = response.headers.get('content-type') || '';
  const ok =
    response.ok &&
    (contentType.includes('text/x-component') || contentType.includes('text/plain')) &&
    isRscPayload(text);

  rows.push({
    route: payload.from,
    expectedPage: payload.to,
    status: response.status,
    contentType: contentType || '(missing)',
    ok,
  });
}

console.table(rows);

const failures = rows.filter((row) => !row.ok);
if (failures.length > 0) {
  console.error(`[check-live-rsc-payloads] ${failures.length} RSC payload route(s) failed for ${appUrl}`);
  for (const failure of failures) {
    console.error(
      `- ${failure.route}: HTTP ${failure.status}, content-type=${failure.contentType}, expected RSC payload for ${failure.expectedPage}`
    );
  }
  process.exit(1);
}

console.log(`[check-live-rsc-payloads] RSC payload routes passed for ${appUrl}`);

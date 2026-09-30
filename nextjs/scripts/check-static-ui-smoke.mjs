import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './load-local-env.mjs';
import { rewriteVercelPathname } from './lib/vercel-rewrite-matcher.mjs';
import { vercelStaticFallbackRewrites } from './route-rules.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
loadLocalEnv(nextRoot);

const args = new Set(process.argv.slice(2));
const useFixtureApi =
  args.has('--fixture-api') ||
  process.env.STATIC_SMOKE_API_MODE === 'fixture' ||
  process.env.STATIC_SMOKE_FIXTURE_API === '1';
const logRequests = process.env.STATIC_SMOKE_LOG_REQUESTS === '1';
const outRoot = resolve(process.cwd(), 'out');
const tests = [
  'tests/pages.spec.ts',
  ...(process.env.STATIC_SMOKE_INCLUDE_A11Y === '0' ? [] : ['tests/a11y.spec.ts']),
];
const host = '127.0.0.1';
const apiBaseUrl = useFixtureApi ? null : normalizeApiBaseUrl(
  process.env.STATIC_SMOKE_API_URL || process.env.NEXT_PUBLIC_API_URL || ''
);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

function fail(message) {
  console.error(`[check-static-ui-smoke] ${message}`);
  process.exit(1);
}

function isInsideOutRoot(path) {
  return path === outRoot || path.startsWith(outRoot + sep);
}

function normalizePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function candidateFiles(pathname, preferRsc = false) {
  const cleanPath = normalizePathname(pathname).replace(/\/+$/, '') || '/';
  const relativePath = cleanPath.replace(/^\/+/, '');
  const base = resolve(outRoot, relativePath);
  const candidates = [];

  if (cleanPath === '/') {
    if (preferRsc) candidates.push(join(outRoot, 'index.txt'));
    candidates.push(join(outRoot, 'index.html'));
  } else {
    if (preferRsc) {
      candidates.push(`${base}.txt`);
      candidates.push(join(base, 'index.txt'));
    }
    candidates.push(base);
    candidates.push(`${base}.html`);
    candidates.push(join(base, 'index.html'));
  }

  candidates.push(join(outRoot, '404.html'));
  return candidates.filter(isInsideOutRoot);
}

function findFile(pathname, preferRsc = false) {
  for (const file of candidateFiles(pathname, preferRsc)) {
    if (!existsSync(file)) continue;
    const stats = statSync(file);
    if (stats.isFile()) return file;
  }

  return null;
}

function isNotFoundFile(file) {
  return file?.endsWith(`${sep}404.html`) ?? false;
}

function resolveStaticFile(pathname, preferRsc = false) {
  const directFile = findFile(pathname, preferRsc);
  if (directFile && !isNotFoundFile(directFile)) {
    return { file: directFile, rewrittenPathname: null };
  }

  const rewrittenPathname = rewriteVercelPathname(pathname, vercelStaticFallbackRewrites);
  if (rewrittenPathname) {
    const rewrittenFile = findFile(rewrittenPathname, preferRsc);
    if (rewrittenFile && !isNotFoundFile(rewrittenFile)) {
      return { file: rewrittenFile, rewrittenPathname };
    }
  }

  return { file: directFile, rewrittenPathname: null };
}

function injectSmokeRuntimeConfig(html) {
  if (!apiBaseUrl && !useFixtureApi) return html;

  const configScript = [
    '<script>',
    'window.__G5_APP_CONFIG__=Object.assign(window.__G5_APP_CONFIG__||{},{"apiBaseUrl":"/api/v1"});',
    'window.__G5_NEXTJS25_CONFIG__=window.__G5_APP_CONFIG__;',
    '</script>',
  ].join('');
  if (/<head([^>]*)>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${configScript}`);
  }

  return `${configScript}\n${html}`;
}

function serveFile(file, response, statusCode = 200) {
  const contentType = contentTypes.get(extname(file)) || 'application/octet-stream';
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });

  if (extname(file) === '.html') {
    response.end(injectSmokeRuntimeConfig(readFileSync(file, 'utf8')));
    return;
  }

  createReadStream(file).pipe(response);
}

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function isApiProxyPath(pathname) {
  return (useFixtureApi || apiBaseUrl) && (pathname === '/api/v1' || pathname.startsWith('/api/v1/'));
}

function isRscRequest(request, sourceUrl) {
  return (
    sourceUrl.searchParams.has('_rsc') ||
    request.headers.rsc === '1' ||
    String(request.headers.accept || '').includes('text/x-component')
  );
}

function emptyMeta() {
  return {
    total: 0,
    current_page: 1,
    per_page: 20,
    last_page: 1,
    from: null,
    to: null,
  };
}

function fixtureDataFor(pathname) {
  const path = pathname.replace(/^\/api\/v1/, '') || '/';

  if (path === '/auth/me') {
    return { member: null, is_super_admin: false };
  }
  if (path === '/auth/social/providers') {
    return { enabled: false, providers: [] };
  }
  if (path === '/auth/cert/config') {
    return {
      enabled: false,
      mode: 0,
      required: false,
      find_enabled: false,
      simple: '',
      hp: '',
      ipin: '',
      use_hp: false,
      require_hp: false,
    };
  }
  if (path === '/cart') {
    return { items: [], total_price: 0, total_qty: 0, send_cost: 0, shipping_cost: 0 };
  }
  if (path === '/shop/policy') {
    return {
      delivery_company: '',
      send_cost_case: '',
      send_cost_limit: '',
      send_cost_list: '',
      shipping_rules: [],
      base_shipping_cost: 0,
      free_threshold: 0,
      delivery_content: '',
      delivery_content_text: '',
      exchange_content: '',
      exchange_content_text: '',
    };
  }
  if (path === '/shop/payment/config') {
    return {
      pg_service: 'toss',
      client: {},
      payment_methods: {
        card: false,
        vbank: false,
        bank: true,
        iche: false,
        hp: false,
        easy_pay: false,
        kakaopay: false,
      },
      easy_pay_services: [],
      bank_accounts: ['Fixture Bank 000-0000-0000'],
      is_test_mode: true,
    };
  }
  if (
    /\/(?:menus|boards|posts|comments|categories|products|events|reviews|qas|polls|recent|search|members|orders|memos|points|scraps|coupons|wishlist|personalpay)(?:\/|$)/.test(path) ||
    path === '/menus' ||
    path === '/boards' ||
    path === '/shop'
  ) {
    return [];
  }

  return {};
}

function writeFixtureApiResponse(request, response, sourceUrl) {
  const status = request.method === 'HEAD' ? 204 : 200;
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  response.end(JSON.stringify({
    success: true,
    data: fixtureDataFor(sourceUrl.pathname),
    meta: emptyMeta(),
  }));
}

function proxyHeaders(request, target) {
  const headers = { ...request.headers };
  delete headers.connection;
  delete headers.host;
  delete headers['keep-alive'];
  delete headers['proxy-authorization'];
  delete headers['proxy-connection'];
  delete headers['te'];
  delete headers.trailer;
  delete headers['transfer-encoding'];
  delete headers.upgrade;

  headers.host = target.host;
  headers['x-forwarded-host'] = request.headers.host || `${host}`;
  headers['x-forwarded-proto'] = 'http';

  return headers;
}

function responseHeaders(headers) {
  const result = { ...headers };
  delete result['content-encoding'];
  delete result['content-length'];
  delete result.connection;
  delete result['keep-alive'];
  delete result['proxy-authenticate'];
  delete result['proxy-authorization'];
  delete result['te'];
  delete result.trailer;
  delete result['transfer-encoding'];
  delete result.upgrade;

  return result;
}

function proxyApiRequest(request, response, sourceUrl) {
  const target = new URL(apiBaseUrl.href);
  const suffix = sourceUrl.pathname === '/api/v1' ? '' : sourceUrl.pathname.slice('/api/v1'.length);
  target.pathname = `${target.pathname.replace(/\/+$/, '')}${suffix}`;
  target.search = sourceUrl.search;

  const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const proxy = transport(
    target,
    {
      method: request.method,
      headers: proxyHeaders(request, target),
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, responseHeaders(proxyResponse.headers));
      proxyResponse.pipe(response);
    }
  );

  proxy.once('error', (error) => {
    response.writeHead(502, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({ error: 'static_smoke_api_proxy_failed', message: error.message }));
  });

  request.pipe(proxy);
}

function createStaticServer() {
  if (!existsSync(join(outRoot, 'index.html'))) {
    fail('out/index.html is missing. Run npm run build:vercel before static UI smoke.');
  }

  return createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${host}`);
    if (isApiProxyPath(url.pathname)) {
      if (useFixtureApi) {
        writeFixtureApiResponse(request, response, url);
        return;
      }
      proxyApiRequest(request, response, url);
      return;
    }

    const rscRequest = isRscRequest(request, url);
    const { file, rewrittenPathname } = resolveStaticFile(url.pathname, rscRequest);

    if (!file) {
      if (logRequests) {
        console.log(`[check-static-ui-smoke] 404 ${request.method} ${url.pathname}${url.search}`);
      }
      response.writeHead(404, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('Not found');
      return;
    }

    const statusCode = isNotFoundFile(file) && url.pathname !== '/404' ? 404 : 200;
    if (logRequests) {
      const rewriteLabel = rewrittenPathname ? ` (rewrite ${rewrittenPathname})` : '';
      console.log(
        `[check-static-ui-smoke] ${statusCode} ${request.method} ${url.pathname}${url.search} -> ${file.replace(outRoot, 'out')}${rewriteLabel}${rscRequest ? ' (rsc)' : ''}`
      );
    }
    serveFile(file, response, statusCode);
  });
}

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('static server did not return a TCP address'));
        return;
      }
      resolvePromise(`http://${host}:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
}

function runPlaywright(appUrl) {
  return new Promise((resolvePromise, reject) => {
    console.log(`[check-static-ui-smoke] app=${appUrl}`);
    if (apiBaseUrl) {
      console.log(`[check-static-ui-smoke] proxy /api/v1 -> ${apiBaseUrl.href}`);
    } else if (useFixtureApi) {
      console.log('[check-static-ui-smoke] proxy /api/v1 -> fixture API');
    } else {
      console.log('[check-static-ui-smoke] proxy /api/v1 disabled; set NEXT_PUBLIC_API_URL or STATIC_SMOKE_API_URL');
    }

    const child = spawn('npx', ['playwright', 'test', ...tests], {
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: appUrl,
      },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`playwright static UI smoke failed with ${reason}`));
    });
  });
}

const server = createStaticServer();
const appUrl = await listen(server);

try {
  await runPlaywright(appUrl);
  console.log('\n[check-static-ui-smoke] static UI smoke passed');
} finally {
  await close(server);
}

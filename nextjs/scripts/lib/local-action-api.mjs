import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

export function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

export function printFailure(error, prefix = 'local-action-api') {
  console.error(`[${prefix}] ${error.message}`);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
}

export function createCookieJar() {
  const cookies = new Map();

  return {
    header() {
      return Array.from(cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    },
    store(headers) {
      const values =
        typeof headers.getSetCookie === 'function'
          ? headers.getSetCookie()
          : headers.get('set-cookie')
            ? [headers.get('set-cookie')]
            : [];

      for (const value of values) {
        for (const part of String(value).split(/,(?=[^;=]+=[^;]+)/)) {
          const cookie = part.trim().split(';')[0] || '';
          const separator = cookie.indexOf('=');
          if (separator > 0) {
            cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
          }
        }
      }
    },
  };
}

export function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function assertOkResponse(response, label) {
  if (!response.ok()) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // Body may be unavailable after navigation; status and URL still identify the failure.
    }
    fail(`${label} response failed`, {
      status: response.status(),
      url: response.url(),
      body,
    });
  }
}

export function createLocalActionApi({
  expectedApiUrl,
  smokeMemberId,
  smokeMemberPassword,
  smokeMarker,
  phpEnv = {},
  failFn = fail,
} = {}) {
  if (!expectedApiUrl) {
    failFn('createLocalActionApi requires expectedApiUrl');
  }

  function runPhp(script, env = {}, args = []) {
    const scriptPath = fileURLToPath(new URL(`../../../scripts/${script}`, import.meta.url));
    const result = spawnSync('php', [scriptPath, '--json', ...args], {
      env: {
        ...process.env,
        LOCAL_SMOKE_LOGIN_ID: smokeMemberId,
        LOCAL_SMOKE_LOGIN_PASSWORD: smokeMemberPassword,
        LOCAL_SMOKE_ORDER_MARKER: smokeMarker,
        ...phpEnv,
        ...env,
      },
      encoding: 'utf8',
      windowsHide: true,
    });

    if (result.error) {
      failFn(`failed to run ${script}: ${result.error.message}`);
    }

    if (result.status !== 0) {
      failFn(`${script} failed`, {
        status: result.status,
        stderr: result.stderr.trim(),
        stdout: result.stdout.trim(),
      });
    }

    try {
      const payload = JSON.parse(result.stdout.trim());
      if (!payload?.success) {
        failFn(`${script} did not return success`, payload);
      }
      return payload;
    } catch {
      failFn(`${script} returned invalid JSON`, {
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      });
    }
  }

  async function fetchApi(path, options = {}) {
    const { cookieJar, ...fetchOptions } = options;
    const cookieHeader = cookieJar?.header?.();
    const response = await fetch(`${expectedApiUrl}${path}`, {
      ...fetchOptions,
      headers: {
        Accept: 'application/json',
        ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(fetchOptions.headers || {}),
      },
    });
    cookieJar?.store?.(response.headers);

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // no JSON body, e.g. 204
    }

    return { response, payload };
  }

  async function apiJson(path, options = {}) {
    const { response, payload } = await fetchApi(path, options);

    if (!response.ok || !payload?.success) {
      failFn(`API request failed: ${path}`, {
        status: response.status,
        message: payload?.message || response.statusText,
        payload,
      });
    }

    return payload;
  }

  async function apiOk(path, options = {}) {
    const { response, payload } = await fetchApi(path, options);
    if (!response.ok || (response.status !== 204 && payload && payload.success === false)) {
      failFn(`API request failed: ${path}`, {
        status: response.status,
        message: payload?.message || response.statusText,
        payload,
      });
    }
    return payload;
  }

  async function apiFailure(path, options = {}, expectedStatus = 400) {
    const { response, payload } = await fetchApi(path, options);
    if (response.status !== expectedStatus || payload?.success !== false) {
      failFn(`API request should have failed: ${path}`, {
        expectedStatus,
        status: response.status,
        message: payload?.message || response.statusText,
        payload,
      });
    }
    return payload;
  }

  async function expectApiStatus(path, expectedStatus, options = {}, label = path) {
    const { response, payload } = await fetchApi(path, options);
    if (response.status !== expectedStatus) {
      failFn(`${label} status mismatch`, {
        expectedStatus,
        actualStatus: response.status,
        payload,
      });
    }
    return payload;
  }

  async function login() {
    const payload = await apiJson('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ mb_id: smokeMemberId, mb_password: smokeMemberPassword }),
    });
    const token = payload.data?.token;
    const refreshToken = payload.data?.refresh_token;
    if (!token) {
      failFn('smoke member login did not return a token');
    }
    return { token, refreshToken };
  }

  return {
    apiFailure,
    apiJson,
    apiOk,
    expectApiStatus,
    fetchApi,
    login,
    runPhp,
  };
}

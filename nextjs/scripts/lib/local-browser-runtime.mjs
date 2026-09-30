export function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

export function normalizePath(value) {
  return value.startsWith('/') ? value : `/${value}`;
}

export function sameUrlWithoutTrailingSlash(actual, expected) {
  return trimTrailingSlash(actual) === trimTrailingSlash(expected);
}

export function waitForUrlWithoutTrailingSlash(page, expected, options) {
  return page.waitForURL(
    (currentUrl) => sameUrlWithoutTrailingSlash(currentUrl.href, expected),
    options
  );
}

export function sameUrlAllowingQueryStripping(actual, expected) {
  if (sameUrlWithoutTrailingSlash(actual, expected)) return true;

  try {
    const actualUrl = new URL(actual);
    const expectedUrl = new URL(expected);
    return (
      actualUrl.origin === expectedUrl.origin &&
      trimTrailingSlash(actualUrl.pathname) === trimTrailingSlash(expectedUrl.pathname) &&
      !actualUrl.search &&
      Boolean(expectedUrl.search)
    );
  } catch {
    return false;
  }
}

export function createLocalBrowserRuntimeHelpers({ appUrl, expectedApiUrl }) {
  function isExternalContentAssetFailure(request) {
    if (request.method !== 'GET') {
      return false;
    }

    try {
      const requestUrl = new URL(request.url);
      const appOrigin = new URL(appUrl).origin;
      const apiOrigin = new URL(expectedApiUrl).origin;

      if (requestUrl.origin === appOrigin || requestUrl.origin === apiOrigin) {
        return false;
      }

      if (['image', 'media', 'font'].includes(request.resourceType || '')) {
        return true;
      }

      return /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?|ttf|otf)$/i.test(requestUrl.pathname);
    } catch {
      return false;
    }
  }

  function isIgnorableFailedRequest(request, check) {
    if (isExternalContentAssetFailure(request)) {
      return true;
    }

    if (!request.errorText.includes('ERR_ABORTED')) {
      return false;
    }

    if (check.expectedFinalPath) {
      return true;
    }

    if (request.method === 'HEAD' && request.url.startsWith(`${appUrl}/`)) {
      return true;
    }

    if (request.method !== 'GET' || !request.url.startsWith(`${appUrl}/`)) {
      return false;
    }

    try {
      const url = new URL(request.url);
      return request.resourceType === 'fetch' && url.searchParams.has('_rsc');
    } catch {
      return false;
    }
  }

  function isAllowedBadResponse(value, check) {
    return (check.allowedBadResponses || []).some((allowed) => value.includes(allowed));
  }

  function isIgnorableConsoleError(value, check, badResponses, failedRequests) {
    if (!String(value).includes('Failed to load resource')) {
      return false;
    }

    const actionableBadResponses = badResponses.filter(
      (item) => !isAllowedBadResponse(item, check)
    );
    const actionableFailedRequests = failedRequests.filter(
      (request) => !isIgnorableFailedRequest(request, check)
    );

    return (
      (badResponses.length > 0 && actionableBadResponses.length === 0) ||
      (failedRequests.length > 0 && actionableFailedRequests.length === 0)
    );
  }

  function browserRuntimeProblems(result) {
    const { check, consoleErrors, pageErrors, failedRequests, badResponses } = result;
    const actionableFailedRequests = failedRequests.filter(
      (request) => !isIgnorableFailedRequest(request, check)
    );
    const actionableBadResponses = badResponses.filter(
      (response) => !isAllowedBadResponse(response, check)
    );
    const actionableConsoleErrors = consoleErrors.filter(
      (error) => !isIgnorableConsoleError(error, check, badResponses, failedRequests)
    );

    return {
      consoleErrors: actionableConsoleErrors,
      pageErrors,
      failedRequests: actionableFailedRequests,
      badResponses: actionableBadResponses,
    };
  }

  function isRetryableHydrationResult(result) {
    const problems = browserRuntimeProblems(result);
    const messages = [...problems.pageErrors, ...problems.consoleErrors].join('\n');
    return /Hydration failed|Minified React error #(418|423|425)/i.test(messages);
  }

  return { browserRuntimeProblems, isRetryableHydrationResult };
}

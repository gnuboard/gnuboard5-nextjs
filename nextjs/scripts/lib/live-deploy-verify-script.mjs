export function createServerVerifyScript({ themeName }) {
  const THEME_NAME = themeName;
  return `#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="\${WEB_ROOT:-}"
NGINX_SNIPPETS_DIR="\${NGINX_SNIPPETS_DIR:-/etc/nginx/snippets}"
NGINX_DUMP_COMMAND="\${NGINX_DUMP_COMMAND:-nginx -T}"
SKIP_NGINX_DUMP="\${SKIP_NGINX_DUMP:-0}"
SKIP_NGINX_TEST="\${SKIP_NGINX_TEST:-0}"
NGINX_TEST_COMMAND="\${NGINX_TEST_COMMAND:-nginx -t}"
SKIP_PHP_THEME_CHECK="\${SKIP_PHP_THEME_CHECK:-0}"
PHP_BIN="\${PHP_BIN:-php}"
PHP_WEB_ROOT="\${PHP_WEB_ROOT:-}"

if [ -z "$PHP_WEB_ROOT" ]; then
  PHP_WEB_ROOT="$WEB_ROOT"
  if [[ "$PHP_BIN" == *.exe && "$WEB_ROOT" =~ ^/mnt/([A-Za-z])/(.*)$ ]]; then
    PHP_WEB_ROOT="\${BASH_REMATCH[1]^^}:/\${BASH_REMATCH[2]}"
  fi
fi

failures=0
warnings=0
CONFIG_DUMP=""

log() {
  printf '[server-verify] %s\\n' "$*"
}

ok() {
  printf '[server-verify] ok: %s\\n' "$*"
}

warn() {
  warnings=$((warnings + 1))
  printf '[server-verify] warn: %s\\n' "$*" >&2
}

fail() {
  failures=$((failures + 1))
  printf '[server-verify] fail: %s\\n' "$*" >&2
}

make_temp_output() {
  local label="$1"
  local tmp_base=""
  tmp_base="$(printenv TMPDIR 2>/dev/null || true)"
  [ -n "$tmp_base" ] || tmp_base="/tmp"

  if mktemp "$tmp_base/g5-${THEME_NAME}-$label.XXXXXX" 2>/dev/null; then
    return 0
  fi

  mktemp "$PACKAGE_DIR/.g5-${THEME_NAME}-$label.XXXXXX"
}

check_file() {
  if [ -f "$1" ]; then
    ok "$2"
  else
    fail "$2 missing: $1"
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    ok "$2"
  else
    fail "$2 missing: $1"
  fi
}

check_symlink_target() {
  local link="$1"
  local expected="$2"
  local label="$3"

  if [ ! -L "$link" ]; then
    fail "$label missing symlink: $link"
    return
  fi

  local target=""
  target="$(readlink "$link")"
  if [ "$target" = "$expected" ] || [ "$target" = "$WEB_ROOT/theme/$expected" ]; then
    ok "$label"
  else
    fail "$label points to $target, expected $expected"
  fi
}

check_contains() {
  if [ -f "$1" ] && grep -Fq "$2" "$1"; then
    ok "$3"
  else
    fail "$3 missing marker: $2"
  fi
}

check_loaded_config() {
  if [ -z "$CONFIG_DUMP" ]; then
    warn "Skipping loaded nginx config check for $1 because nginx -T output is unavailable."
    return
  fi

  if grep -Fq "$1" "$CONFIG_DUMP"; then
    ok "$2"
  else
    fail "$2 not found in loaded nginx config: $1"
  fi
}

[ -n "$WEB_ROOT" ] || {
  fail "Set WEB_ROOT to the live Gnuboard document root."
  printf '[server-verify] summary: %s failure(s), %s warning(s)\\n' "$failures" "$warnings"
  exit 1
}

log "Web root: $WEB_ROOT"
log "Nginx snippets: $NGINX_SNIPPETS_DIR"

if [ -f "$PACKAGE_DIR/CHECKSUMS.sha256" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    CHECKSUM_OUTPUT=""
    TMP_BASE="$(printenv TMPDIR 2>/dev/null || true)"
    [ -n "$TMP_BASE" ] || TMP_BASE="/tmp"
    if CHECKSUM_OUTPUT="$(mktemp "$TMP_BASE/g5-${THEME_NAME}-checksums.XXXXXX" 2>/dev/null)"; then
      :
    else
      CHECKSUM_OUTPUT="$PACKAGE_DIR/.g5-${THEME_NAME}-checksums.$$"
    fi
    if (cd "$PACKAGE_DIR" && sha256sum -c CHECKSUMS.sha256 >"$CHECKSUM_OUTPUT" 2>&1); then
      rm -f "$CHECKSUM_OUTPUT"
      ok "package checksums"
    else
      fail "package checksum verification failed; see $CHECKSUM_OUTPUT"
    fi
  else
    warn "sha256sum command not found; skipping package checksum verification"
  fi
else
  warn "CHECKSUMS.sha256 is missing from package"
fi

check_file "$WEB_ROOT/common.php" "Gnuboard common.php"
check_dir "$WEB_ROOT/api" "Next.js API bridge directory"
check_file "$WEB_ROOT/api/index.php" "Next.js API front controller"
check_file "$WEB_ROOT/api/v1/settings.php" "Next.js settings API"
check_file "$WEB_ROOT/api/v1/shop/router.php" "Youngcart shop API router"
check_file "$WEB_ROOT/api/v1/shop/products.php" "Youngcart products API"
check_file "$WEB_ROOT/api/v1/shop/reviews.php" "Youngcart reviews API"
check_file "$WEB_ROOT/api/v1/shop/policy.php" "Youngcart policy API"
check_file "$WEB_ROOT/api/v1/shop/shipping.php" "Youngcart shipping API"
check_file "$WEB_ROOT/api/social/_bridge_common.php" "Next.js social bridge common"
check_file "$WEB_ROOT/plugin/social/includes/functions.php" "Gnuboard social plugin functions"
check_file "$WEB_ROOT/plugin/webapp/bridge/runtime.php" "Next.js runtime extend loader"
check_file "$WEB_ROOT/plugin/webapp/bridge/social.php" "Next.js social extend loader"
check_contains "$WEB_ROOT/plugin/social/includes/functions.php" "social_login_linked_provider_before_member_check" "social linked provider hook"
check_contains "$WEB_ROOT/plugin/social/includes/functions.php" "social_login_existing_member_before_link_prompt" "social existing member hook"
check_dir "$WEB_ROOT/theme" "Gnuboard theme directory"
check_dir "$WEB_ROOT/theme/${THEME_NAME}" "${THEME_NAME} theme directory"
check_symlink_target "$WEB_ROOT/theme/active" "${THEME_NAME}" "active theme symlink"
check_file "$WEB_ROOT/theme/${THEME_NAME}/route.php" "${THEME_NAME} route bridge"
check_file "$WEB_ROOT/theme/${THEME_NAME}/bridge/app-shell.php" "${THEME_NAME} app shell bridge"
check_file "$WEB_ROOT/theme/${THEME_NAME}/bridge/asset-responses.php" "${THEME_NAME} asset response bridge"
check_file "$WEB_ROOT/theme/${THEME_NAME}/bridge/legacy-routes.php" "${THEME_NAME} legacy route bridge"
check_file "$WEB_ROOT/theme/${THEME_NAME}/bridge/metadata.php" "${THEME_NAME} metadata bridge"
check_file "$WEB_ROOT/theme/${THEME_NAME}/bridge/render.php" "${THEME_NAME} render bridge"
check_file "$WEB_ROOT/theme/${THEME_NAME}/app/index.html" "${THEME_NAME} static index"
check_file "$WEB_ROOT/theme/${THEME_NAME}/app/manifest.webmanifest" "${THEME_NAME} manifest"
check_file "$WEB_ROOT/theme/${THEME_NAME}/app/robots.txt" "${THEME_NAME} robots"
check_file "$WEB_ROOT/theme/${THEME_NAME}/app/sitemap.xml" "${THEME_NAME} sitemap"
check_file "$WEB_ROOT/theme/${THEME_NAME}/app/sitemap-posts.xml" "${THEME_NAME} posts sitemap"
check_file "$WEB_ROOT/theme/${THEME_NAME}/app/sw.js" "${THEME_NAME} service worker"
check_dir "$WEB_ROOT/theme/${THEME_NAME}/app/_next" "Next.js runtime chunks"
check_contains "$WEB_ROOT/theme/${THEME_NAME}/bridge/app-shell.php" "/render.php" "render bridge loader"
check_contains "$WEB_ROOT/theme/${THEME_NAME}/bridge/render.php" "window.__G5_APP_CONFIG__" "runtime config injector"

check_file "$NGINX_SNIPPETS_DIR/g5-${THEME_NAME}-security-map.conf" "nginx compatibility map snippet"
check_file "$NGINX_SNIPPETS_DIR/g5-${THEME_NAME}-security-headers.conf" "nginx frontend security snippet"
check_file "$NGINX_SNIPPETS_DIR/g5-${THEME_NAME}-api-security-headers.conf" "nginx API security snippet"
check_file "$NGINX_SNIPPETS_DIR/g5-${THEME_NAME}-theme-locations.conf" "nginx theme locations snippet"

if [ "$SKIP_NGINX_TEST" != "1" ]; then
  NGINX_TEST_OUTPUT="$(make_temp_output nginx-test)"
  if sh -c "$NGINX_TEST_COMMAND" >"$NGINX_TEST_OUTPUT" 2>&1; then
    rm -f "$NGINX_TEST_OUTPUT"
    ok "nginx syntax test"
  else
    fail "nginx syntax test failed; see $NGINX_TEST_OUTPUT"
  fi
fi

if [ "$SKIP_NGINX_DUMP" != "1" ]; then
  CONFIG_DUMP="$(make_temp_output nginx-dump)"
  NGINX_DUMP_ERROR="$(make_temp_output nginx-dump-err)"
  if sh -c "$NGINX_DUMP_COMMAND" >"$CONFIG_DUMP" 2>"$NGINX_DUMP_ERROR"; then
    rm -f "$NGINX_DUMP_ERROR"
    ok "nginx loaded config dump"
  else
    warn "nginx config dump failed; see $NGINX_DUMP_ERROR"
    rm -f "$CONFIG_DUMP"
    CONFIG_DUMP=""
  fi
fi

check_loaded_config "g5-${THEME_NAME}-security-map.conf" "loaded compatibility map include"
check_loaded_config "g5-${THEME_NAME}-theme-locations.conf" "loaded theme locations include"
check_loaded_config "g5-${THEME_NAME}-api-security-headers.conf" "loaded API security include"
check_loaded_config "location = /theme/${THEME_NAME}/route.php" "loaded exact route.php PHP location"
check_loaded_config "location = /api/index.php" "loaded exact API index PHP location"

if [ "$SKIP_PHP_THEME_CHECK" != "1" ]; then
  if command -v "$PHP_BIN" >/dev/null 2>&1; then
    active_theme="$(WEB_ROOT="$WEB_ROOT" PHP_WEB_ROOT="$PHP_WEB_ROOT" "$PHP_BIN" -d display_errors=stderr <<'PHP'
<?php
ob_start();
$webRoot = getenv('PHP_WEB_ROOT') ?: (getenv('WEB_ROOT') ?: '');
if (!chdir($webRoot)) {
    fwrite(STDERR, "[server-verify] ERROR: Cannot enter WEB_ROOT.\\n");
    exit(1);
}
$_SERVER['SERVER_NAME'] = $_SERVER['SERVER_NAME'] ?? 'localhost';
$_SERVER['HTTP_HOST'] = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'];
$_SERVER['SERVER_PORT'] = $_SERVER['SERVER_PORT'] ?? '80';
$_SERVER['REQUEST_URI'] = $_SERVER['REQUEST_URI'] ?? '/';
$_SERVER['REQUEST_METHOD'] = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$_SERVER['REMOTE_ADDR'] = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
include './common.php';
ob_end_clean();
global $config;
echo isset($config['cf_theme']) ? $config['cf_theme'] : '';
PHP
)"
    if [ "$active_theme" = "${THEME_NAME}" ]; then
      ok "Gnuboard active theme is ${THEME_NAME}"
    else
      fail "Gnuboard active theme is '$active_theme', expected '${THEME_NAME}'"
    fi
  else
    warn "PHP_BIN command not found; skipping active theme check: $PHP_BIN"
  fi
fi

if [ -n "$CONFIG_DUMP" ]; then
  rm -f "$CONFIG_DUMP"
fi

printf '[server-verify] summary: %s failure(s), %s warning(s)\\n' "$failures" "$warnings"

if [ "$failures" -gt 0 ]; then
  exit 1
fi
`;
}

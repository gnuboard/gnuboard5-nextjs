function bashLiteral(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function createServerRootApplyScript({ themeName, liveDefaultSiteConf }) {
  const THEME_NAME = themeName;
  return `#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="\${WEB_ROOT:-}"
NGINX_CONF="\${NGINX_CONF:-/etc/nginx/nginx.conf}"
SITE_CONF="\${SITE_CONF:-${bashLiteral(liveDefaultSiteConf)}}"
NGINX_SNIPPETS_DIR="\${NGINX_SNIPPETS_DIR:-/etc/nginx/snippets}"
DRY_RUN="\${DRY_RUN:-1}"
THEME="\${THEME:-${THEME_NAME}}"
PHP_BIN="\${PHP_BIN:-php}"
PHP_WEB_ROOT="\${PHP_WEB_ROOT:-}"
SKIP_NGINX_TEST="\${SKIP_NGINX_TEST:-0}"
SKIP_NGINX_RELOAD="\${SKIP_NGINX_RELOAD:-0}"
SKIP_NGINX_DUMP="\${SKIP_NGINX_DUMP:-0}"
SKIP_PHP_THEME_CHECK="\${SKIP_PHP_THEME_CHECK:-0}"
SKIP_NGINX_PLAN="\${SKIP_NGINX_PLAN:-0}"
SKIP_NGINX_INSTALL="\${SKIP_NGINX_INSTALL:-0}"
SKIP_API_INSTALL="\${SKIP_API_INSTALL:-0}"
SKIP_ROOT_PATCH_INSTALL="\${SKIP_ROOT_PATCH_INSTALL:-0}"
NGINX_TEST_COMMAND="\${NGINX_TEST_COMMAND:-nginx -t}"
NGINX_RELOAD_COMMAND="\${NGINX_RELOAD_COMMAND:-systemctl reload nginx}"
ACTIVATE_THEME="\${ACTIVATE_THEME:-}"
RUN_VERIFY="\${RUN_VERIFY:-}"
RESTORE_CONFIG_ON_TEST_FAIL="\${RESTORE_CONFIG_ON_TEST_FAIL:-1}"

if [ -z "$ACTIVATE_THEME" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    ACTIVATE_THEME="0"
  else
    ACTIVATE_THEME="1"
  fi
fi

if [ -z "$RUN_VERIFY" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    RUN_VERIFY="0"
  else
    RUN_VERIFY="1"
  fi
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
CONFIG_BACKUP_DIR="\${CONFIG_BACKUP_DIR:-$PACKAGE_DIR/backups/nginx-$TIMESTAMP}"
NGINX_CONF_BACKUP=""
SITE_CONF_BACKUP=""

log() {
  printf '[server-root-apply] %s\\n' "$*"
}

die() {
  printf '[server-root-apply] ERROR: %s\\n' "$*" >&2
  exit 1
}

run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '[server-root-apply] dry-run:'
    printf ' %q' "$@"
    printf '\\n'
  else
    "$@"
  fi
}

run_shell() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '[server-root-apply] dry-run: %s\\n' "$*"
  else
    sh -c "$*"
  fi
}

resolve_file() {
  path="$1"
  if command -v readlink >/dev/null 2>&1; then
    readlink -f "$path" 2>/dev/null || printf '%s\\n' "$path"
  else
    printf '%s\\n' "$path"
  fi
}

backup_config() {
  file="$1"
  label="$2"
  backup="$CONFIG_BACKUP_DIR/$label"

  if [ "$DRY_RUN" = "1" ]; then
    log "Would back up $file to $backup"
    return
  fi

  mkdir -p "$CONFIG_BACKUP_DIR"
  cp -a "$file" "$backup"

  if [ "$label" = "nginx.conf" ]; then
    NGINX_CONF_BACKUP="$backup"
  else
    SITE_CONF_BACKUP="$backup"
  fi

  log "Backed up $file to $backup"
}

restore_config_backups() {
  if [ "$RESTORE_CONFIG_ON_TEST_FAIL" != "1" ]; then
    return
  fi

  if [ -n "$NGINX_CONF_BACKUP" ] && [ -f "$NGINX_CONF_BACKUP" ]; then
    cp -a "$NGINX_CONF_BACKUP" "$NGINX_CONF_REAL"
    log "Restored nginx config from $NGINX_CONF_BACKUP"
  fi

  if [ -n "$SITE_CONF_BACKUP" ] && [ -f "$SITE_CONF_BACKUP" ]; then
    cp -a "$SITE_CONF_BACKUP" "$SITE_CONF_REAL"
    log "Restored site config from $SITE_CONF_BACKUP"
  fi
}

ensure_http_include() {
  include_line="include $NGINX_SNIPPETS_DIR/g5-${THEME_NAME}-security-map.conf;"

  if grep -Fq "$include_line" "$NGINX_CONF_REAL"; then
    log "nginx http include already present: $include_line"
    return
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "Would add nginx http include after the http { line: $include_line"
    return
  fi

  backup_config "$NGINX_CONF_REAL" "nginx.conf"
  tmp_file="$(mktemp)"

  if ! awk -v inc="$include_line" '
    !done && $0 ~ /^[[:space:]]*http[[:space:]]*\\{/ {
      print
      match($0, /^[[:space:]]*/)
      print substr($0, RSTART, RLENGTH) "    " inc
      done = 1
      next
    }
    { print }
    END { if (!done) exit 42 }
  ' "$NGINX_CONF_REAL" > "$tmp_file"; then
    rm -f "$tmp_file"
    die "Could not find an http { block in $NGINX_CONF_REAL"
  fi

  cat "$tmp_file" > "$NGINX_CONF_REAL"
  rm -f "$tmp_file"
  log "Added nginx http include: $include_line"
}

ensure_site_includes() {
  theme_include="include $NGINX_SNIPPETS_DIR/g5-${THEME_NAME}-theme-locations.conf;"
  exact_include="include $NGINX_SNIPPETS_DIR/g5-${THEME_NAME}-exact-php-locations.conf;"
  need_theme="0"
  need_exact="0"

  grep -Fq "$theme_include" "$SITE_CONF_REAL" || need_theme="1"
  grep -Fq "$exact_include" "$SITE_CONF_REAL" || need_exact="1"

  if [ "$need_theme" = "0" ] && [ "$need_exact" = "0" ]; then
    log "site server includes already present."
    return
  fi

  if [ "$DRY_RUN" = "1" ]; then
    if [ "$need_theme" = "1" ]; then
      log "Would add site include before the generic location / block: $theme_include"
    fi
    if [ "$need_exact" = "1" ]; then
      log "Would add site include before the generic location / block: $exact_include"
    fi
    return
  fi

  backup_config "$SITE_CONF_REAL" "site.conf"
  tmp_file="$(mktemp)"

  if ! awk -v inc1="$theme_include" -v inc2="$exact_include" -v need1="$need_theme" -v need2="$need_exact" '
    !done && $0 ~ /^[[:space:]]*location[[:space:]]+\\/[[:space:]]*\\{/ {
      match($0, /^[[:space:]]*/)
      indent = substr($0, RSTART, RLENGTH)
      if (need1 == "1") print indent inc1
      if (need2 == "1") print indent inc2
      done = 1
    }
    { print }
    END { if (!done) exit 42 }
  ' "$SITE_CONF_REAL" > "$tmp_file"; then
    rm -f "$tmp_file"
    die "Could not find the generic location / block in $SITE_CONF_REAL"
  fi

  cat "$tmp_file" > "$SITE_CONF_REAL"
  rm -f "$tmp_file"
  log "Added missing site server include(s)."
}

test_nginx() {
  if [ "$SKIP_NGINX_TEST" = "1" ]; then
    log "Skipping nginx test because SKIP_NGINX_TEST=1."
    return
  fi

  if [ "$DRY_RUN" = "1" ]; then
    run_shell "$NGINX_TEST_COMMAND"
    return
  fi

  if sh -c "$NGINX_TEST_COMMAND"; then
    log "nginx syntax test passed."
    return
  fi

  restore_config_backups
  die "nginx syntax test failed. Config backups are in $CONFIG_BACKUP_DIR"
}

[ -n "$WEB_ROOT" ] || die "Set WEB_ROOT to the live Gnuboard document root."
[ -f "$WEB_ROOT/common.php" ] || die "WEB_ROOT does not look like a Gnuboard root: $WEB_ROOT"
[ -f "$PACKAGE_DIR/SERVER-INSTALL.sh" ] || die "SERVER-INSTALL.sh is missing from the package."
[ -f "$PACKAGE_DIR/SERVER-NGINX-PLAN.sh" ] || die "SERVER-NGINX-PLAN.sh is missing from the package."
[ -f "$PACKAGE_DIR/SERVER-ACTIVATE-THEME.sh" ] || die "SERVER-ACTIVATE-THEME.sh is missing from the package."

NGINX_CONF_REAL="$(resolve_file "$NGINX_CONF")"
SITE_CONF_REAL="$(resolve_file "$SITE_CONF")"

[ -f "$NGINX_CONF_REAL" ] || die "NGINX_CONF is missing: $NGINX_CONF"
[ -f "$SITE_CONF_REAL" ] || die "SITE_CONF is missing: $SITE_CONF"
[ -r "$NGINX_CONF_REAL" ] || die "NGINX_CONF is not readable: $NGINX_CONF_REAL"
[ -r "$SITE_CONF_REAL" ] || die "SITE_CONF is not readable: $SITE_CONF_REAL"

if [ "$DRY_RUN" != "1" ] && [ "$(id -u)" != "0" ]; then
  die "Run this script as root, or use sudo. Set DRY_RUN=1 for a non-root preview."
fi

log "Package: $PACKAGE_DIR"
log "Web root: $WEB_ROOT"
log "Nginx config: $NGINX_CONF_REAL"
log "Site config: $SITE_CONF_REAL"
log "Snippets dir: $NGINX_SNIPPETS_DIR"
log "Mode: $([ "$DRY_RUN" = "1" ] && printf 'dry-run' || printf 'apply')"

if [ "$SKIP_NGINX_PLAN" != "1" ]; then
  NGINX_CONF="$NGINX_CONF_REAL" \\
    SITE_CONF="$SITE_CONF_REAL" \\
    NGINX_SNIPPETS_DIR="$NGINX_SNIPPETS_DIR" \\
    WRITE_SITE_SNIPPET=1 \\
    bash "$PACKAGE_DIR/SERVER-NGINX-PLAN.sh"
fi

WEB_ROOT="$WEB_ROOT" \\
  NGINX_SNIPPETS_DIR="$NGINX_SNIPPETS_DIR" \\
  DRY_RUN="$DRY_RUN" \\
  SKIP_NGINX_INSTALL="$SKIP_NGINX_INSTALL" \\
  SKIP_API_INSTALL="$SKIP_API_INSTALL" \\
  SKIP_ROOT_PATCH_INSTALL="$SKIP_ROOT_PATCH_INSTALL" \\
  SKIP_NGINX_TEST=1 \\
  SKIP_NGINX_RELOAD=1 \\
  SUPPRESS_MANUAL_CHECKS=1 \\
  bash "$PACKAGE_DIR/SERVER-INSTALL.sh"

ensure_http_include
ensure_site_includes
test_nginx

if [ "$SKIP_NGINX_RELOAD" = "1" ]; then
  log "Skipping nginx reload because SKIP_NGINX_RELOAD=1."
else
  run_shell "$NGINX_RELOAD_COMMAND"
fi

WEB_ROOT="$WEB_ROOT" \\
  PHP_BIN="$PHP_BIN" \\
  PHP_WEB_ROOT="$PHP_WEB_ROOT" \\
  THEME="$THEME" \\
  APPLY="$ACTIVATE_THEME" \\
  bash "$PACKAGE_DIR/SERVER-ACTIVATE-THEME.sh"

if [ "$RUN_VERIFY" = "1" ]; then
  WEB_ROOT="$WEB_ROOT" \\
    NGINX_SNIPPETS_DIR="$NGINX_SNIPPETS_DIR" \\
    NGINX_TEST_COMMAND="$NGINX_TEST_COMMAND" \\
    SKIP_NGINX_TEST="$SKIP_NGINX_TEST" \\
    SKIP_NGINX_DUMP="$SKIP_NGINX_DUMP" \\
    SKIP_PHP_THEME_CHECK="$SKIP_PHP_THEME_CHECK" \\
    PHP_BIN="$PHP_BIN" \\
    PHP_WEB_ROOT="$PHP_WEB_ROOT" \\
    bash "$PACKAGE_DIR/SERVER-VERIFY.sh"
else
  log "Skipping server verify because RUN_VERIFY=$RUN_VERIFY."
fi

log "Root apply flow finished."
`;
}

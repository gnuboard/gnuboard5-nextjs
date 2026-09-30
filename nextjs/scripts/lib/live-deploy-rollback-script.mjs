export function createServerRollbackScript({ themeName }) {
  const THEME_NAME = themeName;
  return `#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT="\${WEB_ROOT:-}"
ROLLBACK_THEME="\${ROLLBACK_THEME:-}"
ROLLBACK_API="\${ROLLBACK_API:-}"
DRY_RUN="\${DRY_RUN:-0}"
SKIP_NGINX_TEST="\${SKIP_NGINX_TEST:-0}"
SKIP_NGINX_RELOAD="\${SKIP_NGINX_RELOAD:-0}"
NGINX_TEST_COMMAND="\${NGINX_TEST_COMMAND:-nginx -t}"
NGINX_RELOAD_COMMAND="\${NGINX_RELOAD_COMMAND:-systemctl reload nginx}"

log() {
  printf '[server-rollback] %s\\n' "$*"
}

die() {
  printf '[server-rollback] ERROR: %s\\n' "$*" >&2
  exit 1
}

run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '[server-rollback] dry-run:'
    printf ' %q' "$@"
    printf '\\n'
  else
    "$@"
  fi
}

run_shell() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '[server-rollback] dry-run: %s\\n' "$*"
  else
    sh -c "$*"
  fi
}

[ -n "$WEB_ROOT" ] || die "Set WEB_ROOT to the live Gnuboard document root."
[ -n "$ROLLBACK_THEME" ] || die "Set ROLLBACK_THEME to a ${THEME_NAME}.backup.* directory."
[ -f "$WEB_ROOT/common.php" ] || die "WEB_ROOT does not look like a Gnuboard root: $WEB_ROOT"
[ -d "$ROLLBACK_THEME" ] || die "ROLLBACK_THEME directory is missing: $ROLLBACK_THEME"
[ -f "$ROLLBACK_THEME/route.php" ] || die "ROLLBACK_THEME does not look like theme/${THEME_NAME}."
if [ -n "$ROLLBACK_API" ]; then
  [ -d "$ROLLBACK_API" ] || die "ROLLBACK_API directory is missing: $ROLLBACK_API"
  [ -f "$ROLLBACK_API/index.php" ] || die "ROLLBACK_API does not look like api."
fi

THEME_TARGET="$WEB_ROOT/theme/${THEME_NAME}"
API_TARGET="$WEB_ROOT/api"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
CURRENT_BACKUP="$WEB_ROOT/theme/${THEME_NAME}.rollback-current.$TIMESTAMP"
CURRENT_API_BACKUP="$WEB_ROOT/api.rollback-current.$TIMESTAMP"

if [ -d "$THEME_TARGET" ]; then
  log "Saving current theme to $CURRENT_BACKUP"
  run mv "$THEME_TARGET" "$CURRENT_BACKUP"
fi

log "Restoring copy of $ROLLBACK_THEME to $THEME_TARGET"
run mkdir -p "$THEME_TARGET"
run cp -a "$ROLLBACK_THEME/." "$THEME_TARGET/"

if [ -n "$ROLLBACK_API" ]; then
  if [ -d "$API_TARGET" ]; then
    log "Saving current API to $CURRENT_API_BACKUP"
    run mv "$API_TARGET" "$CURRENT_API_BACKUP"
  fi

  log "Restoring copy of $ROLLBACK_API to $API_TARGET"
  run mkdir -p "$API_TARGET"
  run cp -a "$ROLLBACK_API/." "$API_TARGET/"
fi

if [ "$SKIP_NGINX_TEST" != "1" ]; then
  run_shell "$NGINX_TEST_COMMAND"
fi

if [ "$SKIP_NGINX_RELOAD" != "1" ]; then
  run_shell "$NGINX_RELOAD_COMMAND"
else
  log "Skipping nginx reload because SKIP_NGINX_RELOAD=1."
fi

log "Rollback source backup directories were preserved for repeatable recovery."
log "Rollback step finished. Re-run live checks from the repository."
`;
}

export function createServerInstallScript({ themeName }) {
  const THEME_NAME = themeName;
  return `#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="\${WEB_ROOT:-}"
NGINX_SNIPPETS_DIR="\${NGINX_SNIPPETS_DIR:-/etc/nginx/snippets}"
DRY_RUN="\${DRY_RUN:-0}"
SKIP_NGINX_INSTALL="\${SKIP_NGINX_INSTALL:-0}"
SKIP_NGINX_TEST="\${SKIP_NGINX_TEST:-0}"
SKIP_NGINX_RELOAD="\${SKIP_NGINX_RELOAD:-0}"
SKIP_API_INSTALL="\${SKIP_API_INSTALL:-0}"
SKIP_ROOT_PATCH_INSTALL="\${SKIP_ROOT_PATCH_INSTALL:-0}"
NGINX_TEST_COMMAND="\${NGINX_TEST_COMMAND:-nginx -t}"
NGINX_RELOAD_COMMAND="\${NGINX_RELOAD_COMMAND:-systemctl reload nginx}"
BACKUP_ROOT="\${BACKUP_ROOT:-}"
SUPPRESS_MANUAL_CHECKS="\${SUPPRESS_MANUAL_CHECKS:-0}"

log() {
  printf '[server-install] %s\\n' "$*"
}

die() {
  printf '[server-install] ERROR: %s\\n' "$*" >&2
  exit 1
}

run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '[server-install] dry-run:'
    printf ' %q' "$@"
    printf '\\n'
  else
    "$@"
  fi
}

run_shell() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '[server-install] dry-run: %s\\n' "$*"
  else
    sh -c "$*"
  fi
}

[ -n "$WEB_ROOT" ] || die "Set WEB_ROOT to the live Gnuboard document root."
[ -d "$PACKAGE_DIR/upload/theme/${THEME_NAME}" ] || die "Package theme directory is missing."
[ -d "$PACKAGE_DIR/upload/api" ] || die "Package API directory is missing."
[ -d "$PACKAGE_DIR/nginx" ] || die "Package nginx directory is missing."
[ -f "$WEB_ROOT/common.php" ] || die "WEB_ROOT does not look like a Gnuboard root: $WEB_ROOT"
[ -d "$WEB_ROOT/theme" ] || die "WEB_ROOT/theme is missing: $WEB_ROOT/theme"

if [ -f "$PACKAGE_DIR/CHECKSUMS.sha256" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    log "Verifying package checksums"
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
      log "Package checksums passed"
    else
      die "Package checksum verification failed; see $CHECKSUM_OUTPUT"
    fi
  else
    log "sha256sum is not available; skipping package checksum verification."
  fi
fi

THEME_SOURCE="$PACKAGE_DIR/upload/theme/${THEME_NAME}"
THEME_TARGET="$WEB_ROOT/theme/${THEME_NAME}"
API_SOURCE="$PACKAGE_DIR/upload/api"
API_TARGET="$WEB_ROOT/api"
ROOT_PATCH_SOURCE="$PACKAGE_DIR/root-patch"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TMP_TARGET="$WEB_ROOT/theme/.${THEME_NAME}.deploy.$TIMESTAMP"
BACKUP_PARENT="$WEB_ROOT/theme"
API_TMP_TARGET="$WEB_ROOT/.api.${THEME_NAME}.deploy.$TIMESTAMP"
API_BACKUP_PARENT="$WEB_ROOT"

if [ -n "$BACKUP_ROOT" ]; then
  BACKUP_PARENT="$BACKUP_ROOT"
  API_BACKUP_PARENT="$BACKUP_ROOT"
  run mkdir -p "$BACKUP_PARENT"
fi

BACKUP_TARGET="$BACKUP_PARENT/${THEME_NAME}.backup.$TIMESTAMP"
API_BACKUP_TARGET="$API_BACKUP_PARENT/api.backup.$TIMESTAMP"
ROOT_PATCH_BACKUP_TARGET="$API_BACKUP_PARENT/root-patch.backup.$TIMESTAMP"

log "Package: $PACKAGE_DIR"
log "Web root: $WEB_ROOT"
log "Theme source: $THEME_SOURCE"
log "Theme target: $THEME_TARGET"
log "API source: $API_SOURCE"
log "API target: $API_TARGET"
log "Root patch source: $ROOT_PATCH_SOURCE"
log "Nginx snippets: $NGINX_SNIPPETS_DIR"

if [ "$DRY_RUN" != "1" ] && [ "$SKIP_NGINX_INSTALL" != "1" ]; then
  if [ -d "$NGINX_SNIPPETS_DIR" ]; then
    [ -w "$NGINX_SNIPPETS_DIR" ] || die "NGINX_SNIPPETS_DIR is not writable before install: $NGINX_SNIPPETS_DIR"
  else
    SNIPPETS_PARENT="$(dirname "$NGINX_SNIPPETS_DIR")"
    [ -d "$SNIPPETS_PARENT" ] || die "Parent directory for NGINX_SNIPPETS_DIR is missing: $SNIPPETS_PARENT"
    [ -w "$SNIPPETS_PARENT" ] || die "Cannot create NGINX_SNIPPETS_DIR; parent is not writable: $SNIPPETS_PARENT"
  fi
fi

run rm -rf "$TMP_TARGET"
run mkdir -p "$TMP_TARGET"
run cp -a "$THEME_SOURCE/." "$TMP_TARGET/"

if [ "$DRY_RUN" != "1" ]; then
  [ -f "$TMP_TARGET/route.php" ] || die "Staged theme route.php is missing."
  [ -f "$TMP_TARGET/bridge/app-shell.php" ] || die "Staged theme bridge/app-shell.php is missing."
  [ -f "$TMP_TARGET/bridge/render.php" ] || die "Staged theme bridge/render.php is missing."
  [ -f "$TMP_TARGET/bridge/metadata.php" ] || die "Staged theme bridge/metadata.php is missing."
  [ -f "$TMP_TARGET/bridge/legacy-routes.php" ] || die "Staged theme bridge/legacy-routes.php is missing."
  [ -f "$TMP_TARGET/bridge/asset-responses.php" ] || die "Staged theme bridge/asset-responses.php is missing."
  [ -f "$TMP_TARGET/app/index.html" ] || die "Staged theme app/index.html is missing."
fi

if [ -d "$THEME_TARGET" ]; then
  log "Backing up current theme to $BACKUP_TARGET"
  run mv "$THEME_TARGET" "$BACKUP_TARGET"
else
  log "No existing theme/${THEME_NAME} directory found."
fi

run mv "$TMP_TARGET" "$THEME_TARGET"

if [ "$SKIP_API_INSTALL" = "1" ]; then
  log "Skipping API install because SKIP_API_INSTALL=1."
else
  run rm -rf "$API_TMP_TARGET"
  run mkdir -p "$API_TMP_TARGET"
  run cp -a "$API_SOURCE/." "$API_TMP_TARGET/"

  if [ "$DRY_RUN" != "1" ]; then
    [ -f "$API_TMP_TARGET/index.php" ] || die "Staged API index.php is missing."
    [ -f "$API_TMP_TARGET/v1/shop/router.php" ] || die "Staged shop router is missing."
    [ -f "$API_TMP_TARGET/v1/shop/reviews.php" ] || die "Staged review API is missing."
  fi

  if [ -d "$API_TARGET" ]; then
    log "Backing up current API to $API_BACKUP_TARGET"
    run mv "$API_TARGET" "$API_BACKUP_TARGET"
  else
    log "No existing api directory found."
  fi

  run mv "$API_TMP_TARGET" "$API_TARGET"
fi

if [ "$SKIP_ROOT_PATCH_INSTALL" = "1" ]; then
  log "Skipping root patch install because SKIP_ROOT_PATCH_INSTALL=1."
elif [ -d "$ROOT_PATCH_SOURCE" ]; then
  log "Installing root patch files with backup at $ROOT_PATCH_BACKUP_TARGET"
  find "$ROOT_PATCH_SOURCE" -type f | while IFS= read -r source_file; do
    rel_path="\${source_file#$ROOT_PATCH_SOURCE/}"
    target_file="$WEB_ROOT/$rel_path"
    backup_file="$ROOT_PATCH_BACKUP_TARGET/$rel_path"

    run mkdir -p "$(dirname "$target_file")"
    if [ -f "$target_file" ]; then
      run mkdir -p "$(dirname "$backup_file")"
      run cp -a "$target_file" "$backup_file"
    fi

    run cp -a "$source_file" "$target_file"
  done
else
  log "No root patch directory found; skipping root patch install."
fi

if [ "$SKIP_NGINX_INSTALL" = "1" ]; then
  log "Skipping nginx snippet install because SKIP_NGINX_INSTALL=1."
else
  run mkdir -p "$NGINX_SNIPPETS_DIR"
  for file in "$PACKAGE_DIR"/nginx/*.conf; do
    [ -f "$file" ] || continue
    run cp -f "$file" "$NGINX_SNIPPETS_DIR/$(basename "$file")"
  done
fi

if [ "$SKIP_NGINX_TEST" != "1" ]; then
  run_shell "$NGINX_TEST_COMMAND"
fi

if [ "$SKIP_NGINX_RELOAD" != "1" ]; then
  run_shell "$NGINX_RELOAD_COMMAND"
else
  log "Skipping nginx reload because SKIP_NGINX_RELOAD=1."
fi

if [ "$SUPPRESS_MANUAL_CHECKS" != "1" ]; then
cat <<'MSG'

Manual checks still required:
- nginx.conf http {} may include /etc/nginx/snippets/g5-${THEME_NAME}-security-map.conf for compatibility.
- The target nginx server {} includes /etc/nginx/snippets/g5-${THEME_NAME}-theme-locations.conf before generic Gnuboard locations.
- SERVER-NGINX-PLAN.sh has been used to add exact /theme/${THEME_NAME}/route.php and /api/index.php PHP-FPM locations.
- Gnuboard active theme is ${THEME_NAME}. Use SERVER-ACTIVATE-THEME.sh if needed.
- From the repository, run npm run check:live-deployment and npm run check:live-runtime.

MSG
fi

log "Install step finished. Roll back theme files with SERVER-ROLLBACK.sh and ROLLBACK_THEME=$BACKUP_TARGET if needed."
if [ "$SKIP_API_INSTALL" != "1" ]; then
  log "Roll back API files with SERVER-ROLLBACK.sh and ROLLBACK_API=$API_BACKUP_TARGET if needed."
fi
`;
}

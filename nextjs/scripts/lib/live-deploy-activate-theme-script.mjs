export function createServerActivateThemeScript({ themeName }) {
  const THEME_NAME = themeName;
  return `#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT="\${WEB_ROOT:-}"
THEME="\${THEME:-${THEME_NAME}}"
APPLY="\${APPLY:-0}"
PHP_BIN="\${PHP_BIN:-php}"
PHP_WEB_ROOT="\${PHP_WEB_ROOT:-}"

if [ -z "$PHP_WEB_ROOT" ]; then
  PHP_WEB_ROOT="$WEB_ROOT"
  if [[ "$PHP_BIN" == *.exe && "$WEB_ROOT" =~ ^/mnt/([A-Za-z])/(.*)$ ]]; then
    PHP_WEB_ROOT="\${BASH_REMATCH[1]^^}:/\${BASH_REMATCH[2]}"
  fi
fi

log() {
  printf '[server-activate-theme] %s\\n' "$*"
}

die() {
  printf '[server-activate-theme] ERROR: %s\\n' "$*" >&2
  exit 1
}

[ -n "$WEB_ROOT" ] || die "Set WEB_ROOT to the live Gnuboard document root."
[ -f "$WEB_ROOT/common.php" ] || die "WEB_ROOT does not look like a Gnuboard root: $WEB_ROOT"

if [[ ! "$THEME" =~ ^[a-z][a-z0-9_-]{1,31}$ ]]; then
  die "THEME must be 2-32 chars: a lowercase letter followed by lowercase letters, numbers, or hyphens."
fi

if [ ! -d "$WEB_ROOT/theme/$THEME" ]; then
  if [ "$APPLY" = "1" ]; then
    die "Theme directory is missing: $WEB_ROOT/theme/$THEME"
  fi
  log "Theme directory is missing, but APPLY=0; continuing as a first-deploy dry-run."
elif [ ! -f "$WEB_ROOT/theme/$THEME/theme.config.php" ]; then
  if [ "$APPLY" = "1" ]; then
    die "Theme config is missing: $WEB_ROOT/theme/$THEME/theme.config.php"
  fi
  log "Theme config is missing, but APPLY=0; continuing as a first-deploy dry-run."
fi

sync_active_theme_link() {
  if [ "$THEME" = "active" ]; then
    die "THEME=active is reserved for the nginx active-theme symlink."
  fi

  local link="$WEB_ROOT/theme/active"
  if [ -e "$link" ] && [ ! -L "$link" ]; then
    die "Cannot update theme/active because the path exists and is not a symlink: $link"
  fi

  if [ "$APPLY" != "1" ]; then
    log "dry-run: would point theme/active to theme/$THEME"
    return
  fi

  (cd "$WEB_ROOT/theme" && ln -sfn "$THEME" active)
  log "updated theme/active symlink to theme/$THEME"
}

if ! command -v "$PHP_BIN" >/dev/null 2>&1; then
  die "PHP_BIN command is required to update Gnuboard config: $PHP_BIN"
fi

if [ "$APPLY" = "1" ]; then
  log "APPLY=1, updating Gnuboard active theme if needed."
else
  log "Dry-run mode. Set APPLY=1 to update Gnuboard active theme."
fi

WEB_ROOT="$WEB_ROOT" PHP_WEB_ROOT="$PHP_WEB_ROOT" THEME="$THEME" APPLY="$APPLY" "$PHP_BIN" -d display_errors=stderr <<'PHP'
<?php
$webRoot = getenv('PHP_WEB_ROOT') ?: (getenv('WEB_ROOT') ?: '');
$theme = getenv('THEME') ?: '${THEME_NAME}';
$apply = getenv('APPLY') === '1';

if (!preg_match('/^[a-z][a-z0-9_-]{1,31}$/', $theme)) {
    fwrite(STDERR, "[server-activate-theme] ERROR: Invalid theme name. Use 2-32 chars: a lowercase letter followed by lowercase letters, numbers, or hyphens.\\n");
    exit(1);
}

if (!chdir($webRoot)) {
    fwrite(STDERR, "[server-activate-theme] ERROR: Cannot enter WEB_ROOT.\\n");
    exit(1);
}

$_SERVER['SERVER_NAME'] = $_SERVER['SERVER_NAME'] ?? 'localhost';
$_SERVER['HTTP_HOST'] = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'];
$_SERVER['SERVER_PORT'] = $_SERVER['SERVER_PORT'] ?? '80';
$_SERVER['REQUEST_URI'] = $_SERVER['REQUEST_URI'] ?? '/';
$_SERVER['REQUEST_METHOD'] = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$_SERVER['REMOTE_ADDR'] = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

ob_start();
include './common.php';
ob_end_clean();

global $g5, $config;

if (empty($g5['config_table'])) {
    fwrite(STDERR, "[server-activate-theme] ERROR: Gnuboard config table is unavailable.\\n");
    exit(1);
}

$current = isset($config['cf_theme']) ? (string) $config['cf_theme'] : '';
echo '[server-activate-theme] current theme: ' . ($current !== '' ? $current : '(none)') . PHP_EOL;
echo '[server-activate-theme] target theme: ' . $theme . PHP_EOL;

if ($current === $theme) {
    echo "[server-activate-theme] active theme already matches target.\\n";
    exit(0);
}

if (!$apply) {
    echo "[server-activate-theme] dry-run: would update cf_theme to '{$theme}'.\\n";
    exit(0);
}

$escaped = function_exists('sql_real_escape_string')
    ? sql_real_escape_string($theme)
    : sql_escape_string($theme);

sql_query(" update {$g5['config_table']} set cf_theme = '{$escaped}' ");

$row = sql_fetch(" select cf_theme from {$g5['config_table']} limit 1 ");
$after = isset($row['cf_theme']) ? (string) $row['cf_theme'] : '';

if ($after !== $theme) {
    fwrite(STDERR, "[server-activate-theme] ERROR: Theme update did not persist. Current value: {$after}\\n");
    exit(1);
}

echo "[server-activate-theme] updated cf_theme to '{$theme}'.\\n";
PHP

sync_active_theme_link
`;
}

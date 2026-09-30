function bashLiteral(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function createServerRootCommandsScript({ themeName, liveDefaultWebRoot, liveDefaultNginxConf, liveDefaultSiteConf, liveDefaultNginxSnippetsDir }) {
  const THEME_NAME = themeName;
  return `#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_WEB_ROOT=${bashLiteral(liveDefaultWebRoot)}
DEFAULT_NGINX_CONF=${bashLiteral(liveDefaultNginxConf)}
DEFAULT_SITE_CONF=${bashLiteral(liveDefaultSiteConf)}
DEFAULT_NGINX_SNIPPETS_DIR=${bashLiteral(liveDefaultNginxSnippetsDir)}

WEB_ROOT="\${WEB_ROOT:-$DEFAULT_WEB_ROOT}"
NGINX_CONF="\${NGINX_CONF:-$DEFAULT_NGINX_CONF}"
SITE_CONF="\${SITE_CONF:-$DEFAULT_SITE_CONF}"
NGINX_SNIPPETS_DIR="\${NGINX_SNIPPETS_DIR:-$DEFAULT_NGINX_SNIPPETS_DIR}"
THEME="\${THEME:-${THEME_NAME}}"
PHP_BIN="\${PHP_BIN:-php}"
PHP_WEB_ROOT="\${PHP_WEB_ROOT:-}"
SKIP_NGINX_PLAN="\${SKIP_NGINX_PLAN:-0}"
SKIP_NGINX_INSTALL="\${SKIP_NGINX_INSTALL:-0}"
SKIP_NGINX_TEST="\${SKIP_NGINX_TEST:-0}"
SKIP_NGINX_DUMP="\${SKIP_NGINX_DUMP:-0}"
SKIP_PHP_THEME_CHECK="\${SKIP_PHP_THEME_CHECK:-0}"
NGINX_TEST_COMMAND="\${NGINX_TEST_COMMAND:-nginx -t}"
NGINX_RELOAD_COMMAND="\${NGINX_RELOAD_COMMAND:-systemctl reload nginx}"
MODE="\${1:-dry-run}"

usage() {
  cat <<'USAGE'
Usage:
  bash SERVER-ROOT-COMMANDS.sh status
  sudo bash SERVER-ROOT-COMMANDS.sh dry-run
  sudo bash SERVER-ROOT-COMMANDS.sh apply
  sudo bash SERVER-ROOT-COMMANDS.sh verify
  sudo env CONFIRM_APPLY=${THEME_NAME} bash SERVER-ROOT-COMMANDS.sh apply-and-verify
  bash SERVER-ROOT-COMMANDS.sh print-dry-run
  bash SERVER-ROOT-COMMANDS.sh print-apply
  bash SERVER-ROOT-COMMANDS.sh print-verify
  bash SERVER-ROOT-COMMANDS.sh print-apply-and-verify

Environment overrides:
  WEB_ROOT, NGINX_CONF, SITE_CONF, NGINX_SNIPPETS_DIR, PHP_BIN, PHP_WEB_ROOT,
  CONFIRM_APPLY

The generated live defaults target:
  WEB_ROOT=$DEFAULT_WEB_ROOT
  SITE_CONF=$DEFAULT_SITE_CONF
Use dry-run first and
only run apply after the output looks correct.
USAGE
}

print_command() {
  local dry_run="$1"
  local activate_theme="$2"
  local run_verify="$3"
  local skip_reload="$4"

  printf 'cd '
  printf '%q' "$PACKAGE_DIR"
  printf '\\n'
  printf 'sudo env'
  printf ' WEB_ROOT=%q' "$WEB_ROOT"
  printf ' NGINX_CONF=%q' "$NGINX_CONF"
  printf ' SITE_CONF=%q' "$SITE_CONF"
  printf ' NGINX_SNIPPETS_DIR=%q' "$NGINX_SNIPPETS_DIR"
  printf ' THEME=%q' "$THEME"
  printf ' DRY_RUN=%q' "$dry_run"
  printf ' SKIP_NGINX_RELOAD=%q' "$skip_reload"
  printf ' ACTIVATE_THEME=%q' "$activate_theme"
  printf ' RUN_VERIFY=%q' "$run_verify"
  printf ' bash SERVER-ROOT-APPLY.sh\\n'
}

print_verify_command() {
  printf 'cd '
  printf '%q' "$PACKAGE_DIR"
  printf '\\n'
  printf 'sudo env'
  printf ' WEB_ROOT=%q' "$WEB_ROOT"
  printf ' NGINX_SNIPPETS_DIR=%q' "$NGINX_SNIPPETS_DIR"
  printf ' PHP_BIN=%q' "$PHP_BIN"
  if [ -n "$PHP_WEB_ROOT" ]; then
    printf ' PHP_WEB_ROOT=%q' "$PHP_WEB_ROOT"
  fi
  printf ' bash SERVER-ROOT-COMMANDS.sh verify\\n'
}

print_apply_and_verify_command() {
  printf 'cd '
  printf '%q' "$PACKAGE_DIR"
  printf '\\n'
  printf 'sudo env'
  printf ' WEB_ROOT=%q' "$WEB_ROOT"
  printf ' NGINX_CONF=%q' "$NGINX_CONF"
  printf ' SITE_CONF=%q' "$SITE_CONF"
  printf ' NGINX_SNIPPETS_DIR=%q' "$NGINX_SNIPPETS_DIR"
  printf ' THEME=%q' "$THEME"
  printf ' CONFIRM_APPLY=%q' "$THEME"
  printf ' PHP_BIN=%q' "$PHP_BIN"
  if [ -n "$PHP_WEB_ROOT" ]; then
    printf ' PHP_WEB_ROOT=%q' "$PHP_WEB_ROOT"
  fi
  printf ' bash SERVER-ROOT-COMMANDS.sh apply-and-verify\\n'
}

case "$MODE" in
  -h|--help|help)
    usage
    exit 0
    ;;
  status)
    [ -f "$PACKAGE_DIR/SERVER-NGINX-PLAN.sh" ] || {
      printf '[server-root-commands] ERROR: SERVER-NGINX-PLAN.sh is missing from %s\\n' "$PACKAGE_DIR" >&2
      exit 1
    }
    [ -f "$PACKAGE_DIR/SERVER-ACTIVATE-THEME.sh" ] || {
      printf '[server-root-commands] ERROR: SERVER-ACTIVATE-THEME.sh is missing from %s\\n' "$PACKAGE_DIR" >&2
      exit 1
    }
    printf '[server-root-commands] package: %s\\n' "$PACKAGE_DIR"
    printf '[server-root-commands] mode: status\\n'
    printf '[server-root-commands] web root: %s\\n' "$WEB_ROOT"
    printf '[server-root-commands] nginx conf: %s\\n' "$NGINX_CONF"
    printf '[server-root-commands] site conf: %s\\n' "$SITE_CONF"
    NGINX_CONF="$NGINX_CONF" \\
      SITE_CONF="$SITE_CONF" \\
      NGINX_SNIPPETS_DIR="$NGINX_SNIPPETS_DIR" \\
      WRITE_SITE_SNIPPET="0" \\
      bash "$PACKAGE_DIR/SERVER-NGINX-PLAN.sh"
    WEB_ROOT="$WEB_ROOT" \\
      PHP_BIN="$PHP_BIN" \\
      PHP_WEB_ROOT="$PHP_WEB_ROOT" \\
      THEME="$THEME" \\
      APPLY="0" \\
      bash "$PACKAGE_DIR/SERVER-ACTIVATE-THEME.sh"
    exit 0
    ;;
  dry-run|preview)
    DRY_RUN="1"
    ACTIVATE_THEME="\${ACTIVATE_THEME:-0}"
    RUN_VERIFY="\${RUN_VERIFY:-0}"
    SKIP_NGINX_RELOAD="\${SKIP_NGINX_RELOAD:-1}"
    ;;
  apply)
    DRY_RUN="0"
    ACTIVATE_THEME="\${ACTIVATE_THEME:-1}"
    RUN_VERIFY="\${RUN_VERIFY:-1}"
    SKIP_NGINX_RELOAD="\${SKIP_NGINX_RELOAD:-0}"
    ;;
  apply-and-verify|apply-verify|finalize)
    if [ "\${CONFIRM_APPLY:-}" != "$THEME" ]; then
      printf '[server-root-commands] ERROR: apply-and-verify requires CONFIRM_APPLY=%s after reviewing dry-run output.\\n' "$THEME" >&2
      exit 1
    fi
    if [ "$(id -u)" != "0" ]; then
      printf '[server-root-commands] ERROR: apply-and-verify mode must run as root. Use sudo env CONFIRM_APPLY=%s bash SERVER-ROOT-COMMANDS.sh apply-and-verify\\n' "$THEME" >&2
      exit 1
    fi
    printf '[server-root-commands] package: %s\\n' "$PACKAGE_DIR"
    printf '[server-root-commands] mode: apply-and-verify\\n'
    printf '[server-root-commands] web root: %s\\n' "$WEB_ROOT"
    printf '[server-root-commands] nginx conf: %s\\n' "$NGINX_CONF"
    printf '[server-root-commands] site conf: %s\\n' "$SITE_CONF"
    WEB_ROOT="$WEB_ROOT" \\
      NGINX_CONF="$NGINX_CONF" \\
      SITE_CONF="$SITE_CONF" \\
      NGINX_SNIPPETS_DIR="$NGINX_SNIPPETS_DIR" \\
      THEME="$THEME" \\
      PHP_BIN="$PHP_BIN" \\
      PHP_WEB_ROOT="$PHP_WEB_ROOT" \\
      SKIP_NGINX_PLAN="$SKIP_NGINX_PLAN" \\
      SKIP_NGINX_INSTALL="$SKIP_NGINX_INSTALL" \\
      SKIP_NGINX_TEST="$SKIP_NGINX_TEST" \\
      SKIP_NGINX_DUMP="$SKIP_NGINX_DUMP" \\
      SKIP_PHP_THEME_CHECK="$SKIP_PHP_THEME_CHECK" \\
      NGINX_TEST_COMMAND="$NGINX_TEST_COMMAND" \\
      NGINX_RELOAD_COMMAND="$NGINX_RELOAD_COMMAND" \\
      ACTIVATE_THEME="1" \\
      RUN_VERIFY="0" \\
      SKIP_NGINX_RELOAD="\${SKIP_NGINX_RELOAD:-0}" \\
      bash "$PACKAGE_DIR/SERVER-ROOT-COMMANDS.sh" apply
    WEB_ROOT="$WEB_ROOT" \\
      NGINX_CONF="$NGINX_CONF" \\
      SITE_CONF="$SITE_CONF" \\
      NGINX_SNIPPETS_DIR="$NGINX_SNIPPETS_DIR" \\
      THEME="$THEME" \\
      PHP_BIN="$PHP_BIN" \\
      PHP_WEB_ROOT="$PHP_WEB_ROOT" \\
      NGINX_TEST_COMMAND="$NGINX_TEST_COMMAND" \\
      SKIP_NGINX_TEST="$SKIP_NGINX_TEST" \\
      SKIP_NGINX_DUMP="$SKIP_NGINX_DUMP" \\
      SKIP_PHP_THEME_CHECK="$SKIP_PHP_THEME_CHECK" \\
      bash "$PACKAGE_DIR/SERVER-ROOT-COMMANDS.sh" verify
    exit 0
    ;;
  verify)
    [ -f "$PACKAGE_DIR/SERVER-VERIFY.sh" ] || {
      printf '[server-root-commands] ERROR: SERVER-VERIFY.sh is missing from %s\\n' "$PACKAGE_DIR" >&2
      exit 1
    }
    [ -f "$WEB_ROOT/common.php" ] || {
      printf '[server-root-commands] ERROR: WEB_ROOT does not look like a Gnuboard root: %s\\n' "$WEB_ROOT" >&2
      exit 1
    }
    if [ "$(id -u)" != "0" ]; then
      printf '[server-root-commands] ERROR: verify mode should run as root for nginx -t and nginx -T access. Use sudo bash SERVER-ROOT-COMMANDS.sh verify\\n' >&2
      exit 1
    fi
    printf '[server-root-commands] package: %s\\n' "$PACKAGE_DIR"
    printf '[server-root-commands] mode: verify\\n'
    printf '[server-root-commands] web root: %s\\n' "$WEB_ROOT"
    printf '[server-root-commands] nginx conf: %s\\n' "$NGINX_CONF"
    printf '[server-root-commands] site conf: %s\\n' "$SITE_CONF"
    NGINX_CONF="$NGINX_CONF" \\
      SITE_CONF="$SITE_CONF" \\
      NGINX_SNIPPETS_DIR="$NGINX_SNIPPETS_DIR" \\
      WRITE_SITE_SNIPPET="0" \\
      bash "$PACKAGE_DIR/SERVER-NGINX-PLAN.sh"
    WEB_ROOT="$WEB_ROOT" \\
      NGINX_SNIPPETS_DIR="$NGINX_SNIPPETS_DIR" \\
      NGINX_TEST_COMMAND="$NGINX_TEST_COMMAND" \\
      SKIP_NGINX_TEST="$SKIP_NGINX_TEST" \\
      SKIP_NGINX_DUMP="$SKIP_NGINX_DUMP" \\
      SKIP_PHP_THEME_CHECK="$SKIP_PHP_THEME_CHECK" \\
      PHP_BIN="$PHP_BIN" \\
      PHP_WEB_ROOT="$PHP_WEB_ROOT" \\
      bash "$PACKAGE_DIR/SERVER-VERIFY.sh"
    exit 0
    ;;
  print-dry-run|print-preview)
    print_command "1" "\${ACTIVATE_THEME:-0}" "\${RUN_VERIFY:-0}" "\${SKIP_NGINX_RELOAD:-1}"
    exit 0
    ;;
  print-apply)
    print_command "0" "\${ACTIVATE_THEME:-1}" "\${RUN_VERIFY:-1}" "\${SKIP_NGINX_RELOAD:-0}"
    exit 0
    ;;
  print-verify)
    print_verify_command
    exit 0
    ;;
  print-apply-and-verify|print-finalize)
    print_apply_and_verify_command
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

[ -f "$PACKAGE_DIR/SERVER-ROOT-APPLY.sh" ] || {
  printf '[server-root-commands] ERROR: SERVER-ROOT-APPLY.sh is missing from %s\\n' "$PACKAGE_DIR" >&2
  exit 1
}

[ -f "$WEB_ROOT/common.php" ] || {
  printf '[server-root-commands] ERROR: WEB_ROOT does not look like a Gnuboard root: %s\\n' "$WEB_ROOT" >&2
  exit 1
}

if [ "$DRY_RUN" != "1" ] && [ "$(id -u)" != "0" ]; then
  printf '[server-root-commands] ERROR: apply mode must run as root. Use sudo bash SERVER-ROOT-COMMANDS.sh apply\\n' >&2
  exit 1
fi

printf '[server-root-commands] package: %s\\n' "$PACKAGE_DIR"
printf '[server-root-commands] mode: %s\\n' "$MODE"
printf '[server-root-commands] web root: %s\\n' "$WEB_ROOT"
printf '[server-root-commands] nginx conf: %s\\n' "$NGINX_CONF"
printf '[server-root-commands] site conf: %s\\n' "$SITE_CONF"

WEB_ROOT="$WEB_ROOT" \\
  NGINX_CONF="$NGINX_CONF" \\
  SITE_CONF="$SITE_CONF" \\
  NGINX_SNIPPETS_DIR="$NGINX_SNIPPETS_DIR" \\
  THEME="$THEME" \\
  PHP_BIN="$PHP_BIN" \\
  PHP_WEB_ROOT="$PHP_WEB_ROOT" \\
  DRY_RUN="$DRY_RUN" \\
  SKIP_NGINX_PLAN="$SKIP_NGINX_PLAN" \\
  SKIP_NGINX_INSTALL="$SKIP_NGINX_INSTALL" \\
  SKIP_NGINX_TEST="$SKIP_NGINX_TEST" \\
  SKIP_NGINX_RELOAD="$SKIP_NGINX_RELOAD" \\
  SKIP_NGINX_DUMP="$SKIP_NGINX_DUMP" \\
  SKIP_PHP_THEME_CHECK="$SKIP_PHP_THEME_CHECK" \\
  NGINX_TEST_COMMAND="$NGINX_TEST_COMMAND" \\
  NGINX_RELOAD_COMMAND="$NGINX_RELOAD_COMMAND" \\
  ACTIVATE_THEME="$ACTIVATE_THEME" \\
  RUN_VERIFY="$RUN_VERIFY" \\
  bash "$PACKAGE_DIR/SERVER-ROOT-APPLY.sh"
`;
}

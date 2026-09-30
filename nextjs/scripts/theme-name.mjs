/**
 * Single source of truth for the gnuboard theme directory the Next.js app builds into.
 *
 * Every build / sync / check / deploy script imports THEME_NAME from here instead of
 * hardcoding the literal 'nextjs25'. That makes the whole pipeline parameterizable:
 *
 *   node scripts/with-theme.mjs --source foonext --name foonext -- npm run build:theme
 *
 * so a forked theme can coexist on disk with the original theme/nextjs25.
 *
 * If only G5_THEME_SOURCE is set, infer the output theme through
 * nextjs/theme-map.json, falling back to the same name for custom sources. This
 * avoids the easy mistake of editing nextjs/themes/myshop but syncing the build
 * into theme/nextjs25/app.
 *
 * The on-disk folder basename MUST equal both this build-time THEME_NAME and the
 * gnuboard DB value g5_config.cf_theme (the active-theme selector). The create-theme
 * generator writes G5_THEME_NAME into nextjs/.env.local and prints the cf_theme step.
 */

import { DEFAULT_THEME_NAME, resolveThemeName } from './theme-pair.mjs';

export const THEME_NAME = resolveThemeName();
export const DEFAULT_THEME = DEFAULT_THEME_NAME;
export const IS_DEFAULT_THEME = THEME_NAME === DEFAULT_THEME_NAME;

/** UPPER_SNAKE token used by PHP constant / JS window-global families, e.g. "G5_FOONEXT". */
export const upperToken = () => 'G5_' + THEME_NAME.toUpperCase().replaceAll('-', '_');

/** Next.js build id; theme-agnostic by default since one build can serve any theme folder. */
export const buildId = () => process.env.G5_NEXT_BUILD_ID || 'g5-static';

/** Live-deploy package / archive basename. */
export const packageName = () => `${THEME_NAME}-live`;

/**
 * Theme-NEUTRAL JS<->PHP runtime-config global key. Kept neutral on purpose so a single
 * static export resolves its URLs from whatever the active theme's PHP injects (true
 * one-build-many-themes). A fork may override via NEXT_PUBLIC_RUNTIME_CONFIG_KEY.
 */
export const RUNTIME_CONFIG_KEY = '__G5_APP_CONFIG__';

export default THEME_NAME;

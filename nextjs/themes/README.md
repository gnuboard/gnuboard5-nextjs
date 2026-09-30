# Next.js Theme Sources

This folder contains editable design sources for the Next.js frontend.

Use `node scripts/dev-theme.mjs <source> <theme-name> -- ...` for local dev, or
`node scripts/with-theme.mjs --source <source> --name <theme-name> -- ...` for
build/package commands. `G5_THEME_SOURCE` is still supported as an environment
fallback.

`G5_THEME_NAME` is different: it controls where the static export is synced under
`theme/<name>/app`.

Runtime theme selection is controlled by Gnuboard's `g5_config.cf_theme`. Keep
Apache/nginx pointed at the theme-neutral `plugin/webapp/bridge/route.php` front
controller when you want admin theme switching without web-server edits. For
nginx, use `docs/nginx/active-theme-*.conf`.

## Files

- `theme.config.ts`: brand, metadata, footer copy, and theme API version.
- `theme.css`: CSS variables and custom theme styles.
- `components.tsx`: optional component slots. Export an empty object when unused.

## Create A Source

```bash
npm run create-theme-source -- -- --name myshop --theme-name myshop --label "My Shop"
node scripts/dev-theme.mjs myshop myshop -- -H 127.0.0.1 -p 3003
node scripts/with-theme.mjs --source myshop --name myshop -- npm run build:theme
```

`create-theme-source` uses `-- -- --name` because npm treats `--name` and
`--label` as npm-level options unless the extra `--` is passed through.

`create-theme-source` does not change `nextjs/.env.local` or `themes/.active` by
default. Add `--persist` when you deliberately want the new source to become the
local default.

The source/theme relation is recorded in `nextjs/theme-map.json`. Add or edit an
entry there when the source folder and Gnuboard theme folder intentionally use
different names.

Keep custom design work in this folder. Treat `theme/<name>/app` as generated output.

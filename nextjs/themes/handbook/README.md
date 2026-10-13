# Handbook theme

A documentation / manual-site theme for the gnuboard5 + Next.js frontend,
built on **daisyUI v5 + Tailwind CSS v4**. It reframes the community and shop
surfaces as a docs portal: a sticky top bar, a left navigation sidebar
(off-canvas drawer on mobile), and a generous content column.

![Handbook theme](../../../theme/handbook/screenshot.png)

## What it customises

The theme provides component slots (see `components.tsx`); everything else falls
back to the app defaults.

| Slot | File | Surface |
| --- | --- | --- |
| `LayoutShell` / `ShopLayoutShell` | `layout-shell.tsx` | Docs chrome — top bar + sidebar drawer + footer, wrapping every page |
| `HomePage` / `CommunityPage` | `home.tsx` | Docs landing — hero, daisyUI `steps`/`tabs` install guide, feature grid, live latest posts |
| `ShopHomePage` / `OrganicPage` | `shop-home.tsx` | Docs-styled catalog — quick links + recommended / best / new product grids from live data |

## Manual books

The sidebar manuals come from your gnuboard data, not from this code:

| Manual piece | gnuboard data |
| --- | --- |
| Manual (book) | a board in the manual board group |
| Part | the board's categories (`bo_category_list`), in that order |
| Chapter | a post on that board, in board order |
| Book name / hint | the board title — `hint · name` puts the part before `·` as a small hint, unless the admin screen sets a hint for that board |
| Book order | the board's output order (`bo_order`), then the title |

Pick the manual board group on the admin screen below. While no group is picked
there, the build-time `NEXT_PUBLIC_DOCS_GROUP` is used. Without either the theme
shows no manuals and the home page says so. `tools/manual` imports Markdown
manuscripts into the group `manual`.

## Admin settings (no rebuild)

gnuboard admin › 환경설정 › **테마 화면 설정** (`/adm/view.php?call=theme_settings`,
super admin only, shown while handbook is the active theme) stores one row per
theme in `g5_theme_setting` (created by the API add-on, `plugin/webapp/theme-settings`):

| Setting | Effect |
| --- | --- |
| Manual board group | which boards are manuals; book order and names edit the boards' `bo_order` / `bo_subject` directly |
| Hint per manual | the small text above the book name |
| Left sidebar per screen (home · manual · board · other) | `hidden` drops the left column at 1280px and wider; the phone menu drawer stays |
| Site texts | logo text, footer, customer-centre lines, home hero title / lead — empty fields keep `theme.config.ts` |

The values reach the screen without a rebuild:

- **Static build (PHP bridge):** `theme/handbook/bridge/render.php` puts them in the
  runtime config (`themeSettings`) on every request. The page first renders the
  `theme.config.ts` defaults while it hydrates, then switches to the saved values.
- **Server runtime (`next start`, Vercel):** the layout reads `theme_settings` from
  `GET /api/v1/settings` (30 s cache). The API returns the settings of its active
  theme (`cf_theme`), and the theme ignores settings saved for another theme. If
  that request fails, the page renders with the defaults until the next fetch.

The browser tab title still comes from gnuboard's site title (`cf_title`).

## Design system

- **Palette**: indigo-on-slate. Set through the shadcn HSL tokens
  (`--primary`, `--background`, …) plus daisyUI v5 `--color-*` overrides,
  scoped to `body[data-g5-theme-source="handbook"]`.
- **Do not** override `--border`, `--color-secondary` or `--color-accent` on the
  body: those names are shared with the app's `globals.css` `@theme` (shadcn) and
  with `hsl(var(--border))` border colours. daisyUI's `--border: 1px` width is
  scoped to daisyUI components only.
- **Radius**: one ramp — `--doc-radius-sm/md/lg/xl/pill`.
- Respects `prefers-reduced-motion`.

## Files

```
theme.config.ts        brand + site metadata
components.tsx          slot wiring
layout-shell.tsx        docs shell (client component)
layout-shell.server.tsx server entry — reads the manual index and admin settings
theme-settings.ts       admin settings: parse, site texts, sidebar screens (pure)
home.tsx               community landing (server component)
shop-home.tsx          shop landing (server component)
theme.css              @imports the CSS below (kept small for the file-size guard)
  theme.tokens.css      design tokens (shadcn HSL + daisyUI vars + radius scale)
  theme.shell.css       top bar / sidebar / footer + reduced-motion
  theme.landing.css     community landing
  theme.shop.css        shop landing product cards
```

## Commands

```bash
# from nextjs/
npm run dev:handbook        # dev server on http://127.0.0.1:3003
npm run dev:manual          # same, manual group `manual`; G5_MANUAL_SITE_URL=<gnuboard url> picks the site
npm run typecheck:handbook  # type-check this theme in isolation
npm run build:handbook      # static export -> theme/handbook/app
npm run package:handbook    # installable theme package
```

> Tip: after `npm run build:handbook`, clear `.next` before `npm run dev:handbook`
> — a `.next` left in production shape makes the dev server fail to resolve the
> theme CSS `@import`s.

## The two halves of a gnuboard theme

A gnuboard theme is **two** directories that must stay in sync:

1. `nextjs/themes/handbook/` — this editable Next.js design source.
2. `theme/handbook/` — the gnuboard PHP bridge/runtime (`theme.php`, `bridge/*.php`,
   `css/handbook.css`, …) that serves the static build (`theme/handbook/app`,
   git-ignored) through `plugin/webapp/bridge/route.php`.

Register the pair in `nextjs/theme-manifest.json` (then `npm run
generate:theme-maps -- --write`). Activate the theme from the gnuboard admin
theme picker (`g5_config.cf_theme = handbook`).

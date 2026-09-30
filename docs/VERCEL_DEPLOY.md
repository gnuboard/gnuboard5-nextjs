# Vercel Deployment Guide

This repository can be deployed to Vercel as one Next.js server-runtime preview
project per theme for an existing Gnuboard5/YoungCart5 server.

Vercel does not replace Gnuboard. PHP, MySQL, administrator PHP pages, payment
modules, and `/api/v1/*` still run on the existing Gnuboard server.

## Current Recommendation

Use one Vercel project per theme:

```text
https://gnuboard5-nextjs-default.vercel.app/   -> nextjs/themes/default, G5_THEME_NAME=nextjs_default
https://gnuboard5-nextjs-greenhub.vercel.app/  -> nextjs/themes/greenhub, G5_THEME_NAME=greenhub
```

Do not deploy these as `/default` and `/greenhub` subpaths under one Vercel
project. Each Vercel project should serve its selected theme from `/`.

The public Vercel projects use the Next.js server runtime by default. Set
`G5_NEXT_RUNTIME=server` and keep Vercel Output Directory blank. Use
`G5_NEXT_RUNTIME=static` with Output Directory `out` only when you intentionally
want a static export preview.

Vercel preview themes are tracked in `nextjs/vercel-theme-map.json`. The
install package map, `nextjs/theme-map.json`, is separate and currently packages
only `nextjs_default <- default` in this public repository. Greenhub can be deployed
to Vercel from `nextjs/themes/greenhub` without being included as a PHP install
theme in the release ZIP. CI and Live QA derive their theme matrix from
`nextjs/vercel-theme-map.json`, so add new preview projects there instead of
hardcoding workflow matrix entries.

If greenhub should later become an installable PHP theme in the release ZIP,
add the generated `overlay/theme/greenhub` files and update
`nextjs/theme-map.json` to include `greenhub <- greenhub`. Until both are true,
greenhub remains a Vercel preview target only.

## Architecture

```text
Browser
  -> Vercel Next.js server runtime
  -> Existing Gnuboard server /api/v1/*
  -> MySQL
```

Dynamic-looking URLs such as `/boards/free`, `/free/123`, and
`/shop/products/123` are rendered by the selected Vercel project at `/`. The
browser uses same-origin `/api/v1` on Vercel preview domains, and the Next.js
server rewrites that proxy path to the configured Gnuboard API URL.

## Import Project

1. Open Vercel and choose **New Project**.
2. Import `gnuboard/gnuboard5-nextjs`.
3. Use the `main` branch.
4. Set the project settings as follows:

```text
Framework Preset: Next.js
Root Directory: nextjs
Build Command: npm run build:vercel
Output Directory: <leave blank>
```

`nextjs/vercel.json` also pins the server-runtime values:

```json
{
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run build:vercel"
}
```

Do not configure Output Directory as `out` for the default server runtime.
That makes Vercel look for static-export output while the Next.js adapter expects
the `.next/routes-manifest.json` produced by a server-runtime build.

## Environment Variables

Add these common variables to each Vercel project:

```text
NEXT_PUBLIC_API_URL=https://your-gnuboard.example.com/gnuboard5/api/v1
# Optional. When omitted, the server runtime proxy falls back to NEXT_PUBLIC_API_URL.
# G5_API_INTERNAL_URL=https://your-gnuboard.example.com/gnuboard5/api/v1
NEXT_PUBLIC_G5_URL=https://your-gnuboard.example.com/gnuboard5
NEXT_IMAGE_EXTRA_HOSTS=your-gnuboard.example.com
```

`NEXT_PUBLIC_API_URL` is browser-visible. `G5_API_INTERNAL_URL` is server-only
for the Next.js server runtime/proxy. In a simple public deployment, omit
`G5_API_INTERNAL_URL` and it will fall back to `NEXT_PUBLIC_API_URL`. Set a
different `G5_API_INTERNAL_URL` only when the server should call a private
origin/internal proxy that browsers should not see.

Default project:

```text
G5_THEME_SOURCE=default
G5_THEME_NAME=nextjs_default
G5_NEXT_RUNTIME=server
NEXT_PUBLIC_APP_URL=https://gnuboard5-nextjs-default.vercel.app
```

Greenhub project:

```text
G5_THEME_SOURCE=greenhub
G5_THEME_NAME=greenhub
G5_NEXT_RUNTIME=server
NEXT_PUBLIC_APP_URL=https://gnuboard5-nextjs-greenhub.vercel.app
```

`NEXT_PUBLIC_APP_URL` must be the Vercel app URL for that project. Do not append
the Gnuboard install subdirectory to it.

GitHub Actions uses repository variables for the same live endpoints. Configure
these under `Settings > Secrets and variables > Actions > Variables`:

```text
LIVE_API_URL=https://your-gnuboard.example.com/gnuboard5/api/v1
LIVE_G5_URL=https://your-gnuboard.example.com/gnuboard5
LIVE_DEFAULT_APP_URL=https://gnuboard5-nextjs-default.vercel.app
LIVE_IMAGE_EXTRA_HOSTS=your-gnuboard.example.com
```

## Local Smoke Test

From the public package repository:

```powershell
cd <배포 저장소>\nextjs
npm ci
npm run check
npm run build:vercel:default
npm run build:vercel:greenhub
```

For a one-off build that matches Vercel, set the same environment variables as
the target Vercel project and run:

```powershell
npm run build:vercel
```

## Gnuboard Server Checklist

The Gnuboard server still needs the release overlay installed:

```text
api/
extend/
theme/nextjs_default/
nextjs-install/
```

When deploying the `greenhub` PHP theme as well, install its generated theme
directory on the Gnuboard server too:

```text
theme/greenhub/
```

Then check that the API responds:

```text
https://your-gnuboard.example.com/gnuboard5/api/v1/status
```

Because the Vercel static frontend calls the Gnuboard API directly from the
browser, the Gnuboard API must allow both Vercel domains through CORS:

```text
G5_CORS_ALLOWED_ORIGINS=https://gnuboard5-nextjs-default.vercel.app,https://gnuboard5-nextjs-greenhub.vercel.app
G5_SOCIAL_WEB_HOSTS=gnuboard5-nextjs-default.vercel.app,gnuboard5-nextjs-greenhub.vercel.app
```

If the frontend and API are on different HTTPS origins and the browser must
send HttpOnly auth cookies across those origins, set:

```text
G5_AUTH_COOKIE_SAMESITE=None
G5_AUTH_COOKIE_SECURE=1
```

For same-origin or reverse-proxy deployments, keep the safer default:

```text
G5_AUTH_COOKIE_SAMESITE=Lax
```

## YoungCart Legacy Routes On Vercel

The static Vercel deployment handles common YoungCart read routes such as:

```text
/shop/list.php?ca_id=2010101010
/shop/item.php?it_id=1446772772
/shop/itemuseform.php?it_id=1446772772
/shop/orderform.php?sw_direct=1&ct_ids=2
/mobile/shop/list.php?ca_id=2010101010
```

Original PHP action and payment URLs, for example `/shop/cartupdate.php` or
`/shop/kcp/order_approval.php`, must still run on the Gnuboard server.

## What To Test On Vercel

Good first checks:

- `/`
- `/boards`
- `/boards/free`
- `/free/aaaaa`
- `/shop`
- `/shop/products`
- `/shop/products/{it_id}`
- `/login`
- `/mypage`

Expected detail fallback behavior:

- Existing prebuilt posts render as static HTML.
- Existing posts that were not prebuilt load through the browser API.
- Missing posts show “게시글을 찾을 수 없습니다”.
- API/network failures show “게시글을 불러오지 못했습니다” and offer a link to
  the original Gnuboard URL.

## Automatic CI

The public repository workflow runs the same static checks and Vercel theme
matrix builds before release:

```text
npm run check
npm run print:vercel-theme-matrix
npm run build:vercel:default
npm run build:vercel:greenhub
```

For new themes, `npm run build:vercel -- --source <source> --name <theme>` is
enough; the workflow reads the list from `nextjs/vercel-theme-map.json`.

The workflow does not hardcode the live Gnuboard host. Keep
`LIVE_API_URL`, `LIVE_G5_URL`, `LIVE_DEFAULT_APP_URL`, and
`LIVE_IMAGE_EXTRA_HOSTS` populated as repository variables before expecting CI
to pass.

For server-runtime detail checks, set these repository variables before treating
the Vercel deployment as healthy:

```text
LIVE_SMOKE_POST_PATH=/free/6
LIVE_SMOKE_POST_TEXT=Sample post title
LIVE_SMOKE_PRODUCT_PATH=/shop/1446772772
LIVE_SMOKE_PRODUCT_TEXT=Sample product name
LIVE_SMOKE_REQUIRE_DETAILS=post,product
```

GitHub Actions defaults `LIVE_SMOKE_REQUIRE_DETAILS` to `post,product`. Use
stable public samples that are not likely to be deleted when you want repeatable
release approval. If the explicit path/text variables are omitted, the strict
Vercel release gate attempts to discover public post and product samples from
`NEXT_PUBLIC_API_URL` before failing.

Manual Live QA URL overrides must also set `theme_source`; this prevents one
temporary URL from accidentally masking every theme job.

## Server Runtime / SSR Auth Mode

Server runtime is a separate deployment shape for testing SSR auth on Vercel.
Do not mix it with the static export settings above.

Set these only in a dedicated server-runtime Vercel project:

```text
G5_NEXT_RUNTIME=server
NEXT_PUBLIC_API_URL=/api/g5
G5_API_INTERNAL_URL=https://your-gnuboard.example.com/api/v1
NEXT_PUBLIC_G5_URL=https://your-gnuboard.example.com
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
NEXT_IMAGE_EXTRA_HOSTS=your-gnuboard.example.com
```

Before enabling this mode, run:

```powershell
cd nextjs
npm run check:server-runtime-build
npm run check:server-runtime-auth
```

For CSP hardening, first deploy with `NEXT_CSP_REPORT_ONLY=1` and
`NEXT_CSP_STRICT=1`. Enforce strict mode only after login, payment, postcode,
editor, and third-party widgets are confirmed on the live domain. The runtime
config inline script is covered by a CSP hash; dynamic JSON-LD scripts are
omitted in enforced strict mode unless `NEXT_CSP_ALLOW_UNSAFE_INLINE=1` is set.

## Known Limitation

Vercel preview mode is not the same as installing the theme inside Gnuboard.

The release ZIP remains the primary production delivery method when you need
the same domain, same PHP session, same cookies, and same web-server rewrite
rules as Gnuboard.

## GitHub Pages

GitHub Pages is not recommended for this project. It is static hosting and does
not run PHP, MySQL, or the Gnuboard API. It also does not provide the rewrite
control this app expects for routes like `/boards/free` and `/shop/products/*`.

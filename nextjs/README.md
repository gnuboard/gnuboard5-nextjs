# Next.js Source

This directory contains the development source for the Gnuboard5
`nextjs_default` theme. It is built as a static export and packaged into
`theme/nextjs_default/app` by the release workflow.

## Local Development

```bash
npm ci
npm run dev
```

Use environment variables to point the frontend at your own Gnuboard install:

```text
NEXT_PUBLIC_API_URL=http://localhost/api/v1
G5_API_INTERNAL_URL=http://localhost/api/v1
NEXT_PUBLIC_G5_URL=http://localhost
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Release Build

```bash
npm ci
npm run check
npm run build
```

The repository-level package script copies `nextjs/out` into the release zip.
Use the public package root `npm run package` command for install ZIPs. The
`nextjs/package:*` commands are source-checkout commands and are guarded here so
they fail with a clear hint instead of looking for missing `theme/<theme>`
directories.

## Vercel Theme Projects

Create one Vercel project per theme. Use **Framework Preset** `Next.js`, keep
**Root Directory** as `nextjs`, **Build Command** as `npm run build:vercel`,
and leave **Output Directory** blank. `vercel.json` pins
`framework: "nextjs"` so Vercel uses the Next.js server adapter.

Vercel preview projects are listed in `nextjs/theme-manifest.json` and generated
into `nextjs/vercel-theme-map.json`. This is separate from installable PHP theme
packages. This public package contains only the themes that are published
(`publicPackage: true`); `nextjs/theme-map.json` lists the installable ones.
CI and Live QA read
`nextjs/vercel-theme-map.json` through
`npm run print:vercel-theme-matrix`, so add new preview themes to the manifest
and run `npm run generate:theme-maps` rather than editing workflow matrix entries
by hand. `npm run check:deploy-config` enforces this split so the release ZIP
does not accidentally claim to install a theme that is only present as a Vercel
preview. A theme can therefore be Vercel-previewable without being part of the
public install ZIP.

The default Vercel build is server runtime. Newly written board posts and shop
products can therefore be rendered on demand by the Next.js server instead of
falling back to static `__g5_static__` placeholder pages. Static export remains
available for installable package checks through `npm run build:vercel:static`.

Before pushing Vercel theme changes, run:

```bash
npm run check:release:vercel
```

This gate runs the repository checks, dependency audit, and every configured
Vercel theme pair in both server runtime and static preview modes. It requires
the production URL variables used by Vercel, including `NEXT_PUBLIC_API_URL`,
`G5_API_INTERNAL_URL`, `NEXT_PUBLIC_G5_URL`, and `NEXT_IMAGE_EXTRA_HOSTS` when
remote Gnuboard uploads are served from a separate host. Copy
`.env.vercel.local.example` to `.env.vercel.local` for local release checks;
that ignored file is loaded after `.env.local` so local HTTP development values
do not leak into the Vercel gate. Shell variables still win over all env files,
and `G5_RELEASE_ENV_FILE=/path/to/file` can point the gate at another final
override file. Browser smoke steps retry once by default to absorb transient
hydration or remote API timing hiccups; set `VERCEL_RELEASE_SMOKE_RETRIES=0`
for a strict single attempt.
Use `npm run check:release:vercel:strict` when you want that strict smoke
policy and live detail samples. Stable `SERVER_RUNTIME_SMOKE_*` or
`LIVE_SMOKE_*` values are recommended for release approval, but when the
path/text values are omitted the gate attempts to discover public post and
product samples from `NEXT_PUBLIC_API_URL`. Set
`VERCEL_RELEASE_REQUIRE_EXPLICIT_SMOKE=1` when release approval must use only
configured path/text samples and must not discover samples from the remote API.
Use `npm run check:release` when you need a code gate plus offline static export
smoke check that does not depend on a reachable Gnuboard API. For targeted
diagnosis, use `npm run check:release:preflight`,
`npm run check:release:quality`, `npm run check:release:smoke`, or
`npm run check:release:builds`.

`npm run check:file-size` treats the files in
`scripts/source-file-size-baseline.json` as refactor debt. The check passes while
they stay at or below their recorded line counts, and fails if they grow before
being split.

Server runtime smoke checks cover stable public routes by default. Set
`SERVER_RUNTIME_SMOKE_POST_PATH`, `SERVER_RUNTIME_SMOKE_POST_TEXT`,
`SERVER_RUNTIME_SMOKE_PRODUCT_PATH`, and `SERVER_RUNTIME_SMOKE_PRODUCT_TEXT`
when the target site has known sample detail data. Set
`SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS=post,product` when CI must verify detail
pages. If the explicit path/text variables are empty, the Vercel release gate
discovers public detail samples from `NEXT_PUBLIC_API_URL` before failing.
GitHub Actions maps the matching repository variables
`LIVE_SMOKE_POST_PATH`, `LIVE_SMOKE_POST_TEXT`, `LIVE_SMOKE_PRODUCT_PATH`,
`LIVE_SMOKE_PRODUCT_TEXT`, and `LIVE_SMOKE_REQUIRE_DETAILS`.

Optional CSP hardening:

```text
NEXT_CSP_REPORT_ONLY=1
NEXT_CSP_STRICT=1
```

Start with report-only mode, then enforce strict mode after login, payment,
postcode, editor, and third-party widgets are checked on the live domain. The
runtime config inline script can be covered by a CSP hash, but Next.js may still
emit required inline bootstrap scripts. Keep `NEXT_CSP_ALLOW_UNSAFE_INLINE=1`
until those reports are clean.

Default theme:

```text
G5_THEME_SOURCE=default
G5_THEME_NAME=nextjs_default
G5_NEXT_RUNTIME=server
NEXT_PUBLIC_APP_URL=https://gnuboard5-nextjs-default.vercel.app
```

Set `G5_NEXT_RUNTIME=server` for both Production and Preview in every Vercel
project. Vercel can evaluate Next config and server components outside the
child build process, so the project environment must carry the runtime value.
An intentionally static Vercel project must instead set
`G5_NEXT_RUNTIME=static` and use `Output Directory: out`.

All theme projects also need the same Gnuboard/API variables:

```text
NEXT_PUBLIC_API_URL=https://your-gnuboard.example.com/api/v1
# Optional. When omitted, the server runtime proxy falls back to NEXT_PUBLIC_API_URL.
# G5_API_INTERNAL_URL=https://your-gnuboard.example.com/api/v1
NEXT_PUBLIC_G5_URL=https://your-gnuboard.example.com
NEXT_PUBLIC_AUTH_MODE=g5-jwt
NEXT_PUBLIC_GALLERY_BOARDS=n_gallery,gallery
NEXT_IMAGE_EXTRA_HOSTS=your-gnuboard.example.com
```

`NEXT_PUBLIC_API_URL` and `G5_API_INTERNAL_URL` are intentionally separate.
`NEXT_PUBLIC_API_URL` is embedded in browser-visible runtime config, so it must
be a public HTTPS API URL that end users can reach. `G5_API_INTERNAL_URL` is
server-only and is used by the Next.js server runtime/proxy when it calls the
PHP API. If both URLs are identical, omit `G5_API_INTERNAL_URL` and the server
runtime will fall back to `NEXT_PUBLIC_API_URL`. Set a different
`G5_API_INTERNAL_URL` only when the server can reach a private origin, internal
DNS name, or closer proxy that browsers should not see.

`npm run check:api-vercel-env` verifies that every Vercel theme project listed
in `nextjs/vercel-theme-map.json` is also present in the public API example
allowlists in `overlay/api/env.example`.

GitHub Actions uses repository variables for the same live endpoints. Configure
these under `Settings > Secrets and variables > Actions > Variables`:

```text
LIVE_API_URL=https://your-gnuboard.example.com/api/v1
LIVE_G5_URL=https://your-gnuboard.example.com
LIVE_DEFAULT_APP_URL=https://gnuboard5-nextjs-default.vercel.app
LIVE_IMAGE_EXTRA_HOSTS=your-gnuboard.example.com
```

On Vercel preview domains (`*.vercel.app`), browser-side API requests use the
same-origin `/api/v1` proxy automatically. In server runtime, `next.config.ts`
rewrites that path to `G5_API_INTERNAL_URL` when set, otherwise to
`NEXT_PUBLIC_API_URL`. For custom Vercel domains, set
`NEXT_PUBLIC_API_PROXY_PATH=/api/v1` to force the same browser proxy path.

Live SSH deployment scripts are intentionally not shipped in this public
overlay repository. Publish by pushing a version tag and using GitHub Releases.

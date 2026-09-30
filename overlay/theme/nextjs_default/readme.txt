Theme Name: Next.js Default
Theme URI: https://github.com/gnuboard/gnuboard5-nextjs
Maker: SIR Soft
Maker URI: https://sir.kr
Version: 0.1.0
Detail: Next.js Default — static Next.js compatibility theme for Gnuboard5 and YoungCart5.
License: LGPL-2.1-or-later
License URI: https://github.com/gnuboard/gnuboard5-nextjs/blob/main/LICENSE

Static export install notes:
0. Two packages, both unzipped at the Gnuboard root (next to common.php):
   - gnuboard5-webapp-core.zip -> api/, plugin/webapp/, extend/webapp.extend.php
                                  (once per site; shared by every Next.js theme)
   - <name>-theme.zip          -> theme/<name>/ only
   Then open /api/v1/status: database.ok and schema.ok must be true.
   api/.env is optional: a same-origin install needs nothing. Copy
   api/env.example only when the app or a mobile client runs on another origin.
   Nothing else in the Gnuboard tree needs to change. Verified on a stock
   Gnuboard 5.6.3.9.1 install in a sub-folder.
   The static app is portable: one build works at the Gnuboard root or in any
   sub-folder (/gnu5512, /site/blog, ...). Do not rebuild per site and do not
   define G5_*_ALLOWED_HOSTS / G5_WEBAPP_APP_URL for a normal install; the PHP
   bridge derives every URL from Gnuboard's own G5_URL.
1. For an end-user install, use the GitHub Release zip at the Gnuboard root.
   When developing from the source checkout, build the app with:
   cd nextjs
   npm run build:theme
2. Tables are created by the API itself on first request (schema self-check);
   /adm/dbupgrade.php does the same thing if you prefer.
3. Select this theme in the Gnuboard administrator theme screen. On Apache
   this rewrites the Gnuboard block of .htaccess (and shop/.htaccess) for the
   new theme; on Nginx copy the code from 기본환경설정 > 짧은 주소 설정.
4. The rewrite rules point at plugin/webapp/bridge/route.php so the active
   administrator theme selects the matching Next.js bridge. The example file
   apache-rewrite.example.conf is the same set of rules for reference.
5. Verify the local release gate before packaging:
   npm run check:release:local
   npm run check:release:local:full
6. Verify the active site with legacy short URLs:
   /free
   /free/{wr_id}
   /shop/list-{ca_id}
   /shop/{it_id}
   /mobile/shop
   /mobile/shop/item.php?it_id={it_id}
   /mobile/shop/itemqa.php?it_id={it_id}
   /mobile/shop/itemuse.php?it_id={it_id}
   /mobile/shop/personalpayform.php?pp_id={pp_id}

Nginx notes:
- Nginx does not read .htaccess, so nothing from it applies there. That is fine:
  the rules from 기본환경설정 > 짧은 주소 설정 send /_next/*, *.txt, robots.txt,
  manifest and sw.js to plugin/webapp/bridge/route.php, and the theme bridge
  sets the headers itself (hashed /_next/static/* files: one year, immutable;
  HTML and .txt: must-revalidate; sw.js, manifest, robots.txt: max-age=0).
  No extra cache block is needed.
- Do NOT serve /_next/static/ straight from theme/<name>/app with alias,
  root or try_files. The build is portable: some chunks carry a /__g5base__
  placeholder that the bridge replaces with the install folder on the way out.
  Served raw, the page loads but links and navigation break, even at the root.
- If you add your own `location ^~ /_next/` block (for example for gzip or
  logging), keep it ending in the bridge:
      location ^~ /_next/ {
          rewrite ^ /plugin/webapp/bridge/route.php last;
      }
  In a sub-folder install, put the folder in front of both paths
  (/gnu5/_next/ and /gnu5/plugin/webapp/bridge/route.php).
- Check it: curl -I https://your-site/_next/static/chunks/<any>.js should show
  "Cache-Control: public, max-age=31536000, immutable".

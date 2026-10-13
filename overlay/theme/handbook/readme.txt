Theme Name: Next.js Handbook
Theme URI: https://github.com/gnuboard/gnuboard5-nextjs
Maker: SIR Soft
Maker URI: https://sir.kr
Version: 0.1.0
Detail: Next.js Handbook — manual / documentation site theme for Gnuboard5 and YoungCart5. Boards in one board group become manuals, board categories become parts, posts become chapters.
License: LGPL-2.1-or-later
License URI: https://github.com/gnuboard/gnuboard5-nextjs/blob/main/LICENSE

Static export install notes:
0. Same install as the other Next.js themes: unzip the release at the Gnuboard
   root (next to common.php). It puts api/, plugin/webapp/,
   extend/webapp.extend.php and every Next.js theme under theme/<name>/.
   Then open /api/v1/status: database.ok and schema.ok must be true.
   The static app is portable: one build works at the Gnuboard root or in any
   sub-folder (/gnu5512, /site/blog, ...). Do not rebuild per site; the PHP
   bridge derives every URL from Gnuboard's own G5_URL.
1. Select this theme in the Gnuboard administrator theme screen. On Apache
   this rewrites the Gnuboard block of .htaccess (and shop/.htaccess) for the
   new theme; on Nginx copy the code from 기본환경설정 > 짧은 주소 설정.
   apache-rewrite.example.conf is the same set of rules for reference.
2. Build the manuals from boards: one board group = the manual shelf, one
   board = one manual, board categories = parts, posts = chapters (the board
   list order is the chapter order; set it on the chapter order screen below —
   new posts land first).
3. Open 환경설정 > 테마 화면 설정 (/adm/view.php?call=theme_settings, super
   admin only). Pick the manual board group, set the manual order, names and
   hints, set each manual's chapter order (the 순서 link), choose per screen
   whether the left sidebar shows on wide screens, and fill in the site texts
   (logo, home, footer). Saved values show up on the next page load; no
   rebuild.
4. Menu items come from 환경설정 > 메뉴설정, as with the other themes.
5. When developing from the source checkout, build the app with:
   cd nextjs
   npm run build:handbook

Nginx notes: same as theme/nextjs_default/readme.txt — send /_next/* and the
other app paths to plugin/webapp/bridge/route.php and do not serve
theme/<name>/app/_next/static straight from disk.

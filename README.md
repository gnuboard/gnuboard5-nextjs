# gnuboard5-nextjs

그누보드5 · 영카트5 에 얹는 **Next.js 프론트엔드 한 벌**입니다.

- **Next.js 테마** — `theme/nextjs_default` ("Next.js Default"). 커뮤니티 첫 화면 · 게시판 · 회원 ·
  마이페이지 · 쇼핑몰(상품 · 장바구니 · 주문 · 결제)까지 정적 앱으로 빌드되어 그누보드 테마로 설치됩니다.
- **REST API** — `api/v1` (JWT 인증, 게시판 · 회원 · 쇼핑몰 · 결제). 모바일 앱이나 다른 프론트엔드도 쓸 수 있습니다.
- **연결 코어** — `plugin/webapp` + `extend/webapp.extend.php`. 그누보드 원본 파일은 고치지 않습니다.

한 번 빌드한 테마가 루트 설치와 하위 폴더 설치에서 모두 동작합니다.

## 테마 데모

- <https://thisgun3.mycafe24.com/> — 그누보드에 테마를 설치한 사이트
- <https://gnuboard5-nextjs-demo.vercel.app/> — 같은 테마를 Vercel 에 띄운 데모(데이터는 위 사이트의 API)

## 설치

GitHub 가 자동으로 만드는 소스 압축(Source code)이 아니라 **Releases 의 zip** 을 받으세요.

```text
gnuboard5-nextjs-vX.Y.Z.zip
```

zip 은 그누보드 루트와 같은 모양이고, 애드온 파일만 들어 있습니다.

```text
api/
plugin/webapp/
theme/nextjs_default/
extend/webapp.extend.php
nextjs-install/
INSTALL.md
```

설치 순서는 [INSTALL.md](INSTALL.md) 를 보세요. 요약하면: 그누보드 루트에 풀고 → `/api/v1/status` 확인 →
관리자 > 환경설정 > 테마설정에서 **Next.js Default** 를 적용합니다.

## Repository layout

```text
nextjs/                 Next.js source (theme source: nextjs/themes/default)
overlay/                Files copied into a Gnuboard root by the release zip
  api/
  plugin/webapp/
  theme/nextjs_default/
  extend/webapp.extend.php
nextjs-install/         SQL and web-server rules for manual installation
scripts/                Sync and release packaging scripts
.github/workflows/      CI and GitHub Release automation
```

## Build a release locally

```bash
cd nextjs
npm ci
npm run build
cd ..
npm run package -- v0.1.0
```

The package script writes `dist/` and `gnuboard5-nextjs-v0.1.0.zip`.

## How this repository is updated

This repository is generated from the maintainer's development checkout with
`npm run sync -- <path-to-source-checkout>`. The sync copies only the themes
marked `publicPackage: true` in the source theme manifest, strips development-only
tooling, and fails if a non-public theme name or a local development trace
(local paths, local virtual-host addresses) would be published.
Please open issues and pull requests here; changes are ported back to the
development source before the next sync.

## License

Copyright (C) 2026 SIR Soft ((주)에스아이알소프트, https://sir.kr). Licensed under the GNU Lesser General Public License
v2.1 or (at your option) any later version — see [LICENSE](LICENSE).

The license covers the files authored in this repository (`nextjs/`, `overlay/`,
`nextjs-install/`, `scripts/` and the documentation). It does not cover:

- Gnuboard5 / YoungCart5 itself, which is not part of this repository. Its license
  (also LGPL-2.1) is reproduced in [LICENSE.gnuboard.txt](LICENSE.gnuboard.txt).
- Third-party JavaScript dependencies, governed by their own licenses as recorded in
  `nextjs/package-lock.json`.

# Gnuboard5 Next.js25 Deploy Checklist

이 문서는 `gnuboard5-nextjs`를 GitHub/Vercel과 실제 그누보드 PHP 서버에 나누어 배포할 때 빠뜨리기 쉬운 항목을 확인하기 위한 체크리스트입니다.

## 1. GitHub / Vercel 배포

1. 로컬 소스 저장소에서 필요한 변경을 커밋한다.
2. `<배포 저장소>` 배포 저장소에 동기화한다.
3. 배포 저장소에서 아래 검증을 통과시킨다.

```powershell
cd <배포 저장소>\nextjs
npm run check
npm run print:vercel-theme-matrix
npm run build:vercel:default
npm run build:vercel:greenhub
cd ..
npm run package:verify
```

4. 배포 저장소 `main` 브랜치에 push한다.
5. Vercel 배포가 성공했는지 확인한다.

```text
https://gnuboard5-nextjs-default.vercel.app/
https://gnuboard5-nextjs-greenhub.vercel.app/
```

## 2. Vercel 프로젝트 설정

테마마다 Vercel 프로젝트를 하나씩 만든다. `/default`, `/greenhub` 같은 하위 경로로 나누지 않는다.

공통 설정:

```text
Framework Preset: Next.js
Root Directory: nextjs
Build Command: npm run build:vercel
Output Directory: <leave blank>
G5_NEXT_RUNTIME=server
```

`nextjs/vercel.json` is generated for the default Next.js server runtime.
Leave Vercel Output Directory blank. Use `Output Directory: out` only when the
project is intentionally switched to `G5_NEXT_RUNTIME=static` for a static
export preview.

`nextjs/vercel.json`도 위 설정을 고정하므로, Vercel 대시보드 값과 다르게 두지 않는다.
Vercel 프로젝트 목록은 `nextjs/vercel-theme-map.json`에 기록한다. 설치 ZIP에
포함되는 PHP 테마 목록은 별도 파일인 `nextjs/theme-map.json`이 관리한다.
현재 공개 패키지는 기본 설치 테마로 `nextjs_default <- default`만 포함하고,
greenhub는 Vercel preview 빌드 대상으로만 둔다. CI와 Live QA는
`nextjs/vercel-theme-map.json`에서 matrix를 읽으므로 새 preview 테마를 추가할 때
workflow YAML에 default/greenhub 목록을 직접 늘리지 않는다.

default 프로젝트 환경 변수:

```text
G5_THEME_SOURCE=default
G5_THEME_NAME=nextjs_default
G5_NEXT_RUNTIME=server
NEXT_PUBLIC_APP_URL=https://gnuboard5-nextjs-default.vercel.app
```

greenhub 프로젝트 환경 변수:

```text
G5_THEME_SOURCE=greenhub
G5_THEME_NAME=greenhub
G5_NEXT_RUNTIME=server
NEXT_PUBLIC_APP_URL=https://gnuboard5-nextjs-greenhub.vercel.app
```

공통 환경 변수:

```text
NEXT_PUBLIC_API_URL=https://your-gnuboard.example.com/gnuboard5/api/v1
# Optional. When omitted, the server runtime proxy falls back to NEXT_PUBLIC_API_URL.
# G5_API_INTERNAL_URL=https://your-gnuboard.example.com/gnuboard5/api/v1
NEXT_PUBLIC_G5_URL=https://your-gnuboard.example.com/gnuboard5
NEXT_IMAGE_EXTRA_HOSTS=your-gnuboard.example.com
```

`NEXT_PUBLIC_API_URL` is browser-visible. `G5_API_INTERNAL_URL` is server-only
for the Next.js server runtime/proxy. Keep both values the same for simple
public deployments, or omit `G5_API_INTERNAL_URL` to fall back to
`NEXT_PUBLIC_API_URL`. Use a different `G5_API_INTERNAL_URL` only for a private
origin/internal proxy that browsers should not see.

## 3. PHP API 서버 업로드

GitHub/Vercel 배포만으로는 그누보드 PHP API 서버가 바뀌지 않는다. API 변경이 있으면 아래 로컬 폴더의 내용을 실제 서버의 `/gnuboard5/api`에 반영해야 한다.

```text
<배포 저장소>\dist\api
```

서버 위치 예:

```text
/gnuboard5/api
```

`.env` 파일은 서버 설정 파일이다. 배포본의 `env.example`은 참고용이고, 서버의 실제 `api/.env`를 실수로 삭제하거나 덮어쓰지 않는다.

## 4. API 최신화 확인

먼저 상태 API를 확인한다.

```text
https://your-gnuboard.example.com/gnuboard5/api/v1/status
```

정상 예:

```text
deploy_signature: 2026-06-04-recent-fallback-status-v1
database.ok: true
config.api_env_present: true
config.cors_allowed_origins_configured: true
config.social_web_hosts_configured: true
```

If the frontend and API are deployed on different HTTPS origins and the browser
must send HttpOnly auth cookies across those origins, confirm `api/.env`
contains:

```text
G5_AUTH_COOKIE_SAMESITE=None
G5_AUTH_COOKIE_SECURE=1
```

For same-origin or reverse-proxy deployments, keep the safer default:

```text
G5_AUTH_COOKIE_SAMESITE=Lax
```

If PHP is behind a remote load balancer, Cloudflare tunnel, or another
non-loopback reverse proxy, set the proxy addresses that PHP sees in
`REMOTE_ADDR`:

```text
G5_TRUSTED_PROXY_REMOTE_ADDRS=10.0.0.10,172.16.0.5
```

Leave this blank when nginx and PHP-FPM are on the same host and PHP sees
`127.0.0.1` or `::1`. Do not put arbitrary client IP ranges here.

상태 API가 `501 Handler not implemented` 또는 `404`이면 서버의 `api/index.php` 또는 `api/v1/status.php` 업로드가 누락된 것이다.

## 5. 최신글 API 확인

게시판에는 글이 있는데 메인 최신글이 비어 있으면 아래 주소를 먼저 확인한다.

```text
https://your-gnuboard.example.com/gnuboard5/api/v1/recent?limit=10
```

빈 배열이 나오면 서버의 아래 파일이 최신인지 확인한다.

```text
/gnuboard5/api/v1/recent.php
```

로컬 배포본 기준 파일:

```text
<배포 저장소>\dist\api\v1\recent.php
```

특히 그누보드 게시판 설정에서 `bo_use_search=0`이어도, `g5_board_new`가 비어 있는 서버에서는 최신글 fallback이 글 수가 있는 게시판을 읽을 수 있어야 한다.

## 6. 소셜 로그인 / 회원가입 확인

카카오, 네이버 등 소셜 로그인은 다음 순서로 확인한다.

1. 소셜 시작 URL debug가 성공하는지 확인한다.

```text
https://your-gnuboard.example.com/gnuboard5/api/social/start.php?provider=kakao&redirect=https%3A%2F%2Fgnuboard5-nextjs-default.vercel.app%2Flogin%2Fsocial-callback%3Fredirect%3D%252F&debug=1
```

2. `allowed_hosts`에 Vercel 도메인이 포함되는지 확인한다.
3. `/register`에서 소셜 회원가입 화면이 뜨는지 확인한다.
4. 소셜 회원가입 화면에서 새로고침해도 일반 회원가입으로 바뀌지 않는지 확인한다.
5. 소셜 회원가입에서는 아이디, 비밀번호, 비밀번호 확인 입력칸이 보이지 않아야 한다.
6. `기존 계정에 연결하기` 모달에서 기존 그누보드 계정으로 연결되는지 확인한다.

Automated guards only verify redirect allowlists and bridge-state shape. Before
calling a release complete, sign in through each enabled provider dashboard
flow on the real production domain and confirm `/login/social-callback`
receives and exchanges a one-time ticket exactly once.

## 6-1. PG callback confirmation

Automated payment tests cover the local KCP, KG Inicis, Nicepay, Toss, cancel,
and return handlers, but the live release still needs merchant-console checks:

1. Confirm each enabled PG console has the live return/callback URLs pointed at
   the production Gnuboard host.
2. Run one approved test payment, one cancel/fail return, and one mobile return
   for each enabled PG service.
3. Confirm the order status, cart rows, coupon usage, point usage, receipt data,
   and payment log match the original YoungCart rules after the callback.
4. Confirm `/shop/kcp/*`, `/shop/inicis/*`, `/shop/nicepay/*`, `/shop/toss/*`,
   and `/mobile/shop/toss/*` remain PHP passthrough routes, not Next shell
   responses.
5. Confirm a live personal-pay start lands on
   `/shop/personalpayform.php?pp_id=...&g5_nextjs25_passthrough=1` and renders
   the original YoungCart payment form rather than returning to the Next
   confirmation screen.

## 7. URL 회귀 확인

다음 문제가 다시 나오지 않는지 확인한다.

```text
/gnuboard5/gallery
/gnuboard5/shop/...
Product not found.
상품목록을 찾을 수 없습니다.
```

게시글과 상품 링크는 Vercel 도메인에서 아래처럼 보여야 한다.

```text
https://gnuboard5-nextjs-default.vercel.app/gallery/...
https://gnuboard5-nextjs-greenhub.vercel.app/shop/...
```

Vercel static export는 빌드 시점에 생성되지 않은 상세 페이지를 브라우저에서 API로 다시 불러온다. 존재하지 않는 글은 “게시글을 찾을 수 없습니다”로, API 장애는 “게시글을 불러오지 못했습니다”로 구분되어야 한다.

## 8. 현재 자주 빠지는 파일

최근 작업 기준으로 서버 업로드에서 자주 빠진 파일은 아래다.

```text
api/index.php
api/v1/status.php
api/v1/recent.php
api/social/_bridge_common.php
api/social/start.php
api/social/popup.php
api/social/signup.php
api/v1/auth.php
```

문제가 이상하게 반복되면 전체 `dist/api`를 다시 올리는 것보다, 먼저 위 파일들이 실제 서버에 최신으로 존재하는지 확인한다.

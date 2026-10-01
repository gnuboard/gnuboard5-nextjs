# API Environment Settings

Copy `env.example` to `.env` on the Gnuboard server. The release `dist/api`
folder does not include `.env`, so create it manually after uploading the API
files:

```text
G5_CORS_ALLOWED_ORIGINS=https://your-project.vercel.app,https://gnuboard5-nextjs-greenhub.vercel.app
G5_SOCIAL_WEB_HOSTS=your-project.vercel.app,gnuboard5-nextjs-greenhub.vercel.app
G5_SOCIAL_MOBILE_SCHEMES=dday-app
```

Use comma-separated origins for multiple frontends:

```text
G5_CORS_ALLOWED_ORIGINS=https://your-project.vercel.app,https://gnuboard5-nextjs-greenhub.vercel.app,https://www.example.com
```

Do not add a trailing slash. This is correct:

```text
https://your-project.vercel.app
```

This is not:

```text
https://your-project.vercel.app/
```

For the split Vercel theme projects used by this package, the file should look like this:

```text
G5_CORS_ALLOWED_ORIGINS=https://your-project.vercel.app,https://gnuboard5-nextjs-greenhub.vercel.app,http://localhost,http://localhost,http://127.0.0.1:3001,http://127.0.0.1:3002,http://127.0.0.1:3003,http://localhost:3000
G5_SOCIAL_WEB_HOSTS=your-project.vercel.app,gnuboard5-nextjs-greenhub.vercel.app
G5_SOCIAL_MOBILE_SCHEMES=dday-app
```

For a split HTTPS deployment where the Next.js app and PHP API are on different
origins and you want browser-managed HttpOnly cookies to travel with
`credentials: include`, set:

```text
G5_AUTH_COOKIE_SAMESITE=None
G5_AUTH_COOKIE_SECURE=1
```

If social login still says `Disallowed redirect host`, open the start URL with
`debug=1` added and check `allowed_hosts`. The Vercel host must be listed there.

Example:

```text
https://your-gnuboard.example.com/api/social/start.php?provider=naver&redirect=https%3A%2F%2Fyour-project.vercel.app%2Flogin%2Fsocial-callback%3Fredirect%3D%252F&debug=1
```

## Deployment Status Check

After uploading `dist/api` to the Gnuboard server, open:

```text
https://your-gnuboard.example.com/api/v1/status
```

For the Vercel demo API server:

```text
https://your-gnuboard.example.com/api/v1/status
```

The response should include `deploy_signature:
2026-06-04-recent-fallback-status-v1`. If it does not, the server is still
running an older API upload.

Apache installs are protected by this directory's `.htaccess`, which denies
direct access to `.env` files. nginx does not read `.htaccess`, so add a server
rule like this if the site is served by nginx:

```nginx
location ~ ^/api/\.env {
    deny all;
    return 404;
}
```

## 모바일 앱(dday-app)이 기대는 계약 — 바꾸기 전에 앱 담당과 맞출 것

스토어에 나간 앱이 다음 응답 모양·순서에 의존한다. 필드를 빼거나 이름을 바꾸면 앱이 조용히 깨진다.

| 엔드포인트 | 앱이 읽는 것 |
|---|---|
| `GET /v1/auth/me` | 최상위 `legal_consent` = `{terms_version, privacy_version, accepted_at}` 또는 `null`. 로그인 직후 이걸 보고 약관 재동의 화면을 건너뛴다. `null` 이면 동의 화면. |
| `POST /v1/members/me/legal-consent` | `{terms_version, privacy_version, accepted_at}` → **201** `{legal_consent}`. 버전은 형식만 검사(`[A-Za-z0-9._-]{1,32}`). |
| `GET /v1/auth/preferences` · `PATCH` | `locale, tz` + `notify_*` 6개(boolean). PATCH 는 **부분 갱신**, 응답은 항상 전체. tz 는 PHP 가 아는 이름이면 통과(GMT 포함). |
| `GET /v1/notifications` | 항목의 `nt_event`, `nt_type`(dday/system/custom), `nt_data`(link, dday_id …), `dday_id`(옛 앱용, nt_data 에서 파생), `is_read`. `?event=` 필터. |
| `GET /v1/notifications/events` | `[{event, total, unread}]` — **최근 발생 순**, 알림함에 있는 것만. 앱 칩 순서가 이 순서다. |
| `GET /v1/notifications/unread-count` | `{unread_count}` |
| `POST /v1/push-tokens` | `{push_token, platform}` → 갱신/등록. |
| Expo 푸시 | `data` = 알림함 `nt_data`(`type`, `link` …), `channelId` ∈ default/system/custom — 앱이 이 세 채널을 만든다. |
| `GET/POST/PATCH /v1/ddays` | `dday_repeat` ∈ `once`/`monthly`/`yearly`(모르는 값은 `once`). 계산 옵션 `dday_count_from_one`·`dday_lunar`·`dday_milestones`·`dday_months`(boolean, 음력은 `yearly` 에만, 개월 수는 `once` 에만). 응답은 컬럼이 있을 때만 이 필드를 싣는다 — 없으면 앱이 기기 값을 지킨다. PATCH 는 보낸 필드만 바꾼다. 음력 행은 서버 `next_occurrence` 가 양력 기준이라 앱이 스스로 계산하고, 서버 D-day 푸시(`send_dday_push.php`)도 건너뛴다. 스키마는 `dday_admin_dbupgrade`(관리자 DB 업그레이드). |
| `POST /v1/ddays/local-schedule` | 앱 1.8. `{push_token, tz, entries: [{id, date, repeat, notify, from, until}]}` — 이 기기가 로컬 알림으로 직접 울리는 디데이와 그 기간(`from`~`until`, until 이 null 이면 끝까지). `from` 은 보통 보고한 날이고, 그날 알림 시각 뒤에 디데이를 만들었거나 고쳤으면 다음 날이다. 본인 계정에 등록된 토큰만(아니면 404). `send_dday_push.php` 는 `tz` 가 회원 설정 시간대와 같고, 항목의 날짜·반복·알림 날짜가 지금 행과 같고, `from` ≤ 오늘 ≤ `until` 이면 그 기기에 보내지 않는다. 보고가 없는 기기는 예전 규칙(14일 넘게 안 연 기기에만). 표 `user_dday_local` 은 `dday_admin_dbupgrade` 가 만든다. |
| `/app/post/<board>/<wr_id>`, `/app/dday/<id>`, `/app/board/<board>` | 앱 공유 링크가 만드는 주소. 앱 `linkingConfig` 와 같은 모양. `plugin/webapp/bridge/app-link.php`. |

### 로그인과 그누보드 세션 (2026-09-22)

`POST /v1/auth/login`(비밀번호·소셜 완료 포함)이 성공하면 JWT 쿠키와 **함께 그누보드 PHP 세션(`ss_mb_id`)도 연다** —
`bbs/login_check.php` 와 같은 세 줄. 같은 origin 에서 Next 화면으로 로그인한 관리자가 `/adm` 에 바로 들어갈 수 있다.
다른 origin(Vercel 프론트, 앱)에서는 세션 쿠키가 안 붙을 뿐이다. `POST /v1/auth/logout` 은 그 세션도 닫는다.

### 세션을 끊으면 바로 끊긴다 (2026-10-01)

로그인 한 번 = `g5_refresh_token.session_family` 번호 하나(회전해도 그대로). 액세스 토큰(JWT)에 `sid` 로 싣고
`Auth::getUser()` 가 요청마다 그 번호의 active 행이 있는지 본다 — 마이페이지 세션 목록(`POST /v1/auth/sessions/revoke`)·
전체 로그아웃·비밀번호 변경으로 끊긴 기기는 액세스 토큰 만료(30분)를 기다리지 않고 **다음 요청부터 401** 이다.
같이 열린 그누보드 세션에는 `ss_api_sid` 로 번호를 적어 두고 `plugin/webapp/bridge/api_session.php` 가 매 요청 확인해
`/adm` 도 그 자리에서 닫는다(세션 저장 방식과 무관).

- 비밀번호 변경(`PATCH /v1/members/me`)은 **그 요청을 보낸 기기만 남기고** 나머지를 끊는다.
- 서버가 끊은 토큰은 `revoked_remotely = 1` — 끊긴 기기가 그 리프레시 토큰을 다시 내밀어도 재사용 감지(전 세션 폐기)로
  보지 않고 거절만 한다. 회전된 토큰·본인이 로그아웃한 토큰의 재제시는 종전대로 재사용 감지다.
- `sid` 가 없는 토큰(칸이 생기기 전 발급분)은 종전대로 서명·만료만 본다. 칸은 `Schema::ensure()` 가 만든다.

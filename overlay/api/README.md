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
| `GET /v1/auth/preferences` · `PATCH` | `locale, tz` + `notify_*`(boolean) — core 5개(comment · reply · message · inquiry · system)에 제품 플러그인 항목이 더해진다(`notify_dday` 는 plugin/dday · plugin/baby 가 있을 때). `notify_options: [{key, label, hint}]` 는 그 목록(웹이 그린다). PATCH 는 **부분 갱신**, 응답은 항상 전체. tz 는 PHP 가 아는 이름이면 통과(GMT 포함). 항목은 replace 훅 `webapp_notify_pref_items` 로 더한다(plugin/webapp/notify/Prefs.php). |
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

## 그누보드 훅 — 원본 화면과 같은 훅을 API 동작에서도 부른다 (2026-10-02)

그누보드 플러그인은 `add_event` / `add_replace` 로 원본 화면(`bbs/*.php`)의 훅에 붙는다. API 가 같은 동작을 하면서
훅을 부르지 않으면 그 플러그인은 새 화면 · 앱에서 빠지므로, API 는 **같은 훅 이름 · 같은 인자 순서**로 부른다.
부르는 길은 `api/lib/hooks.php` 의 `api_run_before_event()` · `api_run_event()` · `api_run_replace()` 셋이다.
라우트에서 원본 `run_event()` · `run_replace()` 를 바로 부르지 않는다. 그누보드 원본 파일은 고치지 않는다.

- 훅 함수가 찍는 출력은 버린다(JSON 이 깨지지 않게). 저장 뒤 훅 함수가 실패(예외)해도 요청은 그대로 끝나고 `error_log` 에만 남는다.
  저장 전 훅(`api_run_before_event`)이 실패하면 검사를 건너뛴 채 저장하지 않도록 JSON 500 으로 멈춘다.
- 도는 동안 전역 `$member` · `$is_member` · `$is_guest` · `$is_admin` 을 그 동작의 회원으로 둔다(앱 · 다른 주소의 프론트는 PHP 세션이 없다).
  회원을 넘기지 않은 훅(가입 전 검사, 비회원 주문조회)은 **비회원**으로 본다 — 앞 요청의 회원이 남아 보이지 않게. 끝나면 원래 값으로 되돌린다.
- 원본에서 이동할 주소(`$link`, `$redirect_url`)를 넘기는 자리에는 빈 값을 넘긴다 — API 는 이동하지 않는다.
- 플러그인이 원본 화면처럼 `alert()` · `alert_close()` · `goto_url()` 로 멈추면:
  - **`*_before` · `*_valid` 훅**(`api_run_before_event`) — 요청을 막는다. `alert` 메시지를 그대로 담아 JSON 403 으로 답한다
    (`{"success":false,"message":"금지어가 들어 있습니다."}`). 그래서 이 훅들은 되돌릴 수 없는 일(토큰 발급 · 가입 ticket 소비 · 저장) **앞**에서 부른다.
  - **그 밖의 훅** — 이미 끝난 동작을 되돌리지 않는다. 그 훅만 멈추고 `error_log` 에 남긴 뒤 요청은 성공으로 끝난다. `run_replace` 는 원래 값을 쓴다.
  - 메시지의 줄바꿈은 그누보드 관례(`'…\n…'` 두 글자, `<br>`)를 진짜 줄바꿈으로 바꾸고, 태그는 빼고 엔티티는 푼다.
  - 훅 안에서 `exit` 하면 막을 수 없지만, 응답은 HTML 대신 JSON 500(`플러그인이 요청을 끝냈습니다.`)으로 끝난다.
- 안에서 훅을 부르는 그누보드 함수(`mailer()`, `delete_cache_latest()`, `delete_editor_thumbnail()`)는 `api_call_core()` 로 부른다 — 같은 보호(출력 버림 · alert · 예외)를 받는다.
  글 · 댓글 · 첨부가 바뀌면 원본처럼 저장 뒤 훅 바로 앞에서 `delete_cache_latest` 로 그누보드 `latest()` 캐시를 비운다.

| 동작 | 훅 (원본 파일) |
|---|---|
| `POST /auth/login` | `member_login_check_before`, `password_is_wrong`('login'), `login_session_before`, `member_login_check` (bbs/login_check.php) |
| 소셜 · Apple 로그인 완료 | `login_session_before`, `member_login_check` — `$is_social_login = true` |
| `POST /auth/logout` | `member_logout` (bbs/logout.php) |
| `POST /auth/register` | `register_form_update_before` · `_valid` · `_after`, 인증 메일 `register_form_update_mail_certify_content` · `_send_certify_mail` (bbs/register_form_update.php, `$w = ''`) |
| `POST /auth/password-reset` | `password_lost2_after`(request), `password_lost_certify_before` · `_after`(reset) |
| `/qas` 작성 · 수정 · 답변 · 삭제 | `qawrite_update`(`$w` = '' · 'r' · 'u' · 'a'), `qa_delete` (bbs/qawrite_update.php, bbs/qadelete.php) |
| 글 작성 · 답글 · 수정 | `write_update_before` · `write_update_after` — `$w` = '' · 'r' · 'u' (bbs/write_update.php). 수정(첨부 바꾸기 포함)은 원본 bbs/write.php 와 같은 제한 — 관리자가 아니면 답변글이 있거나 남의 댓글이 `bo_count_modify` 건 이상(0 이면 제한 없음)인 글은 409, 관리자 레벨 비교 403 (`api_post_change_blocked`) |
| 글 삭제 | 첨부 파일마다 `delete_file_path`(디스크에서도 지운다), `delete_editor_thumbnail_before` · `_after`, `delete_cache_latest`, `bbs_delete($write, $board)` (bbs/delete.php). 원본과 같은 삭제 제한 — 관리자가 아니면 답변글이 있거나 남의 댓글이 `bo_count_delete` 건 이상인 글은 409, 그룹 · 게시판 관리자는 자기보다 레벨이 높은 회원의 글이면 403. 글 · 댓글 포인트를 거두고 스크랩도 지운다 |
| 첨부 올리기 · 바꾸기 (`/boards/{bo}/{wr_id}/files`) | `write_update_upload_file` → `write_update_upload_array`(원본 `$upload[$i]` 모양 — `fileurl` · `thumburl` · `storage` 를 채우면 그대로 저장) → 행을 넣은 뒤 `write_update_file_insert`, 빠진 첨부는 `delete_file_path` — `$w = 'u'` (bbs/write_update.php). 로컬(`data/file`)에 파일이 없으면 API 의 첨부 · 썸네일 주소는 `bf_fileurl`(작은 크기는 `bf_thumburl` 먼저, http(s) 만)을 쓴다 — 외부 저장소 플러그인 |
| 첨부 내려받기 | API 는 원본 `bbs/download.php` 주소를 주므로 `download_file_exist_check` · `download_file_header` 는 원본이 부른다 |
| 댓글 작성 · 대댓글 · 수정 · 삭제 | `comment_update_after` — `$w` = 'c' · 'cu', 대댓글이면 부모 댓글 행 (bbs/write_comment_update.php), `bbs_delete_comment`. 수정 · 삭제는 원본과 같이 관리자가 아니면 답변 댓글이 있을 때 409, 관리자 레벨 비교 403 (`api_comment_change_blocked`). 삭제하면 댓글 포인트를 거둔다 |
| 추천 · 비추천 | `bbs_good_before` → `bbs_increase_good_json` → `bbs_good_after` (bbs/good.php) |
| 쪽지 보내기 · 삭제 | `memo_form_update_before` · `_after`(받을 수 없으면 `_failed`), `memo_delete` (bbs/memo_form_update.php, bbs/memo_delete.php) |
| 회원정보 수정 | `register_form_update_before` · `_valid` · `_after` — `$w = 'u'` |
| 탈퇴 | `member_leave`(지우기 전) — API 는 바로 지우므로 `member_delete()` 가 부르는 `member_delete_after` 도 |
| 글 이동 · 복사, 상품후기 · 상품문의, 비회원 주문조회 | `bbs_move_update` · `bbs_move_copy` · `bbs_move_update_file` · `delete_file_path`, `shop_item_use_*` · `shop_item_qa_*`, `password_is_wrong`('shop') |

알림: `plugin/webapp/notify/events.php` 도 `write_update_after` · `comment_update_after` · `memo_form_update_after` 에 붙어
그누보드 화면의 알림을 보내는데, API 는 핸들러가 직접 보내므로 API 요청(`G5_API_REQUEST`)에서는 그쪽이 건너뛴다(두 번 가지 않게).

테스트: `tests/smoke/ApiHookContractTest.php` 가 DB 없이(CI 에서도) 위 표의 훅이 라우트에 있는지, 막는 훅이 `api_run_before_event` 로
되돌릴 수 없는 일 앞에 있는지, 원본 `run_event` 직접 호출이 없는지 본다. `tests/smoke/ApiHooksTest.php` 는 DB 있는 곳에서
`alert` · `goto_url` · `exit` 처리와 비회원 기본값을 실제로 돌려 본다. 훅을 더하면 계약 테스트의 표도 같이 고친다.

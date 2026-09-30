# plugin/webapp/ — 웹·앱 공통 코어

`extend/webapp.extend.php` 가 아래 순서로 읽는다.

| 파일 | 역할 |
|------|------|
| `notify/tables.php` | 로그인 토큰·기기·푸시 토큰·푸시 큐·알림함·소셜 티켓·차단·신고 표 등록 (`admin_dbupgrade` 로 생성) |
| `bridge/runtime.php` | 매 요청: `G5_URL` 확정, 짧은 주소 훅(`add_mod_rewrite_*`, `add_nginx_conf_*`), `adm_theme_update` 로 `.htaccess` 동기화 |
| `bridge/social.php` | 소셜 로그인 팝업 ↔ 앱/Next 사이 다리 |
| `notify/events.php` | 그누보드 화면(bbs/*.php)의 댓글·답글·쪽지 이벤트를 `Notify::emit` 으로 연결 |
| `notify/admin.php` | 관리자 알림 발송/로그 화면 |
| `notify/Prefs.php` | 회원별 알림 수신 설정(`member_pref.notify_*`). `GET/PATCH /v1/auth/preferences`(부분 갱신) 와 발송 쪽 `NotifyPrefs::pushAllowed()` 가 쓴다. 끄면 **푸시만** 안 가고 알림함에는 남는다 |

`bridge/route.php` 는 `.htaccess` / nginx 가 실제 파일이 없는 주소를 넘기는 정문이고,
`bridge/common.php` 는 테마 찾기·자리표시자 주소 옮기기·rewrite 규칙 생성 연장통이다.

## 알림 한 길

```php
Notify::emit('comment.created', $mb_id, $title, $body, ['link' => '/free/12']);
```

알림함 행(`notification_log`) 을 쓰고, 회원의 모든 푸시 토큰에 큐 작업(`push_queue`, 알림함 행 번호 `nt_id` 만 가리킴)을 넣고, 곧바로 짧게 큐를 돌린다.
남은 작업은 `cron/process_push_queue.php` 가 가져간다. Next.js 는 API 로, Android/iOS 는 Expo 푸시로 같은 알림을 받는다.
API 쪽(`api/v1/comments.php`, `qas.php`, `memos.php`)과 그누보드 화면 쪽(`notify/events.php`)이 같은 함수를 부른다.

### 알림함 표 `notification_log`

| 컬럼 | 뜻 |
|---|---|
| `nt_type` | `custom` / `dday` / `system` — 앱 트레이 채널을 가르는 큰 갈래 |
| `nt_event` | 실제 이벤트 `comment.created`, `memo.received`, `dday.reminder` … — 목록 필터(`?event=`)와 화면 라벨은 이걸 쓴다 |
| `nt_data` | JSON. `link`, `bo_table`, `wr_id` 같은 이동 정보와 제품 고유 참조(`dday_id`, `baby_id` …). 공통 표에 제품 컬럼을 두지 않는다 |
| `nt_dedup_key` | 같은 알림을 하루 두 번 안 만들기 위한 UNIQUE 키 (크론·앱 재전송) |
| `nt_read_at` | NULL 이면 안 읽음 — 배지 개수 |

보존: `cron/cleanup_push_tokens.php`(매일)가 읽은 알림 180일 · 안 읽은 알림 365일 지난 행을 지운다 (`WEBAPP_NOTIFICATION_KEEP_*_DAYS`).

## cron/

| 스크립트 | 주기 |
|----------|------|
| `process_push_queue.php` | 1~5분 |
| `cleanup_push_tokens.php` | 하루 1회 |
| `purge_withdrawn_members.php` | 하루 1회 (`--dry-run` 으로 먼저 확인) |
| `send_stocksms.php` | 5~10분 (영카트 재입고 SMS) |
| `install-windows-task.ps1` | Windows 작업 스케줄러 등록 |

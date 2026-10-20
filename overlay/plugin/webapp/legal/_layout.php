<?php
/**
 * 앱 법적 고지 페이지(앱 SC-06)의 화면 틀 — 이스케이프 · 머리 · 꼬리. DB · 세션을 쓰지 않는 순수 함수만 둔다
 * (테스트가 사이트 정보 배열만 넣어 그려 본다 — tests/smoke/AppLegalPagesTest.php).
 *
 * $site 는 _bootstrap.php 의 g5_legal_site() 가 만든다:
 *   service    서비스 이름(사이트 제목 cf_title)
 *   operator   운영자(사업자 상호, 없으면 서비스 이름)
 *   email      개인정보 · 탈퇴 문의 이메일(정보관리책임자 메일, 없으면 최고관리자 메일 — 없을 수 있다)
 *   officer    개인정보 보호책임자 이름(없을 수 있다)
 *   tel        대표 전화(없을 수 있다)
 *   has_shop   쇼핑몰을 쓰는 사이트인지 — 주문 · 결제 · 환불 문구를 넣는다
 *   company    사업자 정보 [label => value] — 쇼핑몰 기본환경설정의 값 중 채워진 것만
 *   signup     회원가입 때 운영자 설정에 따라 더 받는 항목 이름들
 *   cert       본인확인을 쓰는지
 *   social     켜진 소셜 로그인 이름들
 *   point      포인트를 쓰는지
 */
if (basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

if (!defined('G5_LEGAL_LAST_UPDATED')) {
    define('G5_LEGAL_LAST_UPDATED', '2026-10-19');
}

if (!function_exists('g5_legal_h')) {
    function g5_legal_h($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }
}

if (!function_exists('g5_legal_page_start')) {
    /** 문서 머리 — <title>, 스타일, 제목, 서비스 · 운영자 · 갱신일 줄. */
    function g5_legal_page_start(string $title, array $site): string
    {
        ob_start();
        ?><!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= g5_legal_h($title) ?> — <?= g5_legal_h($site['service']) ?></title>
<style>
  :root { --fg:#1b1d21; --muted:#5b616b; --bg:#f6f7f9; --card:#fff; --line:#e3e6ea; --accent:#2f5fd0; }
  @media (prefers-color-scheme: dark) {
    :root { --fg:#e6e8eb; --muted:#a4abb5; --bg:#121417; --card:#1c1f24; --line:#2c3138; --accent:#8fb0ff; }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Apple SD Gothic Neo','맑은 고딕',sans-serif;line-height:1.75;font-size:15px;word-break:keep-all;overflow-wrap:anywhere}
  main{max-width:760px;margin:0 auto;padding:32px 16px 80px}
  h1{font-size:24px;line-height:1.35;margin:0 0 6px}
  .meta{color:var(--muted);font-size:13px;margin:0 0 24px}
  h2{font-size:17px;margin:32px 0 8px;padding-top:4px}
  h3{font-size:15px;margin:18px 0 6px}
  ul,ol{padding-left:22px;margin:8px 0}
  li{margin-bottom:6px}
  table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}
  th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
  th{background:var(--card)}
  .card{background:var(--card);border:1px solid var(--line);padding:16px 18px;border-radius:12px;margin:12px 0}
  .muted{color:var(--muted);font-size:13px}
  a{color:var(--accent)}
  nav.docs{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:40px;padding-top:16px;border-top:1px solid var(--line);font-size:14px}
</style>
</head>
<body>
<main>
  <h1><?= g5_legal_h($title) ?></h1>
  <p class="meta">서비스: <?= g5_legal_h($site['service']) ?> · 운영: <?= g5_legal_h($site['operator']) ?> · 최종 갱신: <?= g5_legal_h(G5_LEGAL_LAST_UPDATED) ?></p>
<?php
        return (string) ob_get_clean();
    }
}

if (!function_exists('g5_legal_contact_html')) {
    /** 연락처 한 줄 — 이메일이 있으면 메일 링크, 없으면 앱의 1:1 문의. */
    function g5_legal_contact_html(array $site): string
    {
        if ($site['email'] !== '') {
            $mail = g5_legal_h($site['email']);
            return '<a href="mailto:' . $mail . '">' . $mail . '</a>';
        }
        return '앱 또는 웹사이트의 1:1 문의';
    }
}

if (!function_exists('g5_legal_page_end')) {
    /** 문서 꼬리 — 사업자 정보(있을 때)와 세 문서 사이 이동 링크. */
    function g5_legal_page_end(array $site): string
    {
        ob_start();
        if (!empty($site['company'])) {
            ?>
  <h2>사업자 정보</h2>
  <table>
<?php foreach ($site['company'] as $label => $value): ?>
    <tr><th scope="row"><?= g5_legal_h($label) ?></th><td><?= g5_legal_h($value) ?></td></tr>
<?php endforeach; ?>
  </table>
<?php
        }
        ?>
  <nav class="docs" aria-label="법적 고지">
    <a href="privacy.php">개인정보처리방침</a>
    <a href="terms.php">이용약관</a>
    <a href="account-deletion.php">계정 삭제 안내</a>
  </nav>
</main>
</body>
</html>
<?php
        return (string) ob_get_clean();
    }
}

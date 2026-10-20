<?php
/**
 * 계정 삭제 안내 — 그누보드5 앱 공통(앱 SC-06). 앱 /settings 의 legal_urls.account_deletion 이고,
 * Google Play 의 "계정 삭제 URL"(앱을 다시 설치하지 않고 삭제를 요청하는 웹 페이지)로 쓴다.
 *
 * 앱 안 경로는 MY → 설정 → 회원 탈퇴(DELETE /v1/members/me). 웹 요청은 이메일로 받는다 — 요청 표를 따로 두지 않는다.
 * 삭제 · 보존 목록은 api/v1/member_purge.php 와 같아야 한다.
 */
require_once __DIR__ . '/_layout.php';

if (!function_exists('g5_legal_account_deletion_html')) {
    function g5_legal_account_deletion_html(array $site): string
    {
        $h = 'g5_legal_h';
        $shop = !empty($site['has_shop']);
        $service = $h($site['service']);
        ob_start();
        echo g5_legal_page_start('계정 삭제 안내', $site);
        ?>
  <div class="card">
    <p><?= $service ?> 계정은 앱에서 바로 삭제할 수 있습니다. 앱을 쓸 수 없으면 이메일로 삭제를 요청할 수 있습니다.</p>
  </div>

  <h2>앱에서 삭제하기</h2>
  <ol>
    <li>앱을 열고 로그인합니다.</li>
    <li>[MY] 탭 → [설정] → [회원 탈퇴]를 누릅니다.</li>
    <li>안내를 읽고 동의에 체크한 뒤 비밀번호로 본인 확인을 합니다. 소셜 계정으로 가입했다면 그 소셜 계정으로 확인합니다.</li>
    <li>확인이 끝나면 바로 삭제가 완료됩니다.</li>
  </ol>

  <h2>이메일로 요청하기</h2>
  <p><?= g5_legal_contact_html($site) ?>(으)로 가입한 아이디(또는 가입 이메일)와 "계정 삭제 요청"을 적어 보내 주세요. 운영자가 본인 여부를 확인한 뒤 지체 없이 삭제하고 결과를 알려 드립니다.</p>

  <h2>바로 삭제되는 정보</h2>
  <ul>
    <li>회원 정보(이름 · 이메일 · 연락처 · 주소 등), 비밀번호, 로그인 세션, 소셜 로그인 연결</li>
    <li>앱 알림 토큰과 알림 내역, 쪽지, 스크랩<?= !empty($site['point']) ? ', 포인트' : '' ?>, 프로필 사진</li>
<?php if ($shop): ?>
    <li>장바구니(주문하지 않은 상품), 위시리스트, 저장한 배송지</li>
<?php endif; ?>
  </ul>

  <h2>남는 정보</h2>
  <ul>
    <li>게시글 · 댓글<?= $shop ? ' · 상품 후기 · 상품 문의' : '' ?> · 1:1 문의는 내용을 남기고 작성자를 "탈퇴회원"으로 바꾸며, 이메일 · 연락처 · IP 는 지웁니다. 남기고 싶지 않은 글은 탈퇴 전에 직접 삭제해 주세요.</li>
<?php if ($shop): ?>
    <li>주문 기록(주문한 상품 내역 포함)은 전자상거래법에 따라 5년(소비자 불만 · 분쟁 처리 기록은 3년) 동안 이름 · 연락처 · 주소를 지운 상태로 보관합니다.</li>
<?php endif; ?>
    <li>서비스 접속 기록은 통신비밀보호법에 따라 3개월 동안 보관합니다.</li>
    <li>보존 기간이 지난 기록은 운영자가 지체 없이 파기합니다.</li>
  </ul>

  <h2>복구</h2>
  <p>삭제한 계정과 정보는 복구할 수 없습니다. 같은 이메일이나 소셜 계정으로 새로 가입할 수는 있지만 탈퇴한 아이디는 다시 쓸 수 없고, 이전 정보는 돌아오지 않습니다. 자세한 내용은 <a href="privacy.php">개인정보처리방침</a>을 참고해 주세요.</p>
<?php
        echo g5_legal_page_end($site);
        return (string) ob_get_clean();
    }
}

if (!defined('G5_LEGAL_RENDER_ONLY')) {
    require_once __DIR__ . '/_bootstrap.php';
    header('Content-Type: text/html; charset=utf-8');
    echo g5_legal_account_deletion_html(g5_legal_site());
}

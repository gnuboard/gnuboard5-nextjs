<?php
/**
 * 개인정보처리방침 — 그누보드5 앱 공통(앱 SC-06). 앱 /settings 의 legal_urls.privacy 가 이 주소다.
 *
 * 문구는 실제 동작과 같아야 한다(스토어 심사 · 개인정보 보호법):
 *   탈퇴 처리      api/v1/member_purge.php — 즉시 파기, 게시물 · 후기 · 문의 익명화, 주문 기록 익명 보관
 *   앱 탈퇴 안내   앱 저장소 i18n settings.withdraw_confirm_msg
 *   앱 외부 전송   앱 알림 토큰(Expo · FCM · APNs), 오류 기록(Sentry — 켠 빌드만, 개인정보를 걸러 보냄)
 */
require_once __DIR__ . '/_layout.php';

if (!function_exists('g5_legal_privacy_html')) {
    function g5_legal_privacy_html(array $site): string
    {
        $h = 'g5_legal_h';
        $shop = !empty($site['has_shop']);
        $service = $h($site['service']);
        $operator = $h($site['operator']);
        ob_start();
        echo g5_legal_page_start('개인정보처리방침', $site);
        ?>
  <div class="card">
    <p><?= $operator ?>(이하 "운영자")는 <?= $service ?> 앱과 웹사이트(이하 "서비스")를 운영하면서 「개인정보 보호법」 등 관계 법령을 지키고, 이용자의 개인정보를 아래와 같이 처리합니다.</p>
  </div>

  <h2>1. 수집하는 개인정보 항목</h2>
  <h3>회원가입</h3>
  <ul>
    <li>아이디, 비밀번호(되돌릴 수 없게 암호화해 저장), 이름, 닉네임, 이메일</li>
<?php if (!empty($site['signup'])): ?>
    <li>운영자 설정에 따라 추가로: <?= $h(implode(', ', $site['signup'])) ?></li>
<?php endif; ?>
  </ul>
<?php if (!empty($site['cert'])): ?>
  <h3>본인확인</h3>
  <ul>
    <li>본인확인기관에서 받은 이름, 휴대폰 번호, 생년월일, 성별, 중복가입확인정보(DI)</li>
  </ul>
<?php endif; ?>
<?php if (!empty($site['social'])): ?>
  <h3>소셜 로그인</h3>
  <ul>
    <li><?= $h(implode(', ', $site['social'])) ?> 로그인: 소셜 서비스의 회원 식별자, 이메일, 이름(닉네임), 프로필 사진 주소 — 이용자가 그 서비스에서 동의한 항목만</li>
    <li>Apple 로그인(앱에서 제공하는 경우): Apple 이 전달한 식별자와 이메일(Apple 의 이메일 가리기 주소 포함)</li>
  </ul>
<?php endif; ?>
<?php if ($shop): ?>
  <h3>주문 · 결제</h3>
  <ul>
    <li>주문하는 분의 이름 · 연락처 · 이메일, 받는 분의 이름 · 연락처 · 주소, 배송 요청 사항</li>
    <li>무통장입금 입금자명, 현금영수증 발급 정보(신청한 경우), 주문 · 결제 · 취소 · 환불 내역</li>
    <li>카드 번호 등 결제수단 정보는 결제대행사(PG)가 결제창에서 직접 받으며, 운영자는 받거나 저장하지 않습니다.</li>
  </ul>
<?php endif; ?>
  <h3>서비스 이용 중 만들어지는 정보</h3>
  <ul>
    <li>게시글 · 댓글과 첨부 파일(사진 포함), 1:1 문의와 첨부 파일<?= $shop ? ', 상품 후기 · 상품 문의' : '' ?>, 쪽지, 신고 내용<?= !empty($site['point']) ? ', 포인트 내역' : '' ?></li>
    <li>접속 IP, 접속 · 이용 기록, 기기 정보(운영체제, 앱 버전 등), 앱 알림(푸시) 토큰, 앱 오류 기록</li>
  </ul>
  <h3>수집하지 않는 정보</h3>
  <ul>
    <li>광고 식별자, 위치 정보, 기기의 연락처(주소록)는 수집하지 않으며, 맞춤형 광고나 다른 앱 · 웹사이트에 걸친 추적을 하지 않습니다.</li>
    <li>앱은 카메라 · 마이크를 쓰지 않고, 사진첩 전체에 접근하지 않습니다. 이용자가 직접 고른 사진만 올라갑니다.</li>
  </ul>

  <h2>2. 수집 · 이용 목적</h2>
  <ul>
    <li>회원 가입 · 식별 · 본인 확인, 로그인 유지</li>
    <li>게시글 · 댓글 · 문의 등록과 답변, 쪽지 전달</li>
<?php if ($shop): ?>
    <li>주문 접수, 결제 · 배송 · 교환 · 환불 처리, 주문 관련 상담과 알림</li>
<?php endif; ?>
    <li>새 댓글 · 쪽지 · 답변<?= $shop ? ' · 주문 상태' : '' ?> 등 앱 알림 발송(기기 설정에서 끌 수 있습니다)</li>
    <li>부정 이용 방지와 보안, 오류 분석과 서비스 개선</li>
    <li>법령 · 약관 위반 대응, 분쟁 처리</li>
  </ul>

  <h2>3. 보유 기간과 파기</h2>
  <ul>
    <li><strong>회원 탈퇴를 요청하면 즉시 계정과 개인정보를 파기하며, 복구할 수 없습니다.</strong> 회원 정보, 로그인 세션, 소셜 로그인 연결, 앱 알림 토큰과 알림 내역, 쪽지, 스크랩<?= !empty($site['point']) ? ', 포인트' : '' ?>, 프로필 사진<?= $shop ? ', 장바구니(주문하지 않은 상품), 위시리스트, 저장한 배송지' : '' ?>가 함께 삭제됩니다.</li>
    <li>게시글 · 댓글<?= $shop ? ' · 상품 후기 · 상품 문의' : '' ?> · 1:1 문의는 내용을 남기고 작성자를 "탈퇴회원"으로 바꾸며, 이메일 · 연락처 · IP 는 지웁니다(다른 이용자의 댓글이 달린 글이 사라지지 않게 하기 위함입니다). 남기고 싶지 않은 글은 탈퇴 전에 직접 삭제해 주세요.</li>
<?php if ($shop): ?>
    <li>주문 기록(주문한 상품 내역 포함)은 아래 법령이 정한 기간 동안 이름 · 연락처 · 주소 등 식별정보를 지운 상태로 보관합니다.</li>
<?php endif; ?>
  </ul>
  <table>
    <tr><th scope="col">보존하는 기록</th><th scope="col">기간</th><th scope="col">근거</th></tr>
<?php if ($shop): ?>
    <tr><td>계약 또는 청약철회 등에 관한 기록</td><td>5년</td><td>전자상거래 등에서의 소비자보호에 관한 법률</td></tr>
    <tr><td>대금결제 및 재화 등의 공급에 관한 기록</td><td>5년</td><td>전자상거래 등에서의 소비자보호에 관한 법률</td></tr>
    <tr><td>소비자의 불만 또는 분쟁처리에 관한 기록</td><td>3년</td><td>전자상거래 등에서의 소비자보호에 관한 법률</td></tr>
<?php endif; ?>
    <tr><td>서비스 접속 기록(로그)</td><td>3개월</td><td>통신비밀보호법</td></tr>
  </table>
  <p class="muted">보존 기간이 지난 기록은 운영자가 지체 없이 파기하며, 전자 파일은 되살릴 수 없는 방법으로 지웁니다.</p>

  <h2>4. 개인정보의 제3자 제공</h2>
  <p>운영자는 이용자의 동의 없이 개인정보를 제3자에게 제공하거나 판매하지 않습니다. 다만 법령에 근거가 있거나 수사기관이 법령이 정한 절차에 따라 요구하는 경우는 예외입니다.<?= $shop ? ' 결제 · 배송에 필요한 전달은 아래 처리 위탁을 따릅니다.' : '' ?></p>

  <h2>5. 처리 위탁과 외부 서비스</h2>
  <table>
    <tr><th scope="col">받는 곳</th><th scope="col">하는 일</th><th scope="col">전달되는 정보</th></tr>
<?php if ($shop): ?>
    <tr><td>결제대행사(운영자가 계약한 PG)</td><td>결제 승인 · 취소, 현금영수증 발급</td><td>주문번호, 결제 금액, 결제창에 필요한 주문자 이름 · 연락처 · 이메일</td></tr>
    <tr><td>배송 업체(운영자가 이용하는 택배사)</td><td>상품 배송</td><td>받는 분 이름 · 연락처 · 주소, 배송 요청 사항</td></tr>
<?php endif; ?>
    <tr><td>Expo(Expo Push Service), Google(Firebase Cloud Messaging), Apple(Apple Push Notification service)</td><td>앱 알림 전달</td><td>앱 알림 토큰, 알림 제목 · 내용</td></tr>
    <tr><td>Sentry(운영자가 켠 경우)</td><td>앱 오류 원인 분석</td><td>오류 기록, 기기 정보 — 계정 정보 · 인증 토큰 · 게시물 · 문의 내용은 걸러 내고 보냅니다</td></tr>
<?php if (!empty($site['social'])): ?>
    <tr><td><?= $h(implode(', ', $site['social'])) ?> 등 소셜 로그인 제공자</td><td>로그인 인증</td><td>소셜 계정 인증 정보</td></tr>
<?php endif; ?>
<?php if (!empty($site['cert'])): ?>
    <tr><td>본인확인기관</td><td>본인확인</td><td>본인확인에 입력한 정보</td></tr>
<?php endif; ?>
  </table>
  <p><strong>국외 처리</strong> — Expo · Google · Apple · Sentry 는 미국 등 국외 서버에서 정보를 처리합니다. 위 표의 정보가 알림 전달 · 오류 분석이 필요할 때 네트워크로 전송되며, 각 회사의 정책에 따른 기간 또는 위탁 목적이 끝날 때까지 보관됩니다. 기기에서 앱 알림 권한을 허용하지 않으면 알림 토큰을 보내지 않습니다.</p>

  <h2>6. 기기에 저장되는 정보</h2>
  <ul>
    <li>로그인 정보(인증 토큰)는 기기의 보안 저장소(iOS 키체인 · Android 키스토어)에 저장되고, 로그아웃하거나 앱을 지우면 함께 지워집니다.</li>
    <li>최근 검색어와 화면 표시용 임시 저장(캐시)은 기기에만 남습니다.</li>
    <li>웹사이트는 로그인 유지를 위해 쿠키를 씁니다. 브라우저 설정에서 쿠키를 거부할 수 있지만, 그러면 로그인이 필요한 기능을 쓸 수 없습니다.</li>
  </ul>

  <h2>7. 이용자의 권리</h2>
  <ul>
    <li>이용자는 언제든지 자신의 개인정보 열람 · 정정 · 삭제 · 처리정지와 동의 철회를 요청할 수 있습니다.</li>
    <li>앱의 [MY] → [설정]에서 회원 정보를 고치거나 회원 탈퇴를 할 수 있고, <a href="account-deletion.php">계정 삭제 안내</a> 또는 아래 연락처로도 요청할 수 있습니다.</li>
  </ul>

  <h2>8. 안전성 확보 조치</h2>
  <ul>
    <li>비밀번호 단방향 암호화 저장, 앱 · 웹과 서버 사이 HTTPS 암호화 통신</li>
    <li>관리자 권한 분리와 접근 제한</li>
    <li>앱 오류 기록에서 계정 정보 · 인증 토큰 · 게시물 내용 걸러 내기</li>
  </ul>

  <h2>9. 개인정보 보호책임자</h2>
  <ul>
    <li>책임자: <?= $site['officer'] !== '' ? $h($site['officer']) : $operator ?></li>
    <li>연락처: <?= g5_legal_contact_html($site) ?><?= $site['tel'] !== '' ? ' · ' . $h($site['tel']) : '' ?></li>
  </ul>
  <p class="muted">개인정보 침해에 대한 신고 · 상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118), 개인정보 분쟁조정위원회(kopico.go.kr, 1833-6972)에도 할 수 있습니다.</p>

  <h2>10. 고지의 의무</h2>
  <p>이 방침이 바뀌면 시행 7일 전(이용자에게 불리하거나 중요한 변경은 30일 전)부터 앱 · 웹사이트 공지와 이 페이지로 알립니다.</p>
<?php
        echo g5_legal_page_end($site);
        return (string) ob_get_clean();
    }
}

if (!defined('G5_LEGAL_RENDER_ONLY')) {
    require_once __DIR__ . '/_bootstrap.php';
    header('Content-Type: text/html; charset=utf-8');
    echo g5_legal_privacy_html(g5_legal_site());
}

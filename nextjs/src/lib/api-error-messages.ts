/**
 * API 오류 메시지를 화면에 낼 한국어로 바꾼다.
 *
 * API(`api/v1`, `api/lib`)는 오류를 영어로 돌려준다("Unauthorized. Please provide a valid access token." 등).
 * 앱은 그 메시지를 토스트에 그대로 띄우므로 사용자가 영어 문장을 보게 된다. API 는 다른 앱(디데이 앱)도
 * 함께 쓰고 있어 서버 문구는 두고, 앱이 받는 자리(ApiError)에서 한 번에 바꾼다.
 *
 * 순서: 이미 한국어면 그대로 → 정확히 같은 문장 → 뒤에 값이 붙는 문장(패턴) → 영어뿐이면 상태 코드별 문구.
 * 새 영어 메시지가 생겨도 마지막 단계가 받아 영어가 화면에 나가지 않는다.
 */

const HANGUL = /[가-힣]/;

/** 흔히 쓰이는 필드 이름. 검증 메시지("wr_subject is required.")를 한국어로 풀 때 쓴다. */
const FIELD_LABELS: Record<string, string> = {
  wr_subject: "제목",
  wr_content: "내용",
  wr_name: "이름",
  wr_password: "비밀번호",
  wr_email: "이메일",
  mb_id: "아이디",
  mb_password: "비밀번호",
  mb_password_re: "비밀번호 확인",
  mb_name: "이름",
  mb_nick: "닉네임",
  mb_email: "이메일",
  mb_hp: "휴대폰번호",
  mb_tel: "전화번호",
  od_name: "주문자 이름",
  od_hp: "휴대폰번호",
  od_email: "이메일",
  od_b_name: "받는 분 이름",
  od_b_hp: "받는 분 휴대폰번호",
  od_b_zip: "우편번호",
  od_b_addr1: "주소",
  it_id: "상품",
  ct_qty: "수량",
  qa_subject: "제목",
  qa_content: "내용",
  is_subject: "제목",
  is_content: "내용",
  iq_subject: "제목",
  iq_question: "문의 내용",
  email: "이메일",
  password: "비밀번호",
  name: "이름",
  subject: "제목",
  content: "내용",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? "필수 항목";
}

/** 영어 문장(끝 마침표 빼고) → 한국어. 사용자가 볼 만한 것 위주다. */
const EXACT: Record<string, string> = {
  // 인증 · 권한
  "Unauthorized. Please provide a valid access token": "로그인이 필요합니다. 로그인 후 다시 시도해 주세요.",
  Forbidden: "권한이 없습니다.",
  "Forbidden. Administrator privileges required": "관리자만 할 수 있습니다.",
  "Administrator privileges required": "관리자만 할 수 있습니다.",
  "Invalid member ID or password": "아이디 또는 비밀번호가 올바르지 않습니다.",
  "Invalid member ID format": "아이디 형식이 올바르지 않습니다.",
  "Invalid password": "비밀번호가 올바르지 않습니다.",
  "Passwords do not match": "비밀번호가 서로 다릅니다.",
  "Current password is incorrect": "현재 비밀번호가 올바르지 않습니다.",
  "Current password is required": "현재 비밀번호를 입력해 주세요.",
  "Invalid or expired refresh token": "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  "Invalid or expired reset token": "비밀번호 재설정 링크가 만료되었거나 올바르지 않습니다.",
  "Invalid or already used reset token": "이미 사용했거나 올바르지 않은 비밀번호 재설정 링크입니다.",
  "Invalid or expired verification session": "본인인증 시간이 지났습니다. 다시 인증해 주세요.",
  "This account has been withdrawn": "탈퇴한 계정입니다.",
  "This account has been banned": "이용이 제한된 계정입니다.",
  "Account is not active": "사용할 수 없는 계정입니다.",
  "This member ID is already taken": "이미 사용 중인 아이디입니다.",
  "This nickname is already taken": "이미 사용 중인 닉네임입니다.",
  "This nickname is already taken by another member": "다른 회원이 사용 중인 닉네임입니다.",
  "This email is already registered": "이미 등록된 이메일입니다.",
  "This email is already registered by another member": "다른 회원이 등록한 이메일입니다.",
  "Failed to create member account": "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  "Re-authentication is required to delete the account": "탈퇴하려면 다시 인증해 주세요.",
  "Social re-authentication does not match this account": "소셜 재인증 계정이 지금 계정과 다릅니다.",
  "Password required for data export": "내 정보 내려받기에는 비밀번호가 필요합니다.",
  "Identity verification password reset is disabled": "본인인증으로 비밀번호 찾기를 쓸 수 없습니다.",
  "No matching member was found for this verification": "인증 정보와 일치하는 회원이 없습니다.",
  "Apple login is disabled": "Apple 로그인을 사용할 수 없습니다.",
  "Member not found": "회원을 찾을 수 없습니다.",
  "This member profile is not public": "공개하지 않은 회원 정보입니다.",
  "You must make your own profile public before viewing other member profiles": "내 정보를 공개해야 다른 회원 정보를 볼 수 있습니다.",
  "You cannot sanction your own account": "내 계정은 제재할 수 없습니다.",
  "Super admin accounts cannot be sanctioned from the app": "최고관리자 계정은 앱에서 제재할 수 없습니다.",

  // 공통 요청
  "Failed to fetch": "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  "API Error": "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "Validation failed": "입력한 내용을 확인해 주세요.",
  "Method not allowed": "지원하지 않는 요청입니다.",
  "Not found": "요청한 내용을 찾을 수 없습니다.",
  "Request body is required": "요청 내용이 비어 있습니다.",
  "No fields to update": "바꿀 내용이 없습니다.",
  "No valid fields provided for update": "바꿀 내용이 없습니다.",
  "Too many requests. Please try again shortly": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "Too many reports. Please try again later": "신고가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "Internal server error": "서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
  "Invalid status": "상태 값이 올바르지 않습니다.",
  "Invalid content": "내용이 올바르지 않습니다.",

  // 게시판 · 글 · 댓글
  "Board not found": "게시판을 찾을 수 없습니다.",
  "Post not found": "게시글을 찾을 수 없습니다.",
  "Parent post not found": "원글을 찾을 수 없습니다.",
  "Post to reply to was not found": "답변할 글을 찾을 수 없습니다.",
  "Comment not found": "댓글을 찾을 수 없습니다.",
  "Content not found": "내용을 찾을 수 없습니다.",
  "Category not found": "분류를 찾을 수 없습니다.",
  "File not found": "파일을 찾을 수 없습니다.",
  "Image not found": "이미지를 찾을 수 없습니다.",
  "Please enter a subject": "제목을 입력해 주세요.",
  "Please enter content": "내용을 입력해 주세요.",
  "Please enter your name": "이름을 입력해 주세요.",
  "Please enter an email address": "이메일을 입력해 주세요.",
  "Please enter a mobile phone number": "휴대폰번호를 입력해 주세요.",
  "Please select a category": "분류를 선택해 주세요.",
  "Search keyword (q) is required": "검색어를 입력해 주세요.",
  "Open the post first to read its comments": "글을 먼저 열어야 댓글을 볼 수 있습니다.",
  "Secret posts are not enabled in this board": "이 게시판은 비밀글을 쓸 수 없습니다.",
  "This thread cannot take any more replies": "이 글에는 더 이상 답변을 달 수 없습니다.",
  "You do not have permission to read this post": "이 글을 읽을 권한이 없습니다.",
  "You do not have permission to list this board": "이 게시판 목록을 볼 권한이 없습니다.",
  "You do not have permission to write in this board": "이 게시판에 글을 쓸 권한이 없습니다.",
  "You do not have permission to reply in this board": "이 게시판에 답변을 쓸 권한이 없습니다.",
  "You do not have permission to edit this post": "이 글을 수정할 권한이 없습니다.",
  "You do not have permission to delete this post": "이 글을 삭제할 권한이 없습니다.",
  "You do not have permission to comment on this post": "이 글에 댓글을 쓸 권한이 없습니다.",
  "You do not have permission to comment in this board": "이 게시판에 댓글을 쓸 권한이 없습니다.",
  "You do not have permission to edit this comment": "이 댓글을 수정할 권한이 없습니다.",
  "You do not have permission to delete this comment": "이 댓글을 삭제할 권한이 없습니다.",
  "You do not have permission to scrap this post": "이 글을 스크랩할 권한이 없습니다.",
  "You do not have permission to recommend this post": "이 글을 추천할 권한이 없습니다.",
  "Not enough points to read this post": "포인트가 부족해 글을 읽을 수 없습니다.",
  "Not enough points to write in this board": "포인트가 부족해 글을 쓸 수 없습니다.",
  "Not enough points to comment in this board": "포인트가 부족해 댓글을 쓸 수 없습니다.",
  "You have already recommended or not recommended this post": "이미 추천 또는 비추천한 글입니다.",
  "You cannot recommend or not recommend your own post": "내가 쓴 글은 추천 · 비추천할 수 없습니다.",
  "You can recommend this post only after reading it": "글을 읽은 뒤에 추천할 수 있습니다.",
  "This board does not allow recommendations": "이 게시판은 추천 기능을 쓰지 않습니다.",
  "This board does not allow not recommendations": "이 게시판은 비추천 기능을 쓰지 않습니다.",
  "Invalid scrap target": "스크랩할 수 없는 글입니다.",
  "Scrap not found": "스크랩을 찾을 수 없습니다.",
  "Memo not found": "쪽지를 찾을 수 없습니다.",
  "Notification not found": "알림을 찾을 수 없습니다.",
  "Reporter identity required (login or signed device)": "로그인 후 신고할 수 있습니다.",

  // 파일 · 이미지
  "Unsupported image type": "지원하지 않는 이미지 형식입니다.",
  "Unsupported file type": "지원하지 않는 파일 형식입니다.",
  "Invalid image file": "올바른 이미지 파일이 아닙니다.",
  "Invalid file content. Only image files are allowed": "이미지 파일만 올릴 수 있습니다.",
  "Image decode failed": "이미지를 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.",
  "Image decode failed. File may be corrupted or malformed": "이미지를 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.",
  "File size exceeds the 20 MB limit": "파일은 20MB 까지 올릴 수 있습니다.",
  "Image dimensions are too large": "이미지 가로 · 세로가 너무 큽니다. 한 변 20000px, 4천만 화소 이하로 줄여 주세요.",
  "Failed to save uploaded file": "파일을 저장하지 못했습니다.",
  "Upload processing failed": "파일을 올리지 못했습니다.",
  "Attachment upload failed": "첨부파일을 올리지 못했습니다.",
  "Invalid upload": "올바르지 않은 업로드입니다.",
  "Invalid uploaded attachment": "올바르지 않은 첨부파일입니다.",
  "Only up to two Q&A attachments are allowed": "첨부파일은 두 개까지 올릴 수 있습니다.",
  "Attachment exceeds the configured Q&A upload size": "첨부파일이 허용 크기를 넘습니다.",

  // 설문 · FAQ · 문의
  "Poll not found": "설문을 찾을 수 없습니다.",
  "Active poll not found": "진행 중인 설문이 없습니다.",
  "This poll is closed": "마감된 설문입니다.",
  "You have already voted in this poll": "이미 투표한 설문입니다.",
  "You do not have permission to vote in this poll": "이 설문에 투표할 권한이 없습니다.",
  "You do not have permission to comment on this poll": "이 설문에 의견을 쓸 권한이 없습니다.",
  "You do not have permission to delete this opinion": "이 의견을 삭제할 권한이 없습니다.",
  "Please select a poll option": "항목을 선택해 주세요.",
  "Invalid poll option": "올바르지 않은 설문 항목입니다.",
  "Please enter an opinion": "의견을 입력해 주세요.",
  "Poll opinions are disabled": "이 설문은 의견을 받지 않습니다.",
  "Poll opinion not found": "의견을 찾을 수 없습니다.",
  "FAQ category not found": "FAQ 분류를 찾을 수 없습니다.",
  "Q&A item not found": "문의를 찾을 수 없습니다.",
  "Original Q&A item not found": "원래 문의를 찾을 수 없습니다.",
  "You do not have permission to delete this Q&A item": "이 문의를 삭제할 권한이 없습니다.",
  "You cannot edit answered Q&A items": "답변이 달린 문의는 수정할 수 없습니다.",
  "Invalid Q&A category": "문의 분류가 올바르지 않습니다.",
  "Please enter answer content": "답변 내용을 입력해 주세요.",
  "Please enter an answer subject": "답변 제목을 입력해 주세요.",
  "Question not found": "질문을 찾을 수 없습니다.",

  // 쇼핑몰
  "Product not found": "상품을 찾을 수 없습니다.",
  "Product is sold out": "품절된 상품입니다.",
  "Product is not available": "판매하지 않는 상품입니다.",
  "This product is available by phone inquiry only": "전화 문의로만 구매할 수 있는 상품입니다.",
  "Selected option is not available": "선택한 옵션은 구매할 수 없습니다.",
  "Selected option is no longer available": "선택한 옵션은 더 이상 구매할 수 없습니다.",
  "Select a product option": "상품 옵션을 선택해 주세요.",
  "Base option is required": "필수 옵션을 먼저 선택해 주세요.",
  "Base option is required before adding supply options": "추가 옵션보다 필수 옵션을 먼저 선택해 주세요.",
  "Quantity must be at least 1": "수량은 1개 이상이어야 합니다.",
  "ct_qty must be at least 1": "수량은 1개 이상이어야 합니다.",
  "Products with a negative purchase amount cannot be purchased": "구매할 수 없는 상품 금액입니다.",
  "Products with a zero or negative purchase price cannot be purchased": "구매할 수 없는 상품 금액입니다.",
  "Products with a negative supplemental option price cannot be purchased": "구매할 수 없는 추가 옵션 금액입니다.",
  "Cart is empty": "장바구니가 비어 있습니다.",
  "Cart is empty. Add items before placing an order": "장바구니가 비어 있습니다. 상품을 담은 뒤 주문해 주세요.",
  "Cart is empty. Add items before quoting shipping": "장바구니가 비어 있습니다.",
  "Cart item not found": "장바구니 상품을 찾을 수 없습니다.",
  "Cart item no longer exists": "장바구니에서 빠진 상품입니다. 장바구니를 다시 확인해 주세요.",
  "Invalid cart item": "올바르지 않은 장바구니 상품입니다.",
  "Invalid cart item ids": "올바르지 않은 장바구니 상품입니다.",
  "Valid cart item ids are required": "주문할 상품을 선택해 주세요.",
  "Select at least one cart item": "상품을 하나 이상 선택해 주세요.",
  "Cart amount has changed. Please review the cart again": "장바구니 금액이 바뀌었습니다. 장바구니를 다시 확인해 주세요.",
  "Order items were selected too long ago. Please review the cart and order again": "상품을 고른 지 오래되었습니다. 장바구니를 다시 확인하고 주문해 주세요.",
  "Order not found": "주문을 찾을 수 없습니다.",
  "Order is not in pending state": "결제 대기 중인 주문이 아닙니다.",
  "Order is already finalized": "이미 처리된 주문입니다.",
  "Order is busy. Please retry shortly": "주문을 처리하는 중입니다. 잠시 후 다시 시도해 주세요.",
  "Order id and password are required": "주문번호와 비밀번호를 입력해 주세요.",
  "Order number and amount are required": "주문번호와 금액이 필요합니다.",
  "Order data is empty": "주문 정보가 비어 있습니다.",
  "Guest order password must be at least 3 letters or numbers": "비회원 주문 비밀번호는 영문 · 숫자 3자 이상이어야 합니다.",
  "Payment was not completed": "결제가 완료되지 않았습니다.",
  "Payment amount does not match the order amount": "결제 금액이 주문 금액과 다릅니다.",
  "Amount mismatch": "결제 금액이 맞지 않습니다.",
  "Approved amount does not match": "승인 금액이 맞지 않습니다.",
  "Approved order number does not match": "승인된 주문번호가 맞지 않습니다.",
  "Payment provider mismatch": "결제 수단이 맞지 않습니다.",
  "Payment confirmation is already in progress. Please retry shortly": "결제를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.",
  "Wishlist item not found": "위시리스트 상품을 찾을 수 없습니다.",
  "Item is already in your wishlist": "이미 위시리스트에 있는 상품입니다.",
  "Address not found": "배송지를 찾을 수 없습니다.",
  "No valid address was selected": "배송지를 선택해 주세요.",
  "Select at least one address to update": "배송지를 하나 이상 선택해 주세요.",
  "Default address must be included in selected items": "기본 배송지를 함께 선택해 주세요.",
  "Review not found": "후기를 찾을 수 없습니다.",
  "Product review not found": "상품 후기를 찾을 수 없습니다.",
  "Reviews can only be written for completed purchases": "구매를 완료한 상품만 후기를 쓸 수 있습니다.",
  "Product Q&A not found": "상품 문의를 찾을 수 없습니다.",
  "Answered product Q&A cannot be changed": "답변이 달린 상품 문의는 바꿀 수 없습니다.",
  "Coupon ID Error": "쿠폰을 찾을 수 없습니다.",
  "Banner not found": "배너를 찾을 수 없습니다.",
  "This product is not orderable by Naver Pay": "네이버페이로 주문할 수 없는 상품입니다.",
  "No orderable Naver Pay items were selected": "네이버페이로 주문할 수 있는 상품이 없습니다.",
  "No Naver Pay items were selected": "네이버페이로 주문할 상품을 선택해 주세요.",
  "No wishable Naver Pay items were selected": "네이버페이 찜에 담을 수 있는 상품이 없습니다.",
  "KAKAOPAY is not enabled": "카카오페이를 사용할 수 없습니다.",
  "Cash receipt issue link has expired": "현금영수증 발급 링크가 만료되었습니다.",
};

/** 뒤에 값이 붙는 문장. 앞부분이 같으면 이 문구로 바꾼다. */
const PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  // PG 결제 창(src/lib/payment.*.ts)이 던지는 문구. 취소는 "취소"가 들어가야 isPaymentCancelMessage 가 알아본다.
  [/^((KCP|Inicis|Nicepay|Toss) )?payment was cancell?ed|^(KCP|Inicis|Nicepay|Toss) payment cancell?ed/i, () => "결제가 취소되었습니다."],
  [/^(KCP|Inicis|Nicepay|Toss) .*timeout\.?$/i, () => "결제 응답이 늦어 결제를 마치지 못했습니다. 다시 시도해 주세요."],
  [/^(KCP|Inicis|Nicepay|Toss) authentication failed/i, () => "결제 인증에 실패했습니다. 다시 시도해 주세요."],
  [/^(KCP|Inicis|Nicepay|Toss) /, () => "결제를 진행하지 못했습니다. 잠시 후 다시 시도해 주세요."],
  [/^(\w+) is required\.?$/, (m) => `${fieldLabel(m[1])}을(를) 입력해 주세요.`],
  [/^(\w+) must be a valid email address\.?$/, () => "이메일 형식이 올바르지 않습니다."],
  [/^(\w+) must be at least (\d+) characters\.?$/, (m) => `${fieldLabel(m[1])}은(는) ${m[2]}자 이상이어야 합니다.`],
  [/^(\w+) must not exceed (\d+) characters\.?$/, (m) => `${fieldLabel(m[1])}은(는) ${m[2]}자까지 입력할 수 있습니다.`],
  [/^(\w+) must be (an integer|numeric)\.?$/, (m) => `${fieldLabel(m[1])}은(는) 숫자여야 합니다.`],
  [/^(\w+) must be one of: .*$/, (m) => `${fieldLabel(m[1])} 값이 올바르지 않습니다.`],
  [/^Requested quantity exceeds available (option )?stock/, () => "재고가 부족합니다. 수량을 줄여 주세요."],
  [/^Minimum purchase quantity for this product is (\d+)/, (m) => `이 상품은 ${m[1]}개 이상 구매해야 합니다.`],
  [/^Maximum purchase quantity for this product is (\d+)/, (m) => `이 상품은 ${m[1]}개까지 구매할 수 있습니다.`],
  [/^You can add up to (\d+)/, (m) => `${m[1]}개까지 담을 수 있습니다.`],
  [/^Invalid file type\. Allowed:/, () => "올릴 수 없는 파일 형식입니다."],
  [/^Attachment exceeds server upload_max_filesize/, () => "첨부파일이 서버가 허용하는 크기를 넘습니다."],
  [/^Payment verification failed/, () => "결제를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."],
  [/^Payment result requires manual reconciliation/, () => "결제 결과 확인이 필요합니다. 고객센터에 문의해 주세요."],
  [/^Not found\. Expected /, () => "요청한 내용을 찾을 수 없습니다."],
  [/ not found\.?$/i, () => "요청한 내용을 찾을 수 없습니다."],
  [/^You do not have permission/i, () => "권한이 없습니다."],
  [/^Too many /i, () => "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."],
];

/** 영어만 남았을 때 상태 코드로 고르는 문구. */
function byStatus(status: number): string {
  if (status === 401) return "로그인이 필요합니다. 로그인 후 다시 시도해 주세요.";
  if (status === 403) return "권한이 없습니다.";
  if (status === 404) return "요청한 내용을 찾을 수 없습니다.";
  if (status === 408) return "요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.";
  if (status === 409) return "이미 처리되었거나 다른 요청과 겹쳤습니다. 다시 확인해 주세요.";
  if (status === 413) return "보낸 내용이 너무 큽니다.";
  if (status === 422) return "입력한 내용을 확인해 주세요.";
  if (status === 429) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (status >= 500) return "서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";
  return "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
}

/** API 오류 메시지를 한국어로. 이미 한국어면 그대로 둔다. */
export function koreanApiErrorMessage(message: string | null | undefined, status: number): string {
  const text = (message ?? "").trim();
  if (text && HANGUL.test(text)) return text;

  const exact = EXACT[text.replace(/\.$/, "")];
  if (exact) return exact;

  for (const [pattern, render] of PATTERNS) {
    const match = text.match(pattern);
    if (match) return render(match);
  }

  return byStatus(status);
}

/** 필드별 검증 메시지(`{ wr_subject: "wr_subject is required." }`)도 같은 규칙으로 바꾼다. */
export function koreanApiFieldErrors(
  errors: Record<string, string | string[]> | undefined,
  status: number
): Record<string, string> | undefined {
  if (!errors || typeof errors !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(errors)) {
    const first = Array.isArray(value) ? value[0] : value;
    out[field] = koreanApiErrorMessage(typeof first === "string" ? first : "", status);
  }
  return out;
}

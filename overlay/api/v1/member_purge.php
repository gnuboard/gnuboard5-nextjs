<?php
/**
 * 회원 개인정보 즉시 영구 삭제.
 *
 * 개인정보 보호법 제21조(지체 없는 파기)에 맞춰 탈퇴 즉시 실행한다. 30일 유예는 두지 않는다.
 * DELETE /v1/members/me 와 plugin/webapp/cron/purge_withdrawn_members.php(안전망) 가 같은 함수를 쓴다.
 *
 * 무엇을 어떻게:
 *   - 회원 행: 삭제하지 않고 **비식별화**. mb_id 는 게시판 글의 외래키라 남긴다.
 *     비밀번호·이름·이메일·연락처·주소·CI·메모 등 개인정보 필드는 전부 비우고,
 *     mb_leave_date 를 채워 로그인 경로가 거부하게 한다.
 *   - 게시글·댓글: 남기되 작성자를 비식별화(wr_name='탈퇴회원', 이메일·홈페이지·IP 비움).
 *     다른 사람의 댓글이 달린 글이 사라지지 않게 하려는 것이고, 처리방침에 명시돼 있다.
 *   - 그 외 회원에 속한 행(디데이, 아기 기록, 푸시 토큰, 알림 이력, 소셜 연결, 세션,
 *     차단 목록, 스크랩, 쪽지, 포인트, 접속 기록, 소셜 티켓, 본인인증 이력, 글 임시저장,
 *     정기결제 카드, 웹 입장권)은 삭제. 기기 기록은 남기되 이 회원과의 연결 · IP · 브라우저를 지운다.
 *   - 신고 기록은 운영 목적으로 남기되 신고자 식별자만 비운다.
 *   - 파일(회원 아이콘·프로필 이미지·디데이 사진)은 DB 커밋 뒤에 지운다. 디데이 사진은 이 회원이 올린 에디터 그림만.
 *
 * 소셜 연결을 지우므로 같은 소셜 계정으로 바로 재가입할 수 있다.
 */

if (!function_exists('api_member_purge_now')) {
    /**
     * @return array{mb_id:string, deleted_files:int, anonymized_writes:int}
     */
    function api_member_purge_now(string $mb_id): array
    {
        global $g5;

        $mb_id = trim($mb_id);
        if ($mb_id === '') {
            throw new \InvalidArgumentException('mb_id is required');
        }

        $memberTable      = DB::table('member_table');
        // 디데이 제품(plugin/dday)이 없는 설치본도 있다 — 표 이름만 잡고, 없으면 아래에서 무시된다.
        $ddayTable        = isset($g5['user_dday_table']) ? $g5['user_dday_table'] : G5_TABLE_PREFIX . 'user_dday';
        $tokenTable       = DB::table('push_token_table');
        $notificationLog  = DB::table('notification_log_table');
        $socialTable      = isset($g5['social_profile_table'])
            ? $g5['social_profile_table']
            : G5_TABLE_PREFIX . 'member_social_profiles';
        $prefix = G5_TABLE_PREFIX;

        // 파일 삭제 대상은 트랜잭션 전에 모아 둔다. 커밋이 실패하면 파일도 건드리지 않는다.
        $imageUris = [];
        if (isset($g5['user_dday_table'])) {
            foreach (DB::fetchAll(
                "SELECT dday_image_uri FROM `{$ddayTable}` WHERE mb_id = ? AND dday_image_uri IS NOT NULL AND dday_image_uri <> ''",
                [$mb_id]
            ) as $row) {
                $imageUris[] = (string) $row['dday_image_uri'];
            }
        }

        $boards = [];
        foreach (DB::fetchAll("SELECT bo_table FROM `{$prefix}board`") as $row) {
            $bo = (string) $row['bo_table'];
            if ($bo !== '' && preg_match('/^[a-z0-9_]+$/i', $bo)) {
                $boards[] = $bo;
            }
        }

        $suffix = substr(hash('sha256', $mb_id . '|' . microtime(true)), 0, 10);
        $withdrawnNick = '탈퇴회원' . $suffix;
        $anonymizedWrites = 0;

        DB::beginTransaction();
        try {
            // 1) 회원 행 비식별화. mb_id 와 가입일만 남는다.
            DB::execute(
                "UPDATE `{$memberTable}`
                    SET mb_password = '', mb_name = '', mb_nick = ?, mb_email = '',
                        mb_homepage = '', mb_sex = '', mb_birth = '', mb_tel = '', mb_hp = '',
                        mb_certify = '', mb_adult = 0, mb_dupinfo = '',
                        mb_zip1 = '', mb_zip2 = '', mb_addr1 = '', mb_addr2 = '', mb_addr3 = '',
                        mb_addr_jibeon = '', mb_signature = '', mb_recommend = '', mb_point = 0,
                        mb_login_ip = '', mb_ip = '', mb_memo = '', mb_lost_certify = '',
                        mb_email_certify2 = '', mb_memo_call = '', mb_profile = '',
                        mb_agree_log = '', mb_mailling = '', mb_sms = '', mb_open = '',
                        mb_marketing_agree = '', mb_thirdparty_agree = '',
                        mb_1 = '', mb_2 = '', mb_3 = '', mb_4 = '', mb_5 = '',
                        mb_6 = '', mb_7 = '', mb_8 = '', mb_9 = '', mb_10 = '',
                        mb_leave_date = ?
                  WHERE mb_id = ?",
                [$withdrawnNick, date('Ymd'), $mb_id]
            );

            // 2) 게시글·댓글 작성자 비식별화. 테이블이 없는 게시판은 건너뛴다.
            foreach ($boards as $bo) {
                try {
                    $anonymizedWrites += (int) DB::execute(
                        "UPDATE `{$prefix}write_{$bo}`
                            SET wr_name = '탈퇴회원', wr_email = '', wr_homepage = '', wr_ip = ''
                          WHERE mb_id = ?",
                        [$mb_id]
                    );
                } catch (\Throwable $e) {
                    // 게시판 테이블이 아직 없을 수 있다.
                }
            }

            // 3) 회원에 속한 행 삭제. 설치본에 따라 없는 테이블은 무시한다.
            $deleteByMbId = [
                "`{$ddayTable}`",
                "`{$prefix}user_dday_local`",
                "`{$prefix}baby_log`",
                "`{$prefix}baby_growth`",
                "`{$prefix}baby_vaccine`",
                "`{$prefix}baby`",
                "`{$tokenTable}`",
                "`{$notificationLog}`",
                // 알림함 행을 지우면 그 행을 가리키던 큐 작업은 보낼 내용이 없다. 같이 지운다.
                "`{$prefix}push_queue`",
                // 회원 설정·로그인 시도 카운터·약관 동의 이력도 이 회원의 개인정보다.
                // (동의 이력을 법적 근거로 보존해야 한다면 이 줄을 빼고 legal/ 문서에 그렇게 밝힐 것.)
                "`{$prefix}member_pref`",
                "`{$prefix}member_legal_consent`",
                "`{$prefix}login_attempt`",
                "`{$socialTable}`",
                "`{$prefix}refresh_token`",
                "`{$prefix}member_block`",
                "`{$prefix}board_good`",
                "`{$prefix}scrap`",
                "`{$prefix}point`",
                "`{$prefix}login`",
                "`{$prefix}social_mobile_ticket`",
                // 본인인증 이력(실명 · 휴대전화 · 생년월일, 인증 IP) — 원본 admin_clear_member_certification() 이 지우는 두 표.
                "`{$prefix}member_cert_history`",
                "`{$prefix}cert_history`",
                // 글 임시저장(올리지 않은 초안), 정기결제 카드(빌링키 — 남기면 결제가 된다), 웹 입장권.
                "`{$prefix}autosave`",
                "`{$prefix}subscription_mb_cardinfo`",
                "`{$prefix}web_ticket`",
            ];
            foreach ($deleteByMbId as $table) {
                try {
                    DB::execute("DELETE FROM {$table} WHERE mb_id = ?", [$mb_id]);
                } catch (\Throwable $e) {
                    // 없는 테이블은 건너뛴다.
                }
            }

            // 기기 기록은 남기되(다른 회원이 그 기기를 가져가지 못하게 하는 보호에 쓴다) 이 회원과의 연결 · IP · 브라우저는 지운다.
            try {
                DB::execute(
                    "UPDATE `{$prefix}device`
                        SET claimed_by_mb_id = NULL, claimed_at = NULL, first_ip = NULL, last_ip = NULL, user_agent = NULL
                      WHERE claimed_by_mb_id = ?",
                    [$mb_id]
                );
            } catch (\Throwable $e) {
            }

            // 쪽지는 보낸 것과 받은 것 모두.
            try {
                DB::execute(
                    "DELETE FROM `{$prefix}memo` WHERE me_recv_mb_id = ? OR me_send_mb_id = ?",
                    [$mb_id, $mb_id]
                );
            } catch (\Throwable $e) {
            }

            // 신고 기록은 남기되 신고자만 비운다 (운영 목적, 개인정보 아님).
            try {
                DB::execute(
                    "UPDATE `{$prefix}content_report` SET reporter_mb = '' WHERE reporter_mb = ?",
                    [$mb_id]
                );
            } catch (\Throwable $e) {
            }

            // 5) 쇼핑 테이블(앱 SC-20). 실패하면 탈퇴 전체를 되돌린다 — 처리방침 문구와 실제 동작이 어긋나면 안 된다.
            $shopResult = api_member_purge_shop($mb_id);
            $printResult = api_member_purge_print($mb_id);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        // 4) 파일. DB 가 확정된 뒤에만 지운다.
        $deletedFiles = 0;
        $deletedFiles += api_member_purge_unlink_member_images($mb_id);
        foreach ($imageUris as $uri) {
            $deletedFiles += api_member_purge_unlink_data_file($uri, $mb_id);
        }

        return [
            'mb_id'             => $mb_id,
            'deleted_files'     => $deletedFiles,
            'anonymized_writes' => $anonymizedWrites,
            'shop'              => $shopResult,
            'print'             => $printResult,
        ];
    }
}

if (!function_exists('api_member_purge_shop_table')) {
    /**
     * 쇼핑 표 이름 — $g5 키(없으면 G5_SHOP_TABLE_PREFIX.접미사)가 가리키는 표가 실제로 있을 때만. 없으면 ''.
     * 설정 키는 dbconfig 에 늘 있지만 표는 설치본에 따라 없을 수 있다 — 없는 표 하나 때문에 탈퇴 전체가
     * 실패하면 안 된다(표가 있는데 문장이 실패하는 것은 그대로 던져 탈퇴를 되돌린다).
     */
    function api_member_purge_shop_table(string $key, string $suffix): string
    {
        global $g5;
        static $exists = [];
        $name = !empty($g5[$key]) ? (string) $g5[$key] : (defined('G5_SHOP_TABLE_PREFIX') ? G5_SHOP_TABLE_PREFIX . $suffix : '');
        if ($name === '' || !preg_match('/^[A-Za-z0-9_]+$/', $name)) {
            return '';
        }
        // 있는 표만 기억한다(탈퇴는 드물다 — 없다는 답은 다음 호출에서 다시 확인해도 된다).
        if (empty($exists[$name])) {
            $exists[$name] = (bool) DB::fetch(
                'SELECT 1 AS x FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
                [$name]
            );
        }
        return $exists[$name] ? $name : '';
    }
}

if (!function_exists('api_member_purge_shop')) {
    /**
     * 쇼핑(영카트) 테이블 — 앱 SERVER-CHANGES SC-20. api_member_purge_now 의 트랜잭션 안에서 부른다.
     *
     *   - 주문·개인결제 행은 남긴다(전자상거래법 거래기록 보존) — 식별 필드만 익명화한다.
     *     이름 → '탈퇴회원', 연락처·주소·입금자명·IP·배송 요청문(od_memo) → 공백.
     *     금액·상태·상품·송장·PG 거래번호·현금영수증 기록(od_cash_*)·입금 계좌·mb_id 는 그대로(거래·세무 기록).
     *   - 개인결제는 mb_id 가 없어 이 회원 주문에 od_id 로 이어진 행만 익명화한다(관리자가 잇지 않은 행은 판별 불가).
     *   - 리뷰·상품문의는 작성자명·연락처만 익명화하고 본문은 남긴다.
     *   - 주문에 묶이지 않은 장바구니 행(od_id 가 주문 표에 없는 행), 위시, 저장 배송지는 지운다.
     *   - 주문서 원문을 직렬화해 담는 PG 임시 주문서(order_data)·결제 요청 로그(order_post_log)·
     *     관리자 삭제 주문 백업(order_delete)은 익명화할 수 없으니 이 회원 행을 지운다.
     * 쇼핑 표가 없는 설치본은 그 표만 건너뛴다.
     *
     * @return array{orders:int, personalpay:int, reviews:int, qas:int, deleted:int}
     */
    function api_member_purge_shop(string $mb_id): array
    {
        $out = ['orders' => 0, 'personalpay' => 0, 'reviews' => 0, 'qas' => 0, 'deleted' => 0];
        $order = api_member_purge_shop_table('g5_shop_order_table', 'order');
        $history = '[' . date('Y-m-d H:i:s') . '] 회원 탈퇴로 식별정보 익명화';

        if ($order !== '') {
            $out['orders'] = (int) DB::execute(
                "UPDATE `{$order}`
                    SET od_name = '탈퇴회원', od_b_name = '탈퇴회원',
                        od_email = '', od_tel = '', od_hp = '', od_b_tel = '', od_b_hp = '',
                        od_zip1 = '', od_zip2 = '', od_addr1 = '', od_addr2 = '', od_addr3 = '', od_addr_jibeon = '',
                        od_b_zip1 = '', od_b_zip2 = '', od_b_addr1 = '', od_b_addr2 = '', od_b_addr3 = '', od_b_addr_jibeon = '',
                        od_deposit_name = '', od_ip = '', od_memo = '',
                        od_mod_history = CASE WHEN od_mod_history = '' THEN ? ELSE CONCAT(od_mod_history, '\n', ?) END
                  WHERE mb_id = ?",
                [$history, $history, $mb_id]
            );
        }

        $personalpay = api_member_purge_shop_table('g5_shop_personalpay_table', 'personalpay');
        if ($personalpay !== '' && $order !== '') {
            $out['personalpay'] = (int) DB::execute(
                "UPDATE `{$personalpay}`
                    SET pp_name = '탈퇴회원', pp_email = '', pp_hp = '', pp_deposit_name = '', pp_receipt_ip = '', pp_ip = ''
                  WHERE od_id IN (SELECT od_id FROM `{$order}` WHERE mb_id = ?)",
                [$mb_id]
            );
        }
        $use = api_member_purge_shop_table('g5_shop_item_use_table', 'item_use');
        if ($use !== '') {
            $out['reviews'] = (int) DB::execute(
                "UPDATE `{$use}` SET is_name = '탈퇴회원', is_ip = '' WHERE mb_id = ?",
                [$mb_id]
            );
        }
        $qa = api_member_purge_shop_table('g5_shop_item_qa_table', 'item_qa');
        if ($qa !== '') {
            $out['qas'] = (int) DB::execute(
                "UPDATE `{$qa}` SET iq_name = '탈퇴회원', iq_email = '', iq_hp = '', iq_ip = '' WHERE mb_id = ?",
                [$mb_id]
            );
        }

        // 주문에 묶이지 않은 장바구니 행만. 초안·주문에 묶인 행은 주문 기록의 일부라 남긴다.
        $cart = api_member_purge_shop_table('g5_shop_cart_table', 'cart');
        if ($cart !== '' && $order !== '') {
            $out['deleted'] += (int) DB::execute(
                "DELETE c FROM `{$cart}` c
                   LEFT JOIN `{$order}` o ON o.od_id = c.od_id
                  WHERE c.mb_id = ? AND o.od_id IS NULL",
                [$mb_id]
            );
        }
        $byMember = [
            'g5_shop_wish_table' => 'wish',
            'g5_shop_order_address_table' => 'order_address',
            'g5_shop_order_data_table' => 'order_data',
            'g5_shop_post_log_table' => 'order_post_log',
            'g5_shop_order_delete_table' => 'order_delete',
        ];
        foreach ($byMember as $key => $suffix) {
            $table = api_member_purge_shop_table($key, $suffix);
            if ($table !== '') {
                $out['deleted'] += (int) DB::execute("DELETE FROM `{$table}` WHERE mb_id = ?", [$mb_id]);
            }
        }

        return $out;
    }
}

if (!function_exists('api_member_purge_print')) {
    /**
     * 인쇄(plugin/print) 표 — 쇼핑과 같은 원칙. 주문은 거래기록이라 남기고 받는 사람 이름 · 연락처 · 주소 · 요청문만
     * 익명화하고, 리뷰는 작성자명만 익명화한다. 아트워크(올린 디자인)는 주문 품목이 가리키는 것만 주문 기록으로 남기고
     * 나머지는 지운다. print 를 쓰지 않는 설치본(설정 키 · 표 없음)은 건너뛴다.
     *
     * @return array{orders:int, reviews:int, artworks:int}
     */
    function api_member_purge_print(string $mb_id): array
    {
        $table = static function (string $key): string {
            global $g5;
            $name = !empty($g5[$key]) ? (string) $g5[$key] : '';
            if ($name === '' || !preg_match('/^[A-Za-z0-9_]+$/', $name)) {
                return '';
            }
            return DB::fetch(
                'SELECT 1 AS x FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
                [$name]
            ) ? $name : '';
        };

        $out = ['orders' => 0, 'reviews' => 0, 'artworks' => 0];
        $order = $table('print_order_table');
        if ($order !== '') {
            $out['orders'] = (int) DB::execute(
                "UPDATE `{$order}`
                    SET receiver_name = '탈퇴회원', receiver_phone = '', zipcode = '', addr1 = '', addr2 = '', memo = NULL
                  WHERE mb_id = ?",
                [$mb_id]
            );
        }
        $review = $table('print_review_table');
        if ($review !== '') {
            $out['reviews'] = (int) DB::execute(
                "UPDATE `{$review}` SET mb_name = '탈퇴회원' WHERE mb_id = ?",
                [$mb_id]
            );
        }
        $artwork = $table('print_artwork_table');
        $orderItem = $table('print_order_item_table');
        if ($artwork !== '' && $orderItem !== '') {
            $out['artworks'] = (int) DB::execute(
                "DELETE a FROM `{$artwork}` a
                   LEFT JOIN `{$orderItem}` i ON i.artwork_id = a.artwork_id
                  WHERE a.mb_id = ? AND i.item_id IS NULL",
                [$mb_id]
            );
        }

        return $out;
    }
}

if (!function_exists('api_member_purge_unlink_member_images')) {
    /** 회원 아이콘과 프로필 이미지. 그누보드 경로 규칙: data/{member|member_image}/{앞 2자}/{mb_id}.gif */
    function api_member_purge_unlink_member_images(string $mb_id): int
    {
        if (!defined('G5_DATA_PATH') || !preg_match('/^[A-Za-z0-9_\-]+$/', $mb_id)) {
            return 0;
        }
        $count = 0;
        $dir = substr($mb_id, 0, 2);
        foreach (['member', 'member_image'] as $kind) {
            foreach (['gif', 'jpg', 'png', 'webp'] as $ext) {
                $path = G5_DATA_PATH . '/' . $kind . '/' . $dir . '/' . $mb_id . '.' . $ext;
                if (is_file($path) && @unlink($path)) {
                    $count++;
                }
            }
        }
        return $count;
    }
}

if (!function_exists('api_member_purge_unlink_data_file')) {
    /**
     * dday_image_uri 가 이 회원이 POST /v1/upload 로 올린 에디터 그림(data/editor/<yymm>/<파일>)일 때만 지운다.
     * dday_image_uri 는 회원이 직접 쓰는 값이라(…/data/dbconfig.php 같은 주소도 저장할 수 있다) data/ 안이라는 것만으로는
     * 지우지 않는다 — 에디터 그림 이름 규칙에 맞고, 그림 옆 정보 파일의 owner_hash 가 이 회원일 때만(upload.php 삭제와 같은 확인).
     * 기기 로컬 URI(file://, content://)나 외부 URL 은 건드릴 수 없으니 무시한다.
     */
    function api_member_purge_unlink_data_file(string $uri, string $mb_id): int
    {
        if (!defined('G5_DATA_PATH') || !defined('G5_DATA_URL') || $mb_id === '') {
            return 0;
        }
        $uri = trim($uri);
        if ($uri === '' || strpos($uri, G5_DATA_URL) !== 0) {
            return 0;
        }
        $relative = substr($uri, strlen(G5_DATA_URL));
        $relative = strtok($relative, '?#');
        $relative = rawurldecode((string) $relative);
        // 에디터 그림 이름 규칙(upload.php api_upload_editor_file_path_from_url 과 같다)만. 그 밖의 data/ 파일은 지우지 않는다.
        if (!preg_match('#^/?editor/([0-9]{4})/([A-Za-z0-9][A-Za-z0-9_.-]*\.(?:gif|jpe?g|png|webp|bmp))$#i', (string) $relative, $m)) {
            return 0;
        }

        $editorRoot = realpath(G5_DATA_PATH . '/editor');
        $target = realpath(G5_DATA_PATH . '/editor/' . $m[1] . '/' . $m[2]);
        if ($editorRoot === false || $target === false || !is_file($target)) {
            return 0;
        }
        // data/editor/ 밖으로 나가는 경로(링크 등)는 절대 지우지 않는다.
        if (strpos($target, $editorRoot . DIRECTORY_SEPARATOR) !== 0) {
            return 0;
        }
        if (!api_member_purge_owns_editor_file($target, $mb_id) || !@unlink($target)) {
            return 0;
        }
        @unlink($target . '.meta.php');
        @unlink($target . '.meta.json');
        return 1;
    }
}

if (!function_exists('api_member_purge_owns_editor_file')) {
    /**
     * 에디터 그림 옆 정보 파일(.meta.php, 예전 .meta.json)의 owner_hash 가 이 회원인가.
     * 해시 식은 api/v1/upload.php api_upload_owner_hash() 와 같다(그 파일은 라우트라 여기서 불러 쓸 수 없다).
     * 정보 파일이 없거나 읽지 못하면 이 회원 것이라고 볼 수 없으니 지우지 않는다.
     */
    function api_member_purge_owns_editor_file(string $filePath, string $mb_id): bool
    {
        if (!defined('JWT_SECRET') && is_file(__DIR__ . '/../lib/JWT.php')) {
            require_once __DIR__ . '/../lib/JWT.php'; // 크론(purge_withdrawn_members.php)은 JWT 를 불러오지 않는다
        }
        $guard = defined('API_UPLOAD_META_GUARD') ? API_UPLOAD_META_GUARD : "<?php exit; ?>\n";
        foreach (array($filePath . '.meta.php', $filePath . '.meta.json') as $metaPath) {
            if (!is_file($metaPath)) {
                continue;
            }
            $raw = @file_get_contents($metaPath);
            if (!is_string($raw) || $raw === '') {
                return false;
            }
            if (strpos($raw, $guard) === 0) {
                $raw = substr($raw, strlen($guard));
            }
            $meta = json_decode($raw, true);
            $ownerHash = is_array($meta) && isset($meta['owner_hash']) ? (string) $meta['owner_hash'] : '';
            if ($ownerHash === '') {
                return false;
            }
            $secret = defined('JWT_SECRET') ? JWT_SECRET : (defined('G5_TOKEN_ENCRYPTION_KEY') ? G5_TOKEN_ENCRYPTION_KEY : '');
            return hash_equals($ownerHash, hash_hmac('sha256', $mb_id, (string) $secret));
        }
        return false;
    }
}

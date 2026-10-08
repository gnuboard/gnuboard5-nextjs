<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_orders_had_pg_payment')) {
    /**
     * 실제로 PG 결제가 받아진 주문인가 — 이때만 주문자 취소가 PG 취소를 부르고 환불액을 기록한다. 무통장(영카트는 od_pg 에
     * 상점 PG 를 늘 적는다)이나 거래번호 · 입금 시각이 없는 주문에 PG 취소를 부르면 장부와 부분취소 산식이 어긋난다.
     */
    function shop_orders_had_pg_payment(array $order): bool
    {
        $receiptTime = (string) ($order['od_receipt_time'] ?? '');
        return !empty($order['od_pg'])
            && trim((string) ($order['od_tno'] ?? '')) !== ''
            && (string) ($order['od_settle_case'] ?? '') !== '무통장'
            && (int) ($order['od_receipt_price'] ?? 0) > 0
            && $receiptTime !== '' && strpos($receiptTime, '0000') !== 0 && strpos($receiptTime, '1000') !== 0;
    }
}

if (!function_exists('shop_orders_toss_secret_key')) {
    function shop_orders_toss_secret_key(array $cfg): string
    {
        // 결제 승인과 같은 규칙(payment_toss_helpers.php pg_toss_secret_key) — 관리자 '결제 테스트' 를 따르고, 실결제인데
        // live_ 키가 없으면 '' 로 취소를 멈춘다(키가 비었을 때 공개 테스트 키로 조용히 바꿔 부르지 않는다).
        require_once __DIR__ . '/payment_helpers.php';
        return pg_toss_secret_key($cfg, pg_detect_test_mode($cfg, 'toss'));
    }
}

if (!function_exists('shop_orders_toss_api_request')) {
    function shop_orders_toss_api_request(array $cfg, string $method, string $path, ?array $payload = null, string $idempotencyKey = ''): array
    {
        $secretKey = shop_orders_toss_secret_key($cfg);
        if ($secretKey === '') {
            return ['ok' => false, 'error' => 'Toss API Secret Key is not configured.'];
        }
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'error' => 'PHP cURL extension is required for Toss.'];
        }

        $headers = [
            'Authorization: Basic ' . base64_encode($secretKey . ':'),
            'Content-Type: application/json',
        ];
        if ($idempotencyKey !== '') {
            $headers[] = 'Idempotency-Key: ' . substr($idempotencyKey, 0, 300);
        }

        $ch = curl_init('https://api.tosspayments.com' . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 30,
        ]);
        if ($payload !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        }
        $resp = curl_exec($ch);
        $errno = (int) curl_errno($ch);
        $curlError = curl_error($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $body = json_decode((string) $resp, true);
        if (!is_array($body)) {
            return [
                'ok' => false,
                'http' => $http,
                'errno' => $errno,
                'timed_out' => in_array($errno, [CURLE_OPERATION_TIMEDOUT, CURLE_COULDNT_CONNECT], true),
                'error' => $curlError !== '' ? $curlError : 'Toss returned an invalid response.',
            ];
        }
        if ($http < 200 || $http >= 300) {
            return [
                'ok' => false,
                'http' => $http,
                'errno' => $errno,
                'body' => $body,
                'error' => (string) ($body['message'] ?? ('Toss API failed. HTTP ' . $http)),
            ];
        }
        return ['ok' => true, 'http' => $http, 'body' => $body];
    }
}

if (!function_exists('shop_orders_toss_cancel_payment')) {
    function shop_orders_toss_cancel_payment(array $order, string $reason): array
    {
        $paymentKey = trim((string) ($order['od_tno'] ?? ''));
        if ($paymentKey === '') {
            return ['ok' => false, 'error' => 'Toss paymentKey(od_tno)가 없습니다.'];
        }

        $cancelReason = $reason !== '' ? $reason : '고객 요청 취소';
        if (function_exists('mb_substr')) {
            $cancelReason = mb_substr($cancelReason, 0, 200, 'UTF-8');
        } else {
            $cancelReason = substr($cancelReason, 0, 200);
        }
        $payload = [
            'cancelReason' => $cancelReason,
        ];
        // 환불 계좌(refundReceiveAccount)는 싣지 않는다 — 요청 본문 값을 그대로 실으면 주문자가 제3자 계좌로 환불을
        // 돌릴 수 있다. 주문자 취소는 '주문' 상태(가상계좌는 입금 전)만 받으므로 환불 계좌가 필요한 경우가 없다
        // (입금된 가상계좌 환불은 관리자 화면에서 한다 — 영카트 orderinquirycancel.php 도 받지 않는다).

        $cfg = shop_orders_payment_config();
        $idempotencyKey = 'cancel-' . hash('sha256', (string) ($order['od_id'] ?? '') . '|' . $paymentKey . '|' . (string) ($order['od_receipt_price'] ?? 0) . '|' . $reason);
        $cancel = shop_orders_toss_api_request(
            $cfg,
            'POST',
            '/v1/payments/' . rawurlencode($paymentKey) . '/cancel',
            $payload,
            $idempotencyKey
        );
        if (!empty($cancel['ok'])) {
            return ['ok' => true, 'body' => $cancel['body']];
        }

        $code = (string) (($cancel['body']['code'] ?? '') ?: '');
        if ($code === 'ALREADY_CANCELED_PAYMENT') {
            return ['ok' => true, 'body' => $cancel['body'], 'already_cancelled' => true];
        }

        return $cancel + ['ok' => false];
    }
}

if (!function_exists('shop_orders_pg_cancel_amount')) {
    function shop_orders_pg_cancel_amount(array $order): int
    {
        $receipt = (int) ($order['od_receipt_price'] ?? 0);
        $refunded = (int) ($order['od_refund_price'] ?? 0);
        return max(0, $receipt - $refunded);
    }
}

if (!function_exists('shop_orders_pg_cancel_partial_code')) {
    function shop_orders_pg_cancel_partial_code(array $order, int $cancelAmt): int
    {
        $receipt = (int) ($order['od_receipt_price'] ?? 0);
        $refunded = (int) ($order['od_refund_price'] ?? 0);
        if ($cancelAmt <= 0 || $receipt <= 0) {
            return 0;
        }

        return $refunded > 0 || $cancelAmt < $receipt ? 1 : 0;
    }
}

if (!function_exists('shop_orders_to_euckr')) {
    function shop_orders_to_euckr(string $value): string
    {
        if (function_exists('iconv')) {
            $converted = @iconv('UTF-8', 'EUC-KR//IGNORE', $value);
            if ($converted !== false) {
                return $converted;
            }
        }
        if (function_exists('mb_convert_encoding')) {
            return mb_convert_encoding($value, 'EUC-KR', 'UTF-8');
        }
        return $value;
    }
}

if (!function_exists('shop_orders_to_utf8')) {
    function shop_orders_to_utf8(string $value, string $from = 'EUC-KR'): string
    {
        if ($value === '') {
            return '';
        }
        if (function_exists('iconv')) {
            $converted = @iconv($from, 'UTF-8//IGNORE', $value);
            if ($converted !== false && $converted !== '') {
                return $converted;
            }
        }
        if (function_exists('mb_convert_encoding')) {
            return mb_convert_encoding($value, 'UTF-8', $from);
        }
        return $value;
    }
}

if (!function_exists('shop_orders_post_form')) {
    function shop_orders_post_form(string $url, array $params, int $timeout = 15): array
    {
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'error' => 'PHP cURL extension is required.'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($params),
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $resp = curl_exec($ch);
        $errno = (int) curl_errno($ch);
        $curlError = curl_error($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [
            'ok' => $errno === 0 && $http >= 200 && $http < 300,
            'http' => $http,
            'errno' => $errno,
            'timed_out' => function_exists('curl_errno') && in_array($errno, [CURLE_OPERATION_TIMEDOUT, CURLE_COULDNT_CONNECT], true),
            'raw' => (string) $resp,
            'error' => $curlError,
        ];
    }
}

if (!function_exists('shop_orders_kcp_site_config')) {
    function shop_orders_kcp_site_config(array $cfg): array
    {
        $mid = trim((string) ($cfg['de_kcp_mid'] ?? ''));
        $isTest = (int) ($cfg['de_card_test'] ?? 0) > 0
            || $mid === ''
            || $mid === '001'
            || preg_match('/^(T\d{4}|S\d{4})/', $mid) === 1;

        if ($isTest) {
            return [
                'test' => true,
                'site_cd' => (int) ($cfg['de_escrow_use'] ?? 0) === 1 ? 'T0007' : ($mid !== '' && preg_match('/^(T\d{4}|S\d{4})/', $mid) === 1 ? $mid : 'T0000'),
                'site_key' => (int) ($cfg['de_escrow_use'] ?? 0) === 1 ? '4Ho4YsuOZlLXUZUdOxM1Q7X__' : '3grptw1.zW0GSo4PQdaGvsF__',
                'gw_url' => 'testpaygw.kcp.co.kr',
            ];
        }

        $siteCd = preg_match('/^SR/', $mid) === 1 ? $mid : 'SR' . $mid;
        return [
            'test' => false,
            'site_cd' => $siteCd,
            'site_key' => trim((string) ($cfg['de_kcp_site_key'] ?? '')),
            'gw_url' => 'paygw.kcp.co.kr',
        ];
    }
}

if (!function_exists('shop_orders_kcp_cancel_payment')) {
    function shop_orders_kcp_cancel_payment(array $order, string $reason): array
    {
        $tno = trim((string) ($order['od_tno'] ?? ''));
        if ($tno === '') {
            return ['ok' => false, 'error' => 'KCP 거래번호(od_tno)가 없습니다.'];
        }
        if (!defined('G5_SHOP_PATH') || !is_file(G5_SHOP_PATH . '/kcp/pp_ax_hub_lib.php')) {
            return ['ok' => false, 'error' => 'KCP PP_CLI 라이브러리를 찾을 수 없습니다.'];
        }

        $cfg = shop_orders_payment_config();
        $site = shop_orders_kcp_site_config($cfg);
        if ($site['site_cd'] === '' || $site['site_key'] === '') {
            return ['ok' => false, 'error' => 'KCP site_cd/site_key 설정이 필요합니다.'];
        }

        require_once G5_SHOP_PATH . '/kcp/pp_ax_hub_lib.php';
        if (!class_exists('C_PP_CLI_T')) {
            return ['ok' => false, 'error' => 'KCP PP_CLI 클래스를 로드하지 못했습니다.'];
        }

        $homeDir = G5_SHOP_PATH . '/kcp';
        $keyDir = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? $homeDir . '/bin/pub.key' : '';
        require_once __DIR__ . '/kcp_log_helpers.php';
        $logDir = shop_api_kcp_log_dir(); // 없는 경로 — 결제 로그를 남기지 않는다(영카트와 같다)

        $oldLocale = setlocale(LC_CTYPE, 0);
        setlocale(LC_CTYPE, 'ko_KR.euc-kr');

        $payPlus = new C_PP_CLI_T;
        $payPlus->mf_clear();
        $payPlus->mf_set_modx_data('tno', $tno);
        $payPlus->mf_set_modx_data('mod_type', 'STSC');
        $payPlus->mf_set_modx_data('mod_ip', $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
        $payPlus->mf_set_modx_data('mod_desc', shop_orders_to_euckr($reason !== '' ? $reason : '고객 요청 취소'));

        $payPlus->mf_do_tx(
            $tno,
            $homeDir,
            $site['site_cd'],
            $site['site_key'],
            '00200000',
            '',
            $site['gw_url'],
            '8090',
            'payplus_cli_slib',
            (string) ($order['od_id'] ?? ''),
            $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
            '3',
            0,
            0,
            $keyDir,
            $logDir
        );

        if ($oldLocale !== false) {
            setlocale(LC_CTYPE, $oldLocale);
        } else {
            setlocale(LC_CTYPE, '');
        }

        $resCd = (string) ($payPlus->m_res_cd ?? '');
        $resMsg = shop_orders_to_utf8((string) ($payPlus->m_res_msg ?? ''));
        if ($resCd !== '0000') {
            return ['ok' => false, 'error' => '[' . $resCd . '] ' . $resMsg, 'code' => $resCd, 'message' => $resMsg];
        }

        return [
            'ok' => true,
            'code' => $resCd,
            'message' => $resMsg,
            'tno' => (string) $payPlus->mf_get_res_data('tno'),
        ];
    }
}

if (!function_exists('shop_orders_lg_cancel_payment')) {
    function shop_orders_lg_cancel_payment(array $order, string $reason): array
    {
        $tid = trim((string) ($order['od_tno'] ?? ''));
        if ($tid === '') {
            return ['ok' => false, 'error' => 'LG U+ transaction number(od_tno) is missing.'];
        }
        if (!defined('G5_SHOP_PATH') || !is_file(G5_SHOP_PATH . '/settle_lg.inc.php')) {
            return ['ok' => false, 'error' => 'LG U+ settle_lg.inc.php was not found.'];
        }
        if (!defined('G5_LGXPAY_PATH') || !is_file(G5_LGXPAY_PATH . '/lgdacom/XPayClient.php')) {
            return ['ok' => false, 'error' => 'LG U+ XPayClient library was not found.'];
        }

        global $default, $config;

        $cfg = shop_orders_payment_config();
        $default = is_array($default ?? null) ? array_merge($cfg, $default) : $cfg;
        $config = is_array($config ?? null) ? array_merge($cfg, $config) : $cfg;

        $lgMid = trim((string) ($config['cf_lg_mid'] ?? ''));
        $mertKey = trim((string) ($config['cf_lg_mert_key'] ?? ''));
        if ($lgMid === '' || $mertKey === '') {
            return ['ok' => false, 'error' => 'LG U+ MID/MertKey settings are required.'];
        }

        require_once G5_SHOP_PATH . '/settle_lg.inc.php';

        if (!class_exists('XPay')) {
            return ['ok' => false, 'error' => 'LG U+ XPay class could not be loaded.'];
        }
        if (empty($configPath) || empty($CST_PLATFORM) || empty($LGD_MID)) {
            return ['ok' => false, 'error' => 'LG U+ runtime configuration could not be loaded.'];
        }

        $xpay = new XPay($configPath, $CST_PLATFORM);
        $xpay->set_config_value('t' . $LGD_MID, $mertKey);
        $xpay->set_config_value($LGD_MID, $mertKey);
        $xpay->Init_TX($LGD_MID);

        $xpay->Set('LGD_TXNAME', 'Cancel');
        $xpay->Set('LGD_TID', $tid);

        $txOk = $xpay->TX();
        $code = method_exists($xpay, 'Response_Code') ? (string) $xpay->Response_Code() : '';
        $message = method_exists($xpay, 'Response_Msg') ? shop_orders_to_utf8((string) $xpay->Response_Msg()) : '';
        if (!$txOk || $code !== '0000') {
            return [
                'ok' => false,
                'error' => '[' . ($code !== '' ? $code : 'TX_FAILED') . '] ' . ($message !== '' ? $message : 'LG U+ cancel request failed.'),
                'code' => $code,
                'message' => $message,
            ];
        }

        return [
            'ok' => true,
            'code' => $code,
            'message' => $message,
            'tno' => method_exists($xpay, 'Response') ? (string) $xpay->Response('LGD_TID', 0) : $tid,
        ];
    }
}

if (!function_exists('shop_orders_inicis_mid')) {
    function shop_orders_inicis_mid(array $cfg): string
    {
        $mid = trim((string) ($cfg['de_inicis_mid'] ?? ''));
        if ((int) ($cfg['de_card_test'] ?? 0) > 0 || $mid === '' || in_array($mid, ['INIpayTest', 'soft000'], true)) {
            return (int) ($cfg['de_escrow_use'] ?? 0) === 1 ? 'iniescrow0' : 'INIpayTest';
        }
        return strpos($mid, 'SIR') === 0 ? $mid : 'SIR' . $mid;
    }
}

if (!function_exists('shop_orders_inicis_iniapi_key')) {
    function shop_orders_inicis_iniapi_key(array $cfg, string $mid): string
    {
        if ((int) ($cfg['de_card_test'] ?? 0) > 0 || in_array($mid, ['INIpayTest', 'iniescrow0'], true)) {
            return $mid === 'iniescrow0' ? 'yERbIlJ3NhTeObsA' : 'ItEQKi3rY7uvDS8l';
        }
        return trim((string) ($cfg['de_inicis_iniapi_key'] ?? ''));
    }
}

if (!function_exists('shop_orders_inicis_paymethod')) {
    function shop_orders_inicis_paymethod(string $settleCase): string
    {
        if (in_array($settleCase, ['신용카드', '간편결제', '삼성페이', 'lpay', 'inicis_kakaopay'], true)) {
            return 'Card';
        }
        if ($settleCase === '가상계좌') return 'GVacct';
        if ($settleCase === '계좌이체') return 'Acct';
        if ($settleCase === '휴대폰') return 'HPP';
        return 'Card';
    }
}

if (!function_exists('shop_orders_inicis_cancel_payment')) {
    function shop_orders_inicis_cancel_payment(array $order, string $reason): array
    {
        $tid = trim((string) ($order['od_tno'] ?? ''));
        if ($tid === '') {
            return ['ok' => false, 'error' => 'KG 이니시스 거래번호(od_tno)가 없습니다.'];
        }
        $cfg = shop_orders_payment_config();
        $mid = shop_orders_inicis_mid($cfg);
        $key = shop_orders_inicis_iniapi_key($cfg, $mid);
        if ($mid === '' || $key === '') {
            return ['ok' => false, 'error' => 'KG 이니시스 MID/INIAPI key 설정이 필요합니다.'];
        }

        $timestamp = date('YmdHis');
        $clientIp = $_SERVER['SERVER_ADDR'] ?? ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
        $paymethod = shop_orders_inicis_paymethod((string) ($order['od_settle_case'] ?? ''));
        $hashData = hash('sha512', $key . 'Refund' . $paymethod . $timestamp . $clientIp . $mid . $tid);
        $post = shop_orders_post_form('https://iniapi.inicis.com/api/v1/refund', [
            'type' => 'Refund',
            'paymethod' => $paymethod,
            'timestamp' => $timestamp,
            'clientIp' => $clientIp,
            'mid' => $mid,
            'tid' => $tid,
            'msg' => $reason !== '' ? $reason : '고객 요청 취소',
            'hashData' => $hashData,
        ]);
        if (empty($post['ok'])) {
            return ['ok' => false, 'error' => $post['error'] !== '' ? $post['error'] : 'KG 이니시스 취소 API 통신에 실패했습니다.', 'pg_response' => $post];
        }

        $body = json_decode((string) $post['raw'], true);
        if (!is_array($body)) {
            $body = json_decode(shop_orders_to_utf8((string) $post['raw']), true);
        }
        if (!is_array($body)) {
            return ['ok' => false, 'error' => 'KG 이니시스 취소 API 응답을 해석하지 못했습니다.', 'raw' => $post['raw']];
        }

        $code = (string) ($body['resultCode'] ?? '');
        if ($code !== '00') {
            return ['ok' => false, 'error' => '[' . $code . '] ' . (string) ($body['resultMsg'] ?? 'KG 이니시스 취소 실패'), 'body' => $body];
        }

        return ['ok' => true, 'body' => $body];
    }
}

if (!function_exists('shop_orders_kakaopay_cancel_payment')) {
    function shop_orders_kakaopay_cancel_payment(array $order, string $reason): array
    {
        $tid = trim((string) ($order['od_tno'] ?? ''));
        if ($tid === '') {
            return ['ok' => false, 'error' => 'KAKAOPAY transaction number(od_tno) is missing.'];
        }
        if (!defined('G5_SHOP_PATH') || !is_file(G5_SHOP_PATH . '/settle_kakaopay.inc.php')) {
            return ['ok' => false, 'error' => 'KAKAOPAY settle_kakaopay.inc.php was not found.'];
        }

        global $default, $config;

        $cfg = shop_orders_payment_config();
        $default = is_array($default ?? null) ? array_merge($cfg, $default) : $cfg;
        $config = is_array($config ?? null) ? array_merge($cfg, $config) : $cfg;

        if (empty($default['de_kakaopay_enckey'])) {
            return ['ok' => false, 'error' => 'KAKAOPAY is not enabled in YoungCart shop settings.'];
        }

        require_once G5_SHOP_PATH . '/settle_kakaopay.inc.php';
        if (!function_exists('inicis_tid_cancel')) {
            return ['ok' => false, 'error' => 'KAKAOPAY cancel helper(inicis_tid_cancel) could not be loaded.'];
        }

        $mid = trim((string) ($default['de_kakaopay_mid'] ?? ''));
        $iniapiKey = trim((string) ($default['de_kakaopay_iniapi_key'] ?? ''));
        if ($iniapiKey === '') {
            $iniapiKey = trim((string) ($default['de_kakaopay_key'] ?? ''));
        }
        if ($mid === '') {
            return ['ok' => false, 'error' => 'KAKAOPAY MID setting is required.'];
        }
        if ($iniapiKey === '') {
            return ['ok' => false, 'error' => 'KAKAOPAY INIAPI key setting is required.'];
        }

        $response = inicis_tid_cancel([
            'key' => $iniapiKey,
            'mid' => $mid,
            'paymethod' => shop_orders_inicis_paymethod((string) ($order['od_settle_case'] ?? 'KAKAOPAY')),
            'tid' => $tid,
            'msg' => $reason !== '' ? $reason : 'Customer requested cancellation',
        ]);

        $body = json_decode((string) $response, true);
        if (!is_array($body)) {
            $body = json_decode(shop_orders_to_utf8((string) $response), true);
        }
        if (!is_array($body)) {
            return ['ok' => false, 'error' => 'KAKAOPAY cancel API returned an invalid response.', 'raw' => (string) $response];
        }

        $code = (string) ($body['resultCode'] ?? '');
        if ($code !== '00') {
            return ['ok' => false, 'error' => '[' . $code . '] ' . (string) ($body['resultMsg'] ?? 'KAKAOPAY cancel failed.'), 'body' => $body];
        }

        return ['ok' => true, 'body' => $body];
    }
}

if (!function_exists('shop_orders_nicepay_mid')) {
    function shop_orders_nicepay_mid(array $cfg): string
    {
        if ((int) ($cfg['de_card_test'] ?? 0) > 0) {
            return 'nicepay00m';
        }

        $mid = trim((string) ($cfg['de_nicepay_mid'] ?? ''));
        return $mid !== '' && strpos($mid, 'SR') !== 0 ? 'SR' . $mid : $mid;
    }
}

if (!function_exists('shop_orders_nicepay_key')) {
    function shop_orders_nicepay_key(array $cfg): string
    {
        if ((int) ($cfg['de_card_test'] ?? 0) > 0) {
            return 'EYzu8jGGMfqaDEp76gSckuvnaHHu+bC4opsSN6lHv3b2lurNYkVXrZ7Z1AoqQnXI3eLuaUFyoRNC6FkrzVjceg==';
        }
        return trim((string) ($cfg['de_nicepay_key'] ?? ''));
    }
}

if (!function_exists('shop_orders_nicepay_cancel_payment')) {
    function shop_orders_nicepay_cancel_payment(array $order, string $reason): array
    {
        $tid = trim((string) ($order['od_tno'] ?? ''));
        if ($tid === '') {
            return ['ok' => false, 'error' => 'Nicepay 거래번호(od_tno)가 없습니다.'];
        }
        $cancelAmt = shop_orders_pg_cancel_amount($order);
        if ($cancelAmt <= 0) {
            return ['ok' => true, 'already_cancelled' => true, 'message' => '취소 가능한 PG 금액이 없습니다.'];
        }

        $cfg = shop_orders_payment_config();
        $mid = shop_orders_nicepay_mid($cfg);
        $merchantKey = shop_orders_nicepay_key($cfg);
        if ($mid === '' || $merchantKey === '') {
            return ['ok' => false, 'error' => 'Nicepay MID/상점키 설정이 필요합니다.'];
        }

        $ediDate = date('YmdHis');
        $params = [
            'TID' => $tid,
            'MID' => $mid,
            'Moid' => (string) ($order['od_id'] ?? ''),
            'CancelAmt' => $cancelAmt,
            'CancelMsg' => shop_orders_to_euckr($reason !== '' ? $reason : '고객 요청 취소'),
            'PartialCancelCode' => shop_orders_pg_cancel_partial_code($order, $cancelAmt),
            'EdiDate' => $ediDate,
            'SignData' => bin2hex(hash('sha256', $mid . $cancelAmt . $ediDate . $merchantKey, true)),
            'CharSet' => 'utf-8',
        ];
        // 환불 계좌(RefundAcctNo · RefundBankCd · RefundAcctNm)는 싣지 않는다 — Toss 취소와 같은 이유.

        $post = shop_orders_post_form('https://pg-api.nicepay.co.kr/webapi/cancel_process.jsp', $params);
        if (empty($post['ok'])) {
            return ['ok' => false, 'error' => $post['error'] !== '' ? $post['error'] : 'Nicepay 취소 API 통신에 실패했습니다.', 'pg_response' => $post];
        }

        $body = json_decode((string) $post['raw'], true);
        if (!is_array($body)) {
            $body = json_decode(shop_orders_to_utf8((string) $post['raw']), true);
        }
        if (!is_array($body)) {
            return ['ok' => false, 'error' => 'Nicepay 취소 API 응답을 해석하지 못했습니다.', 'raw' => $post['raw']];
        }

        $code = (string) ($body['ResultCode'] ?? '');
        if (!in_array($code, ['2001', '2211'], true)) {
            return ['ok' => false, 'error' => '[' . $code . '] ' . (string) ($body['ResultMsg'] ?? 'Nicepay 취소 실패'), 'body' => $body];
        }

        return ['ok' => true, 'body' => $body];
    }
}

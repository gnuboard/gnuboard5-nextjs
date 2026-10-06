<?php
/**
 * 영수증 주소 — 토스페이먼츠(LG U+) 카드 · 현금영수증 영수증 주소와 서명, 현금영수증 발급 주소.
 * common_session_helpers.php 가 읽는다(파일 크기 기준에 맞춰 떼어 냄).
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_lg_receipt_signature')) {
    function shop_api_lg_receipt_signature(string $kind, array $params, string $mertKey): string
    {
        unset($params['sig']);
        ksort($params);
        return hash_hmac('sha256', $kind . '|' . http_build_query($params, '', '&', PHP_QUERY_RFC3986), $mertKey);
    }
}

if (!function_exists('shop_api_lg_receipt_url')) {
    function shop_api_lg_receipt_url(string $kind, array $params, string $mertKey): string
    {
        $mertKey = trim($mertKey);
        if ($kind === '' || $mertKey === '') {
            return '';
        }

        foreach ($params as $value) {
            if (trim((string) $value) === '') {
                return '';
            }
        }

        $params['sig'] = shop_api_lg_receipt_signature($kind, $params, $mertKey);
        return shop_api_url_with_query(shop_api_base_url() . '/receipts/' . rawurlencode($kind), $params);
    }
}

if (!function_exists('shop_api_cash_receipt_issue_secret')) {
    function shop_api_cash_receipt_issue_secret(): string
    {
        if (defined('JWT_SECRET') && JWT_SECRET) {
            return (string) JWT_SECRET;
        }

        return hash('sha256',
            (defined('G5_MYSQL_USER') ? G5_MYSQL_USER : '') . '|' .
            (defined('G5_MYSQL_PASSWORD') ? G5_MYSQL_PASSWORD : '') . '|' .
            (defined('G5_MYSQL_DB') ? G5_MYSQL_DB : '')
        );
    }
}

if (!function_exists('shop_api_cash_receipt_issue_id')) {
    function shop_api_cash_receipt_issue_id(string $type, array $row): string
    {
        if ($type === 'personalpay') {
            return trim((string) ($row['pp_id'] ?? ''));
        }

        return trim((string) ($row['od_id'] ?? ''));
    }
}

if (!function_exists('shop_api_cash_receipt_issue_signature_payload')) {
    function shop_api_cash_receipt_issue_signature_payload(string $type, array $row, int $expires): array
    {
        $type = $type === 'personalpay' ? 'personalpay' : 'order';
        $id = shop_api_cash_receipt_issue_id($type, $row);

        if ($type === 'personalpay') {
            return [
                'type' => 'personalpay',
                'id' => $id,
                'time' => (string) ($row['pp_time'] ?? ''),
                'owner' => (string) ($row['mb_id'] ?? ''),
                'amount' => (string) ((int) ($row['pp_receipt_price'] ?? 0)),
                'cash' => (string) ((int) ($row['pp_cash'] ?? 0)),
                'expires' => (string) $expires,
            ];
        }

        return [
            'type' => 'order',
            'id' => $id,
            'time' => (string) ($row['od_time'] ?? ''),
            'ip' => (string) ($row['od_ip'] ?? ''),
            'owner' => (string) ($row['mb_id'] ?? ''),
            'amount' => (string) ((int) ($row['od_receipt_price'] ?? 0)),
            'cash' => (string) ((int) ($row['od_cash'] ?? 0)),
            'expires' => (string) $expires,
        ];
    }
}

if (!function_exists('shop_api_cash_receipt_issue_signature')) {
    function shop_api_cash_receipt_issue_signature(string $type, array $row, int $expires): string
    {
        $payload = shop_api_cash_receipt_issue_signature_payload($type, $row, $expires);
        ksort($payload);

        return hash_hmac(
            'sha256',
            http_build_query($payload, '', '&', PHP_QUERY_RFC3986),
            shop_api_cash_receipt_issue_secret()
        );
    }
}

if (!function_exists('shop_api_cash_receipt_issue_url')) {
    function shop_api_cash_receipt_issue_url(string $type, array $row, int $ttl = 86400): string
    {
        $type = $type === 'personalpay' ? 'personalpay' : 'order';
        $id = shop_api_cash_receipt_issue_id($type, $row);
        if ($id === '') {
            return '';
        }

        $expires = time() + max(300, $ttl);
        return shop_api_url_with_query(shop_api_base_url() . '/receipts/cash-issue', [
            'type' => $type,
            'id' => $id,
            'expires' => $expires,
            'sig' => shop_api_cash_receipt_issue_signature($type, $row, $expires),
        ]);
    }
}

if (!function_exists('shop_api_lg_payment_receipt_url')) {
    function shop_api_lg_payment_receipt_url(string $mid, string $tid, string $mertKey): string
    {
        return shop_api_lg_receipt_url('lg-payment', [
            'mid' => $mid,
            'tid' => $tid,
        ], $mertKey);
    }
}

if (!function_exists('shop_api_lg_platform')) {
    function shop_api_lg_platform(array $cfg): string
    {
        return (int) ($cfg['de_card_test'] ?? 0) > 0 ? 'test' : 'service';
    }
}

if (!function_exists('shop_api_lg_mid')) {
    function shop_api_lg_mid(array $cfg): string
    {
        $mid = trim((string) ($cfg['cf_lg_mid'] ?? ''));
        if ($mid === '') {
            return '';
        }

        $merchantId = strpos($mid, 'si_') === 0 ? $mid : 'si_' . $mid;
        return shop_api_lg_platform($cfg) === 'test' ? 't' . $merchantId : $merchantId;
    }
}

if (!function_exists('shop_api_lg_cash_trade_type')) {
    function shop_api_lg_cash_trade_type(string $settleCase): string
    {
        if ($settleCase === '계좌이체') {
            return 'BANK';
        }
        if ($settleCase === '가상계좌') {
            return 'CAS';
        }
        return 'CR';
    }
}

if (!function_exists('shop_api_lg_cash_receipt_url')) {
    function shop_api_lg_cash_receipt_url(string $mid, string $oid, string $casseqno, string $tradeType, string $platform, string $mertKey): string
    {
        return shop_api_lg_receipt_url('lg-cash', [
            'mid' => $mid,
            'oid' => $oid,
            'casseqno' => $casseqno,
            'trade' => $tradeType,
            'platform' => $platform,
        ], $mertKey);
    }
}

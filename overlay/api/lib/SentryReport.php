<?php
/**
 * 가벼운 Sentry 이벤트 전송 — SDK 설치 없이 직접 HTTP POST.
 *
 * 환경변수:
 *   SENTRY_DSN_BACKEND — 백엔드 전용 DSN (모바일 앱과 분리 권장)
 *   또는 환경변수 미설정 시 조용히 no-op (개발/스테이징 환경)
 *
 * 사용:
 *   SentryReport::error('send_dday_push failed', ['errors' => 5, 'sent' => 100]);
 *   SentryReport::warn('high failure rate', ['rate' => '40%']);
 *
 * 의도: cron / 백그라운드 작업의 실패율 추적. SDK 안 쓰는 이유는 composer 의존 없이
 * 그누보드 환경에서 즉시 동작하기 위함. 풍부한 기능 필요하면 sentry/sdk 도입.
 */

if (!defined('_GNUBOARD_')) exit;

class SentryReport
{
    public static function error(string $message, array $extra = []): void
    {
        self::send('error', $message, $extra);
    }

    public static function warn(string $message, array $extra = []): void
    {
        self::send('warning', $message, $extra);
    }

    public static function info(string $message, array $extra = []): void
    {
        self::send('info', $message, $extra);
    }

    private static function send(string $level, string $message, array $extra): void
    {
        $dsn = getenv('SENTRY_DSN_BACKEND') ?: '';
        if (!$dsn) return; // DSN 미설정 → 조용히 no-op

        // DSN 파싱: https://{publicKey}@{host}/{projectId}
        if (!preg_match('#^https://([^@]+)@([^/]+)/(.+)$#', $dsn, $m)) return;
        $publicKey = $m[1];
        $host      = $m[2];
        $projectId = $m[3];

        $envelopeUrl = "https://{$host}/api/{$projectId}/store/";

        $event = [
            'event_id'  => str_replace('-', '', self::uuid()),
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'level'     => $level,
            'logger'    => 'gnuboard5-backend',
            'platform'  => 'php',
            'server_name' => gethostname() ?: 'unknown',
            'message'   => ['formatted' => $message],
            'extra'     => self::scrub($extra),
            'tags'      => [
                'php_version' => PHP_VERSION,
                'script'      => basename($_SERVER['SCRIPT_NAME'] ?? 'cli'),
            ],
        ];

        $headers = [
            'Content-Type: application/json',
            'User-Agent: gnuboard5/1.0',
            'X-Sentry-Auth: Sentry sentry_version=7, sentry_key=' . $publicKey
                . ', sentry_client=gnuboard5-mini/0.1',
        ];

        $ch = curl_init($envelopeUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($event, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
        ]);
        @curl_exec($ch);
        @curl_close($ch);
    }

    /** UUID v4 — Sentry event_id 형식. */
    private static function uuid(): string
    {
        $data = function_exists('random_bytes') ? random_bytes(16) : openssl_random_pseudo_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    /** extra 데이터에서 민감 키 마스킹. */
    private static function scrub(array $extra): array
    {
        $sensitive = ['password', 'token', 'secret', 'authorization', 'cookie', 'email'];
        $clean = [];
        foreach ($extra as $key => $val) {
            $lc = strtolower((string) $key);
            $hide = false;
            foreach ($sensitive as $pat) {
                if (strpos($lc, $pat) !== false) { $hide = true; break; }
            }
            $clean[$key] = $hide ? '[Filtered]' : $val;
        }
        return $clean;
    }
}

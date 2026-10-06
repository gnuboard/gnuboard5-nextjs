<?php
/**
 * Shared helpers for the Next.js member API routes.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

function api_member_my_writes(string $mbId, bool $isComment, int $page, int $perPage): array
{
    $boards = DB::fetchAll(
        "SELECT bo_table, bo_subject FROM " . DB::table('board_table') . " ORDER BY bo_order ASC, bo_table ASC"
    );
    $items = [];
    $total = 0;
    $fetchLimit = max(1, $page * $perPage);

    foreach ($boards as $board) {
        $boTable = (string) ($board['bo_table'] ?? '');
        if ($boTable === '') {
            continue;
        }

        $writeTable = DB::writeTable($boTable);
        try {
            $boardTotal = DB::count(
                "SELECT COUNT(*) FROM {$writeTable} WHERE mb_id = ? AND wr_is_comment = ?",
                [$mbId, $isComment ? 1 : 0]
            );
            $total += $boardTotal;

            if ($boardTotal <= 0) {
                continue;
            }

            $select = $isComment
                ? 'wr_id, wr_parent, wr_content, wr_datetime'
                : 'wr_id, wr_parent, wr_subject, wr_seo_title, wr_datetime';
            $rows = DB::fetchAll(
                "SELECT {$select}
                   FROM {$writeTable}
                  WHERE mb_id = ? AND wr_is_comment = ?
                  ORDER BY wr_datetime DESC, wr_id DESC
                  LIMIT ?",
                [$mbId, $isComment ? 1 : 0, $fetchLimit]
            );

            foreach ($rows as $row) {
                $item = [
                    'wr_id' => (int) ($row['wr_id'] ?? 0),
                    'wr_datetime' => (string) ($row['wr_datetime'] ?? ''),
                    'bo_table' => $boTable,
                    'bo_subject' => (string) ($board['bo_subject'] ?? ''),
                    'wr_parent' => (int) ($row['wr_parent'] ?? 0),
                ];

                if ($isComment) {
                    $item['wr_content'] = (string) ($row['wr_content'] ?? '');
                } else {
                    $item['wr_subject'] = (string) ($row['wr_subject'] ?? '');
                    $item['wr_seo_title'] = (string) ($row['wr_seo_title'] ?? '');
                }

                $items[] = $item;
            }
        } catch (Throwable $e) {
            continue;
        }
    }

    usort($items, static function (array $a, array $b): int {
        $dateCompare = strcmp((string) ($b['wr_datetime'] ?? ''), (string) ($a['wr_datetime'] ?? ''));
        if ($dateCompare !== 0) {
            return $dateCompare;
        }

        return ((int) ($b['wr_id'] ?? 0)) <=> ((int) ($a['wr_id'] ?? 0));
    });

    $offset = ($page - 1) * $perPage;
    return [
        array_slice($items, $offset, $perPage),
        $total,
    ];
}

function api_member_registration_days($datetime): int
{
    $timestamp = strtotime((string) $datetime);
    if (!$timestamp) {
        return 1;
    }

    return max(1, (int) floor((time() - $timestamp) / 86400) + 1);
}

function api_member_profile_payload(array $member): array
{
    // 회원아이콘 · 회원이미지 경로(api/lib/helpers.php 공용). 한 사람만 다루므로 언제나 파일을 다시 본다.
    $media = api_member_media_urls(isset($member['mb_id']) ? (string) $member['mb_id'] : '', true);

    return [
        'mb_id'        => isset($member['mb_id']) ? (string) $member['mb_id'] : '',
        'mb_nick'      => isset($member['mb_nick']) ? (string) $member['mb_nick'] : '',
        'mb_level'     => (int) ($member['mb_level'] ?? 0),
        'mb_point'     => (int) ($member['mb_point'] ?? 0),
        'mb_open'      => (int) ($member['mb_open'] ?? 0),
        'mb_datetime'  => isset($member['mb_datetime']) ? (string) $member['mb_datetime'] : '',
        'mb_homepage'  => isset($member['mb_homepage']) ? (string) $member['mb_homepage'] : '',
        'mb_profile'   => isset($member['mb_profile']) ? (string) $member['mb_profile'] : '',
        'mb_icon_path' => $media['mb_icon_path'],
        'mb_image_path' => $media['mb_image_path'],
        'reg_days'     => api_member_registration_days($member['mb_datetime'] ?? ''),
    ];
}

function api_member_current_password_from_input(array $input): string
{
    if (isset($input['mb_password_current'])) {
        return (string) $input['mb_password_current'];
    }
    if (isset($input['current_password'])) {
        return (string) $input['current_password'];
    }
    return '';
}

function api_member_require_current_password(array $input, array $member): void
{
    $currentPassword = api_member_current_password_from_input($input);
    if ($currentPassword === '') {
        Response::error('Current password is required.', 422, [
            'mb_password_current' => 'Current password is required.',
        ]);
    }

    // 로그인 · 탈퇴와 같은 실패 횟수 제한 — 토큰만 가진 사람이 이 경로로 비밀번호를 대입하지 못하게.
    $mbId = (string) ($member['mb_id'] ?? '');
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $lockedMsg = Throttle::checkLoginAttempt($mbId, $ip);
    if ($lockedMsg !== null) {
        Response::error($lockedMsg, 429);
    }
    $hash = isset($member['mb_password']) ? (string) $member['mb_password'] : '';
    if ($hash === '' || !Auth::verifyPassword($currentPassword, $hash)) {
        Throttle::recordLoginFailure($mbId, $ip);
        Response::error('Current password is incorrect.', 401, [
            'mb_password_current' => 'Current password is incorrect.',
        ]);
    }
}

/**
 * 메일 인증 링크 보내기. $isEmailChange: 회원정보에서 이메일을 바꾼 경우(기본) / false 면 로그인 화면의 "다시 보내기".
 * 링크 주소는 설정으로 정한 사이트 주소만 쓴다(api_mail_link_base) — 없거나 발송에 실패하면 false.
 */
function api_member_send_email_verification_mail(string $mbId, string $email, string $token, bool $isEmailChange = true): bool
{
    if (!api_require_mailer()) {
        error_log('[api/members] mailer() unavailable for email verification mb_id=' . $mbId);
        return false;
    }
    $base = api_mail_link_base();
    if ($base === '') {
        error_log('[api/members] email verification mail skipped — set G5_DOMAIN (or the web app URL) mb_id=' . $mbId);
        return false;
    }

    $config = api_get_config();
    $siteName = (string) ($config['cf_title'] ?? '');
    $fromMail = (string) ($config['cf_admin_email'] ?? '');
    $verifyUrl = $base . '/api/v1/auth/verify-email?mb_id=' . rawurlencode($mbId) . '&token=' . rawurlencode($token);
    $subject = '[' . $siteName . '] 이메일 인증';
    $body = ($isEmailChange
            ? '회원정보의 이메일 주소가 바뀌었습니다. 아래 링크를 클릭해 새 주소 인증을 완료해주세요.'
            : '아래 링크를 클릭해 이메일 인증을 완료해주세요.')
        . "\n\n" . $verifyUrl
        . (function_exists('api_email_certify_validity_note') ? api_email_certify_validity_note() : '');
    // mailer() 는 보냈으면 true, 실패 false, 메일 사용이 꺼져 있으면 null — 실제로 나갔을 때만 true.
    $result = api_call_core('mailer', array($siteName, $fromMail, $email, $subject, $body, 0)); // 안의 mailer · mail_options · mail_send_result 훅도 보호해서
    return $result !== false && $result !== null;
}

/**
 * 회원의 최신 약관·개인정보 동의. 없으면 null. /auth/me 와 POST /members/me/legal-consent 가 같은 모양으로 낸다.
 * @return array{terms_version:string, privacy_version:string, accepted_at:string}|null
 */
function api_member_legal_consent(string $mbId): ?array
{
    global $g5;
    if (empty($g5['member_legal_consent_table'])) {
        return null;
    }
    try {
        $row = DB::fetch(
            "SELECT terms_version, privacy_version, accepted_at FROM " . DB::table('member_legal_consent_table') . "
              WHERE mb_id = ? ORDER BY accepted_at DESC, lc_id DESC LIMIT 1",
            [$mbId]
        );
    } catch (\Throwable $e) {
        return null; // 표가 아직 없는 설치본
    }
    if (!$row) {
        return null;
    }
    return [
        'terms_version'   => (string) $row['terms_version'],
        'privacy_version' => (string) $row['privacy_version'],
        'accepted_at'     => date('c', strtotime((string) $row['accepted_at'])),
    ];
}

/** 디데이는 plugin/dday 가 있을 때만 있는 제품 — 표가 없으면 빈 목록. */
function api_member_export_dday_data(string $mbId): array
{
    global $g5;
    if (empty($g5['user_dday_table'])) {
        return [];
    }
    try {
        return DB::fetchAll("SELECT * FROM " . DB::table('user_dday_table') . " WHERE mb_id = ?", [$mbId]);
    } catch (\Throwable $e) {
        error_log('[api/members] dday export failed for mb_id=' . $mbId . ': ' . $e->getMessage());
        return [];
    }
}

function api_member_export_baby_data(string $mbId): array
{
    try {
        $babyTable = DB::table('baby_table');
        $babies = DB::fetchAll("SELECT * FROM {$babyTable} WHERE mb_id = ? ORDER BY baby_id ASC", [$mbId]);
        $babyIds = array_values(array_filter(array_map(static fn($row) => (int) ($row['baby_id'] ?? 0), $babies)));
        if (!$babyIds) {
            return [
                'babies' => [],
                'logs' => [],
                'growth' => [],
                'vaccines' => [],
            ];
        }

        $placeholders = implode(',', array_fill(0, count($babyIds), '?'));
        return [
            'babies' => $babies,
            'logs' => DB::fetchAll(
                "SELECT * FROM " . DB::table('baby_log_table') . " WHERE baby_id IN ({$placeholders}) ORDER BY started_at DESC, log_id DESC",
                $babyIds
            ),
            'growth' => DB::fetchAll(
                "SELECT * FROM " . DB::table('baby_growth_table') . " WHERE baby_id IN ({$placeholders}) ORDER BY measured_on DESC, growth_id DESC",
                $babyIds
            ),
            'vaccines' => DB::fetchAll(
                "SELECT * FROM " . DB::table('baby_vaccine_table') . " WHERE baby_id IN ({$placeholders}) ORDER BY tpl_id ASC, bv_id ASC",
                $babyIds
            ),
        ];
    } catch (\Throwable $e) {
        error_log('[api/members] baby export failed for mb_id=' . $mbId . ': ' . $e->getMessage());
        return [
            'babies' => [],
            'logs' => [],
            'growth' => [],
            'vaccines' => [],
            'error' => 'baby export unavailable',
        ];
    }
}

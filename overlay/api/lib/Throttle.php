<?php
/**
 * 서버 사이드 anti-spam / rate limit 헬퍼.
 *
 * 게시판 글/댓글 작성, 추천 등 abuse-prone 액션에 호출.
 * 회원 mb_id (또는 비회원 IP) 기준으로 최근 N 초 / N 분 / N 시간 안의 액션 카운트를
 * 보고 임계값 넘으면 throw.
 *
 * 게시판: cooldown 은 그누보드 board.bo_use_post_history 와 별개로 동작 (cf_use_member_icon
 * 같은 코어 설정과 무관). 운영자가 G5_BOARD_COOLDOWN_* 상수로 임계 조정.
 *
 * 구현 노트:
 *  - DB::readCount 안 씀 — primary 기준이라야 방금 INSERT 도 보임.
 *  - write_table 의 wr_datetime 인덱스 활용 (gnuboard 기본 인덱스가 있음).
 */
declare(strict_types=1);

if (!defined('_GNUBOARD_')) exit;

if (!class_exists('Throttle')) {

class Throttle
{
    private static ?string $loginAttemptTable = null;
    private static bool $loginAttemptTableChecked = false;
    private static bool $loginAttemptFallbackWarned = false;

    /** 글 작성 인접 쿨다운 (초). 직전 글 작성 후 N 초 안에 또 쓰면 차단. */
    public const POST_COOLDOWN_SECONDS = 30;
    /** 글 작성 짧은-윈도 quota (1 분에 N 건). */
    public const POST_PER_MINUTE = 3;
    /** 글 작성 긴-윈도 quota (1 시간에 N 건). */
    public const POST_PER_HOUR = 20;

    /** 댓글 작성 인접 쿨다운. */
    public const COMMENT_COOLDOWN_SECONDS = 10;
    public const COMMENT_PER_MINUTE = 8;
    public const COMMENT_PER_HOUR = 60;

    /** 같은 회원이 이 시간(초) 안에 제목·본문이 똑같은 글을 또 보내면 다시 보낸 것으로 보고 새로 만들지 않는다. */
    public const POST_DUPLICATE_WINDOW_SECONDS = 600;
    /** 댓글은 같은 글에 같은 말을 일부러 다는 경우가 있어 짧게 본다. */
    public const COMMENT_DUPLICATE_WINDOW_SECONDS = 60;

    /** 로그인 실패 한도 — IP+계정 단위. 초과 시 lock-out. */
    public const LOGIN_FAIL_THRESHOLD = 5;
    public const LOGIN_LOCKOUT_SECONDS = 15 * 60;
    /** 주소와 상관없이 한 계정의 최근 15분 실패 합계 상한(여러 주소로 나눠 시도하는 것). */
    public const LOGIN_ACCOUNT_FAIL_THRESHOLD = 20;

    /** 계정/이메일 존재 확인 같은 enum-위험 엔드포인트의 IP-기반 quota. */
    public const ENUM_PER_MINUTE = 10;
    public const ENUM_PER_HOUR   = 60;

    /**
     * 한 회원의 글·댓글 쓰기를 한 줄로 세운다(게시판별). 연타로 거의 동시에 온 두 요청이 둘 다 "직전 글 없음"을
     * 보고 쿨다운을 통과하지 않게, 직전 기록을 보기 전에 잡는다. 요청이 끝나 DB 연결이 닫히면 MySQL 이 푼다.
     * 10초 안에 못 잡으면 false. 이름 잠금을 쓸 수 없는 DB 면 true(예전처럼 쿨다운만으로 동작).
     */
    public static function lockMemberWrite(string $write_table, string $mb_id): bool
    {
        if ($mb_id === '') return true;
        try {
            $row = DB::fetch('SELECT GET_LOCK(?, 10) AS got', ['g5api_write_' . md5($write_table . '|' . $mb_id)]);
        } catch (\Throwable $e) {
            return true;
        }
        return (int) ($row['got'] ?? 0) === 1;
    }

    /**
     * 같은 회원이 방금 쓴 글 중 제목·본문이 똑같은 글의 wr_id. 없으면 null.
     * 응답을 못 받고 다시 보낸 요청이 중복 글을 만들지 않게 그 글을 돌려주는 데 쓴다. lockMemberWrite 뒤에 부른다.
     */
    public static function findRecentDuplicatePost(string $write_table, string $mb_id, string $subject, string $content): ?int
    {
        if ($mb_id === '') return null;
        $rows = DB::fetchAll(
            "SELECT wr_id, wr_subject, wr_content FROM {$write_table}
              WHERE mb_id = ? AND wr_is_comment = 0 AND wr_datetime >= ?
              ORDER BY wr_id DESC LIMIT 5",
            [$mb_id, date('Y-m-d H:i:s', time() - self::POST_DUPLICATE_WINDOW_SECONDS)]
        );
        foreach ($rows as $row) {
            // DB 비교는 대소문자·끝 공백을 무시하므로 PHP 에서 정확히 비교한다.
            if ((string) $row['wr_subject'] === $subject && (string) $row['wr_content'] === $content) {
                return (int) $row['wr_id'];
            }
        }
        return null;
    }

    /** findRecentDuplicatePost 의 댓글판 — 같은 글(wr_parent)에 같은 본문. */
    public static function findRecentDuplicateComment(string $write_table, string $mb_id, int $wr_parent, string $content): ?int
    {
        if ($mb_id === '') return null;
        $rows = DB::fetchAll(
            "SELECT wr_id, wr_content FROM {$write_table}
              WHERE mb_id = ? AND wr_is_comment = 1 AND wr_parent = ? AND wr_datetime >= ?
              ORDER BY wr_id DESC LIMIT 5",
            [$mb_id, $wr_parent, date('Y-m-d H:i:s', time() - self::COMMENT_DUPLICATE_WINDOW_SECONDS)]
        );
        foreach ($rows as $row) {
            if ((string) $row['wr_content'] === $content) {
                return (int) $row['wr_id'];
            }
        }
        return null;
    }

    /**
     * POST /v1/boards/{bo_table}/posts 의 글쓰기 앞 검사. 막히거나 중복이면 여기서 응답하고 끝난다(Response 가 exit).
     *   1) 회원별 잠금 — 연타로 거의 동시에 온 두 요청이 둘 다 쿨다운을 통과하지 않게.
     *   2) 방금 쓴 글과 제목·본문이 같으면(응답을 못 받고 다시 보낸 경우 등) 새로 만들지 않고 그 글을 200 으로.
     *   3) 쿨다운·분/시간 한도 — $applyThrottle 이 false(어드민)면 건너뛴다.
     */
    public static function guardPostCreate(string $write_table, array $member, array $input, bool $applyThrottle): void
    {
        $mb_id = (string) ($member['mb_id'] ?? '');
        if (!self::lockMemberWrite($write_table, $mb_id)) {
            Response::error('잠시 후 다시 시도해주세요.', 429);
        }
        $subject = $input['wr_subject'] ?? null;
        $content = $input['wr_content'] ?? null;
        if (is_string($subject) && is_string($content)) {
            $duplicateId = self::findRecentDuplicatePost($write_table, $mb_id, $subject, $content);
            if ($duplicateId !== null) {
                $post = DB::fetch("SELECT * FROM {$write_table} WHERE wr_id = ? LIMIT 1", [$duplicateId]);
                unset($post['wr_password'], $post['wr_ip']);
                Response::success($post, 200);
            }
        }
        if ($applyThrottle) {
            $throttleMsg = self::checkPostCreate($write_table, $mb_id);
            if ($throttleMsg !== null) {
                Response::error($throttleMsg, 429);
            }
        }
    }

    /**
     * 게시글 작성 가능 여부 검사. 막힐 사유 있으면 'message' 반환, 통과면 null.
     */
    public static function checkPostCreate(string $write_table, string $mb_id): ?string
    {
        if ($mb_id === '') return null; // 비회원 (이 코드 흐름은 회원 한정인데 안전망)

        // 직전 글
        $last = DB::fetch(
            "SELECT wr_datetime FROM {$write_table}
              WHERE mb_id = ? AND wr_is_comment = 0
              ORDER BY wr_id DESC LIMIT 1",
            [$mb_id]
        );
        if ($last && !empty($last['wr_datetime'])) {
            $ago = time() - strtotime((string) $last['wr_datetime']);
            if ($ago >= 0 && $ago < self::POST_COOLDOWN_SECONDS) {
                $wait = self::POST_COOLDOWN_SECONDS - $ago;
                return "잠시 후 다시 시도해주세요. ({$wait}초)";
            }
        }

        // 1 분 quota
        $oneMin = DB::count(
            "SELECT COUNT(*) FROM {$write_table}
              WHERE mb_id = ? AND wr_is_comment = 0
                AND wr_datetime > DATE_SUB(NOW(), INTERVAL 1 MINUTE)",
            [$mb_id]
        );
        if ($oneMin >= self::POST_PER_MINUTE) {
            return "분당 글 작성 한도(" . self::POST_PER_MINUTE . "건)를 초과했어요.";
        }

        // 1 시간 quota
        $oneHour = DB::count(
            "SELECT COUNT(*) FROM {$write_table}
              WHERE mb_id = ? AND wr_is_comment = 0
                AND wr_datetime > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
            [$mb_id]
        );
        if ($oneHour >= self::POST_PER_HOUR) {
            return "시간당 글 작성 한도(" . self::POST_PER_HOUR . "건)를 초과했어요.";
        }

        return null;
    }

    /**
     * 로그인 시도 제한 확인. lock 상태면 message, 통과면 null.
     * IP + mb_id 조합으로 카운트해 brute-force / credential-stuffing 모두 방어.
     */
    public static function checkLoginAttempt(string $mb_id, ?string $ip): ?string
    {
        $table = self::loginAttemptTable();
        if ($table === null) return self::checkLoginAttemptFallback($mb_id, $ip);
        $ip = $ip ?: '0.0.0.0';

        // 만료된 row 정리 (1시간 지난 건 의미 없음)
        DB::execute(
            "DELETE FROM `{$table}` WHERE last_attempt_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)",
            []
        );

        // 계정 하나에 여러 주소에서 나눠 틀리는 시도도 묶는다 — 주소마다 5번씩이면 주소를 바꿔 가며 끝없이 시도할 수 있다.
        // 최근 15분 실패 합계(주소 무관)가 기준을 넘으면 잠깐 막는다. 한도 기록(ip = '')은 세지 않는다.
        $accountFails = (int) (DB::fetch(
            "SELECT COALESCE(SUM(fail_count), 0) AS n FROM `{$table}`
              WHERE mb_id = ? AND ip <> '' AND last_attempt_at > DATE_SUB(NOW(), INTERVAL "
                . (int) (self::LOGIN_LOCKOUT_SECONDS / 60) . " MINUTE)",
            [$mb_id]
        )['n'] ?? 0);
        if ($accountFails >= self::LOGIN_ACCOUNT_FAIL_THRESHOLD) {
            return '이 계정에 로그인 실패가 너무 많습니다. 잠시 후 다시 시도해주세요.';
        }

        $row = DB::fetch(
            "SELECT * FROM `{$table}` WHERE mb_id = ? AND ip = ? LIMIT 1",
            [$mb_id, $ip]
        );
        if (!$row) return null;

        if (!empty($row['locked_until']) && strtotime((string) $row['locked_until']) > time()) {
            $remain = strtotime((string) $row['locked_until']) - time();
            $mins = (int) ceil($remain / 60);
            return "너무 많은 로그인 시도. 약 {$mins}분 후 다시 시도해주세요.";
        }
        return null;
    }

    /**
     * 로그인 실패 기록. 임계치 도달 시 자동 lock-out.
     */
    public static function recordLoginFailure(string $mb_id, ?string $ip): void
    {
        $table = self::loginAttemptTable();
        if ($table === null) {
            self::recordLoginFailureFallback($mb_id, $ip);
            return;
        }
        $ip = $ip ?: '0.0.0.0';

        $row = DB::fetch(
            "SELECT * FROM `{$table}` WHERE mb_id = ? AND ip = ? LIMIT 1",
            [$mb_id, $ip]
        );
        if (!$row) {
            DB::execute(
                "INSERT INTO `{$table}` (mb_id, ip, fail_count, last_attempt_at)
                 VALUES (?, ?, 1, NOW())",
                [$mb_id, $ip]
            );
            return;
        }
        $fail = (int) $row['fail_count'] + 1;
        $lockUntil = null;
        if ($fail >= self::LOGIN_FAIL_THRESHOLD) {
            $lockUntil = date('Y-m-d H:i:s', time() + self::LOGIN_LOCKOUT_SECONDS);
        }
        DB::execute(
            "UPDATE `{$table}`
                SET fail_count = ?, last_attempt_at = NOW(), locked_until = ?
              WHERE attempt_id = ?",
            [$fail, $lockUntil, (int) $row['attempt_id']]
        );
    }

    /**
     * 로그인 성공 시 카운터 초기화.
     */
    public static function resetLoginAttempts(string $mb_id, ?string $ip): void
    {
        $table = self::loginAttemptTable();
        if ($table === null) {
            self::resetLoginAttemptsFallback($mb_id, $ip);
            return;
        }
        $ip = $ip ?: '0.0.0.0';
        DB::execute(
            "DELETE FROM `{$table}` WHERE mb_id = ? AND ip = ?",
            [$mb_id, $ip]
        );
    }

    /**
     * Enum 위험 엔드포인트(check-id, check-email, password-reset request)에 IP-기반 quota.
     * 통과면 null, 초과면 message.
     */
    public static function checkEnumProbe(string $ip): ?string
    {
        if ($ip === '' || $ip === '0.0.0.0') return null;
        $table = self::loginAttemptTable();
        if ($table === null) return self::checkEnumProbeFallback($ip);

        // last_attempt_at 컬럼을 enum probe 카운팅 용으로도 활용.
        // mb_id = '__enum__' prefix 로 구분.
        $key = '__enum__' . substr(hash('sha256', $ip), 0, 12);
        // 프록시 뒤 방문자 키("프록시>방문자", api_rate_limit_ip)는 IPv6 면 ip 칸(45자)을 넘는다 — 엄격 모드에서 저장이
        // 실패해 요청이 500 으로 끝나지 않게, 긴 키는 해시로 줄여 같은 값으로 세고 저장한다.
        $rowIp = strlen($ip) <= 45 ? $ip : 'h' . substr(hash('sha256', $ip), 0, 44);

        // 이 IP 가 넣은 행(ip = 요청 IP)만 센다. 로그인 실패 기록도 같은 칸을 쓰므로, 남이 이 키를 아이디로
        // 넣어 로그인을 틀려도(그 행의 ip 는 그 사람의 IP) 이 IP 의 한도를 채울 수 없다.
        $perMin = DB::count(
            "SELECT COUNT(*) FROM `{$table}`
              WHERE mb_id = ? AND ip = ? AND last_attempt_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)",
            [$key, $rowIp]
        );
        if ($perMin >= self::ENUM_PER_MINUTE) {
            return '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';
        }

        $perHour = DB::count(
            "SELECT COUNT(*) FROM `{$table}`
              WHERE mb_id = ? AND ip = ? AND last_attempt_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
            [$key, $rowIp]
        );
        if ($perHour >= self::ENUM_PER_HOUR) {
            return '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';
        }
        // 방문자 키는 X-Forwarded-For 로 지어낼 수도 있으니, 그 프록시 주소 전체로도 10배 상한을 둔다(돌려 써도 거기까지).
        if (strpos($ip, '>') !== false
            && self::checkMemberQuota('enumproxy', 'ip:' . strstr($ip, '>', true), self::ENUM_PER_MINUTE * 10, self::ENUM_PER_HOUR * 10) !== null) {
            return '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';
        }

        DB::execute(
            "INSERT INTO `{$table}` (mb_id, ip, fail_count, last_attempt_at)
             VALUES (?, ?, 0, NOW())",
            [$key, $rowIp]
        );
        return null;
    }

    /** 쪽지 보내기 — 인접 간격(초) · 1분 · 1시간 한도. 원본 쪽지 화면은 캡차로 막지만 API 에는 캡차가 없다. */
    public const MEMO_COOLDOWN_SECONDS = 3;
    public const MEMO_PER_MINUTE = 5;
    public const MEMO_PER_HOUR = 60;

    /**
     * 쪽지 보내기 가능 여부. 보낸 쪽지(me_type='send')를 센다 — 막힐 사유가 있으면 메시지, 통과면 null.
     */
    public static function checkMemoSend(string $mb_id): ?string
    {
        if ($mb_id === '') return null;
        $table = DB::table('memo_table');

        $last = DB::fetch(
            "SELECT me_send_datetime FROM {$table}
              WHERE me_send_mb_id = ? AND me_type = 'send'
              ORDER BY me_id DESC LIMIT 1",
            [$mb_id]
        );
        if ($last && !empty($last['me_send_datetime'])) {
            $ago = time() - strtotime((string) $last['me_send_datetime']);
            if ($ago >= 0 && $ago < self::MEMO_COOLDOWN_SECONDS) {
                return '잠시 후 다시 보내 주세요.';
            }
        }
        foreach (array(array('1 MINUTE', self::MEMO_PER_MINUTE, '분당'), array('1 HOUR', self::MEMO_PER_HOUR, '시간당')) as $window) {
            $count = DB::count(
                "SELECT COUNT(*) FROM {$table}
                  WHERE me_send_mb_id = ? AND me_type = 'send'
                    AND me_send_datetime > DATE_SUB(NOW(), INTERVAL {$window[0]})",
                [$mb_id]
            );
            if ($count >= $window[1]) {
                return "{$window[2]} 쪽지 보내기 한도({$window[1]}통)를 넘었어요.";
            }
        }
        return null;
    }

    /**
     * 회원별 동작 횟수 한도(메일 보내기 등 셀 테이블이 따로 없는 동작). 통과하면 이번 한 번을 센다.
     * PHP 세션이 아니라 회원 id 로 세므로, 세션 쿠키 없이 Bearer 토큰으로 보내도 같은 한도를 쓴다.
     * 셀 테이블(login_attempt)이 없는 설치본에서는 막지 않는다 — $failClosed 면 그 동작만 막는다(메일 발송처럼
     * 한도 없이 열어 두면 안 되는 동작). 기록은 사용자가 지울 수 없는 곳에 남아 쪽지를 지워 한도를 되돌리지 못한다.
     * $record = false 면 한도만 보고 세지 않는다(실패한 시도만 셀 때 먼저 막혔는지 확인하는 용도).
     */
    public static function checkMemberQuota(string $bucket, string $mb_id, int $perMinute, int $perHour, bool $record = true, bool $failClosed = false): ?string
    {
        if ($mb_id === '') return null;
        $table = self::loginAttemptTable();
        if ($table === null) {
            return $failClosed ? '지금은 이 기능을 쓸 수 없습니다. 잠시 후 다시 시도해주세요.' : null;
        }

        // 한 시간 넘은 한도 기록은 셀 일이 없다 — 가끔(약 100번에 한 번) 지운다. 로그인 확인이 지우던 것만으로는
        // 토큰으로 오래 로그인해 있는 앱 사용자의 쓰기 기록이 쌓이기만 한다. 로그인 실패 기록(ip 가 채워진 행)은 건드리지 않는다.
        if (random_int(1, 100) === 1) {
            DB::execute(
                "DELETE FROM `{$table}`
                  WHERE ip = '' AND LEFT(mb_id, 4) = '__q_' AND last_attempt_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)",
                []
            );
        }
        $key = '__q_' . substr(preg_replace('/[^a-z0-9]/i', '', $bucket), 0, 16) . '_' . substr(hash('sha256', $mb_id), 0, 16);
        foreach (array(array('1 MINUTE', $perMinute), array('1 HOUR', $perHour)) as $window) {
            // ip = '' 인 행(아래에서 이 함수가 넣은 것)만 센다. 로그인 실패 기록은 ip 가 늘 채워지므로, 누가 이 키를
            // 아이디로 넣어 로그인을 틀려도 남의 한도를 채울 수 없다.
            $count = DB::count(
                "SELECT COUNT(*) FROM `{$table}`
                  WHERE mb_id = ? AND ip = '' AND last_attempt_at > DATE_SUB(NOW(), INTERVAL {$window[0]})",
                [$key]
            );
            if ($count >= $window[1]) {
                return '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';
            }
        }
        if ($record) {
            DB::execute(
                "INSERT INTO `{$table}` (mb_id, ip, fail_count, last_attempt_at) VALUES (?, '', 0, NOW())",
                [$key]
            );
        }
        return null;
    }

    private static function loginAttemptTable(): ?string
    {
        if (self::$loginAttemptTableChecked) {
            return self::$loginAttemptTable;
        }

        self::$loginAttemptTableChecked = true;

        try {
            $table = DB::table('login_attempt_table');
            $row = DB::fetch(
                'SELECT COUNT(*) AS cnt FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
                [$table]
            );

            if ((int) ($row['cnt'] ?? 0) > 0) {
                self::$loginAttemptTable = $table;
            }
        } catch (\Throwable $e) {
            self::$loginAttemptTable = null;
            self::warnLoginAttemptFallback($e->getMessage());
            return self::$loginAttemptTable;
        }

        if (self::$loginAttemptTable === null) {
            self::warnLoginAttemptFallback('login_attempt_table not found');
        }

        return self::$loginAttemptTable;
    }

    private static function warnLoginAttemptFallback(string $reason = ''): void
    {
        if (self::$loginAttemptFallbackWarned) {
            return;
        }
        self::$loginAttemptFallbackWarned = true;
        $suffix = $reason !== '' ? ' reason=' . $reason : '';
        error_log('[Throttle] login_attempt_table unavailable; using file fallback.' . $suffix);
    }

    /**
     * 표가 없을 때 쓰는 한도 파일 — 이 설치본의 data/cache 에 둔다. 서버 공용 임시 폴더는 같은 서버의 다른 계정이 이름을
     * 짐작해 링크로 바꿔 둘 수 있어, data/cache 를 못 쓸 때만 쓴다(그때도 아래에서 링크는 거절한다).
     */
    private static function fallbackStorePath(): string
    {
        // 파일 이름에 서버 비밀을 섞어, data/cache 가 웹에서 열려도 주소를 짐작해 내려받지 못하게 한다(내용도 해시 · 시각뿐).
        $scope = substr(hash('sha256', (defined('G5_PATH') ? (string) G5_PATH : 'default') . '|' . (defined('JWT_SECRET') ? (string) JWT_SECRET : '')), 0, 24);
        $dir = defined('G5_DATA_PATH') ? G5_DATA_PATH . '/cache' : '';
        if ($dir === '' || !is_dir($dir) || !is_writable($dir)) {
            $dir = sys_get_temp_dir();
        }
        return rtrim($dir, '/\\') . '/g5-api-throttle-fallback-' . $scope . '.json';
    }

    private static function withFallbackStore(callable $callback)
    {
        $path = self::fallbackStorePath();
        // 링크를 따라가 엉뚱한 파일을 비우고 덮어쓰지 않는다 — 열기 전에 거르고, 연 뒤에도 같은 파일인지 다시 본다.
        if (is_link($path)) {
            error_log('[Throttle] fallback store is a symlink, refusing: ' . $path);
            return null;
        }
        $fh = @fopen($path, 'c+');
        if (!$fh) {
            error_log('[Throttle] fallback store unavailable: ' . $path);
            return null;
        }
        $opened = @fstat($fh);
        $named = @lstat($path);
        if (!$opened || !$named || is_link($path) || $opened['ino'] !== $named['ino'] || $opened['dev'] !== $named['dev']) {
            fclose($fh);
            error_log('[Throttle] fallback store changed while opening, refusing: ' . $path);
            return null;
        }

        try {
            if (!@flock($fh, LOCK_EX)) {
                error_log('[Throttle] fallback store lock failed: ' . $path);
                return null;
            }

            rewind($fh);
            $raw = stream_get_contents($fh);
            $store = is_string($raw) && $raw !== '' ? json_decode($raw, true) : array();
            if (!is_array($store)) {
                $store = array();
            }
            if (!isset($store['login']) || !is_array($store['login'])) {
                $store['login'] = array();
            }
            if (!isset($store['enum']) || !is_array($store['enum'])) {
                $store['enum'] = array();
            }

            self::pruneFallbackStore($store);
            $result = $callback($store);

            rewind($fh);
            ftruncate($fh, 0);
            fwrite($fh, json_encode($store, JSON_UNESCAPED_SLASHES));
            fflush($fh);
            @flock($fh, LOCK_UN);
            @chmod($path, 0600);

            return $result;
        } finally {
            fclose($fh);
        }
    }

    private static function pruneFallbackStore(array &$store): void
    {
        $cutoff = time() - 3600;
        foreach ($store['login'] as $key => $row) {
            if (!is_array($row) || (int) ($row['last_attempt_at'] ?? 0) < $cutoff) {
                unset($store['login'][$key]);
            }
        }
        foreach ($store['enum'] as $key => $timestamps) {
            if (!is_array($timestamps)) {
                unset($store['enum'][$key]);
                continue;
            }
            $store['enum'][$key] = array_values(array_filter($timestamps, function ($timestamp) use ($cutoff) {
                return (int) $timestamp >= $cutoff;
            }));
            if (!$store['enum'][$key]) {
                unset($store['enum'][$key]);
            }
        }
    }

    private static function loginFallbackKey(string $mb_id, ?string $ip): string
    {
        return hash('sha256', $mb_id . "\0" . ($ip ?: '0.0.0.0'));
    }

    private static function checkLoginAttemptFallback(string $mb_id, ?string $ip): ?string
    {
        $key = self::loginFallbackKey($mb_id, $ip);
        return self::withFallbackStore(function (&$store) use ($key) {
            $row = $store['login'][$key] ?? null;
            if (!is_array($row)) {
                return null;
            }

            $lockedUntil = (int) ($row['locked_until'] ?? 0);
            if ($lockedUntil > time()) {
                $mins = (int) ceil(($lockedUntil - time()) / 60);
                return "Too many login attempts. Please try again in {$mins} minutes.";
            }

            return null;
        });
    }

    private static function recordLoginFailureFallback(string $mb_id, ?string $ip): void
    {
        $key = self::loginFallbackKey($mb_id, $ip);
        self::withFallbackStore(function (&$store) use ($key, $mb_id, $ip) {
            $now = time();
            $row = isset($store['login'][$key]) && is_array($store['login'][$key])
                ? $store['login'][$key]
                : array('fail_count' => 0);
            $fail = (int) ($row['fail_count'] ?? 0) + 1;
            $store['login'][$key] = array(
                'mb_id_hash' => hash('sha256', $mb_id),
                'ip_hash' => hash('sha256', $ip ?: '0.0.0.0'),
                'fail_count' => $fail,
                'last_attempt_at' => $now,
                'locked_until' => $fail >= self::LOGIN_FAIL_THRESHOLD
                    ? $now + self::LOGIN_LOCKOUT_SECONDS
                    : 0,
            );
            return null;
        });
    }

    private static function resetLoginAttemptsFallback(string $mb_id, ?string $ip): void
    {
        $key = self::loginFallbackKey($mb_id, $ip);
        self::withFallbackStore(function (&$store) use ($key) {
            unset($store['login'][$key]);
            return null;
        });
    }

    private static function checkEnumProbeFallback(string $ip): ?string
    {
        $key = hash('sha256', '__enum__' . $ip);
        return self::withFallbackStore(function (&$store) use ($key) {
            $now = time();
            $timestamps = isset($store['enum'][$key]) && is_array($store['enum'][$key])
                ? $store['enum'][$key]
                : array();
            $perMin = 0;
            foreach ($timestamps as $timestamp) {
                if ((int) $timestamp >= $now - 60) {
                    $perMin++;
                }
            }

            if ($perMin >= self::ENUM_PER_MINUTE || count($timestamps) >= self::ENUM_PER_HOUR) {
                return 'Too many requests. Please try again later.';
            }

            $timestamps[] = $now;
            $store['enum'][$key] = $timestamps;
            return null;
        });
    }

    /**
     * 댓글 작성 가능 여부 검사. 막힐 사유 있으면 'message' 반환, 통과면 null.
     */
    public static function checkCommentCreate(string $write_table, string $mb_id): ?string
    {
        if ($mb_id === '') return null;

        $last = DB::fetch(
            "SELECT wr_datetime FROM {$write_table}
              WHERE mb_id = ? AND wr_is_comment = 1
              ORDER BY wr_id DESC LIMIT 1",
            [$mb_id]
        );
        if ($last && !empty($last['wr_datetime'])) {
            $ago = time() - strtotime((string) $last['wr_datetime']);
            if ($ago >= 0 && $ago < self::COMMENT_COOLDOWN_SECONDS) {
                $wait = self::COMMENT_COOLDOWN_SECONDS - $ago;
                return "잠시 후 다시 시도해주세요. ({$wait}초)";
            }
        }

        $oneMin = DB::count(
            "SELECT COUNT(*) FROM {$write_table}
              WHERE mb_id = ? AND wr_is_comment = 1
                AND wr_datetime > DATE_SUB(NOW(), INTERVAL 1 MINUTE)",
            [$mb_id]
        );
        if ($oneMin >= self::COMMENT_PER_MINUTE) {
            return "분당 댓글 한도(" . self::COMMENT_PER_MINUTE . "건)를 초과했어요.";
        }

        $oneHour = DB::count(
            "SELECT COUNT(*) FROM {$write_table}
              WHERE mb_id = ? AND wr_is_comment = 1
                AND wr_datetime > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
            [$mb_id]
        );
        if ($oneHour >= self::COMMENT_PER_HOUR) {
            return "시간당 댓글 한도(" . self::COMMENT_PER_HOUR . "건)를 초과했어요.";
        }

        return null;
    }
}

} // class_exists guard

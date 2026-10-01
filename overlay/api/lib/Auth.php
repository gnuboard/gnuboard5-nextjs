<?php
/**
 * Gnuboard5 REST API - Authentication Middleware
 *
 * Handles JWT-based authentication, token generation, and password
 * hashing using Gnuboard5's own member table and functions.
 */

class Auth
{
    /** @var int|null 이 요청의 액세스 토큰이 속한 로그인 세션 번호(sid). 없으면 null. */
    private static $sessionId = null;

    /**
     * Extract & decode the JWT from the Authorization header and return the
     * corresponding member row, or null if unauthenticated.
     *
     * 토큰에 sid(로그인 세션 번호)가 있으면 그 세션이 아직 살아 있는지도 본다 — 세션 목록에서 로그아웃하거나
     * 전체 로그아웃하면 액세스 토큰 만료(30분)를 기다리지 않고 다음 요청부터 바로 끊긴다.
     * sid 가 없는 토큰(칸이 생기기 전 발급분)은 종전대로 서명과 만료만 본다.
     *
     * @return array|null  Member row from g5_member or null
     */
    public static function getUser()
    {
        self::$sessionId = null;
        $token = self::extractBearerToken();
        if (!$token) {
            return null;
        }

        $payload = JWT::decode($token);
        if (!$payload || empty($payload['mb_id'])) {
            return null;
        }

        $mb_id = $payload['mb_id'];

        $sessionId = isset($payload['sid']) ? (int) $payload['sid'] : 0;
        if ($sessionId > 0) {
            if (!class_exists('RefreshToken') || !RefreshToken::isSessionActive($sessionId, (string) $mb_id)) {
                return null;
            }
            self::$sessionId = $sessionId;
        }

        // Fetch fresh member data from DB
        $table = DB::table('member_table');
        $sql = "SELECT * FROM {$table}
                WHERE mb_id = ?
                  AND mb_leave_date = ''
                  AND mb_intercept_date = ''
                LIMIT 1";
        $member = DB::fetch($sql, [$mb_id]);

        if (!$member || !$member['mb_id']) {
            return null;
        }

        return $member;
    }

    /**
     * Require a valid authenticated user. Sends 401 and exits if not.
     *
     * @return array  Member row
     */
    public static function requireAuth()
    {
        $member = self::getUser();
        if (!$member) {
            Response::error('Unauthorized. Please provide a valid access token.', 401);
        }
        return $member;
    }

    /**
     * Require the current user to be a super-admin (g5_config.cf_admin).
     * Sends 401/403 and exits if conditions are not met.
     *
     * @return array  Member row (admin)
     */
    public static function requireAdmin()
    {
        $member = self::requireAuth();

        if (self::adminRole($member) !== 'super') {
            Response::error('Forbidden. Administrator privileges required.', 403);
        }

        return $member;
    }

    /**
     * Determine the admin role of the given member, mirroring gnuboard5's
     * lib/common.lib.php::is_admin() exactly. Returns one of:
     *   'super'  - g5_config.cf_admin (top-level)
     *   'group'  - g5_group.gr_admin for the group the bo_table belongs to
     *   'board'  - g5_board.bo_admin for this bo_table
     *   ''       - none of the above
     *
     * cf_admin can be a comma/pipe separated list of mb_ids in some
     * deployments; we treat it as a set.
     *
     * @param  array       $member   Member row (must include 'mb_id')
     * @param  string|null $bo_table Board context. Required to evaluate
     *                                'group'/'board' roles.
     * @return string
     */
    public static function adminRole($member, $bo_table = null)
    {
        if (empty($member['mb_id'])) {
            return '';
        }
        $mb_id = $member['mb_id'];

        // super: cf_admin
        $config = api_get_config();
        $cfAdmin = isset($config['cf_admin']) ? (string) $config['cf_admin'] : '';
        if ($cfAdmin !== '') {
            $admins = preg_split('/[\s,|]+/', $cfAdmin, -1, PREG_SPLIT_NO_EMPTY);
            if (in_array($mb_id, $admins, true)) {
                return 'super';
            }
        }

        if (!$bo_table) {
            return '';
        }

        $board = api_get_board($bo_table);
        if (!$board) {
            return '';
        }

        // group: g5_group.gr_admin for this board's group
        $groupTable = DB::table('group_table');
        $group = DB::fetch(
            "SELECT gr_admin FROM {$groupTable} WHERE gr_id = ? LIMIT 1",
            [$board['gr_id']]
        );
        if ($group && !empty($group['gr_admin']) && $group['gr_admin'] === $mb_id) {
            return 'group';
        }

        // board: g5_board.bo_admin
        if (!empty($board['bo_admin']) && $board['bo_admin'] === $mb_id) {
            return 'board';
        }

        return '';
    }

    /**
     * True if the given member can manage (edit/delete) the given post.
     * "Manage" = post owner OR any admin role for this board.
     *
     * @param  array  $member   Authenticated member row
     * @param  string $bo_table Board this post belongs to
     * @param  array  $post     Post row (must include 'mb_id')
     * @return bool
     */
    public static function canManagePost($member, $bo_table, $post)
    {
        if (empty($member['mb_id'])) return false;
        if (!empty($post['mb_id']) && $post['mb_id'] === $member['mb_id']) {
            return true;
        }
        return self::adminRole($member, $bo_table) !== '';
    }

    /**
     * Generate a JWT for the given member.
     *
     * @param  array  $member  Member row from g5_member
     * @return string JWT token
     */
    public static function generateToken($member, $sessionId = null)
    {
        $payload = [
            'mb_id'    => $member['mb_id'],
            'mb_nick'  => $member['mb_nick'],
            'mb_name'  => $member['mb_name'],
            'mb_email' => $member['mb_email'],
            'mb_level' => (int) $member['mb_level'],
        ];
        // 로그인 세션 번호(RefreshToken::sessionOf). getUser() 가 이 세션이 끊겼는지 요청마다 본다.
        if ((int) $sessionId > 0) {
            $payload['sid'] = (int) $sessionId;
        }

        return JWT::encode($payload);
    }

    /**
     * 이 요청의 액세스 토큰이 속한 로그인 세션 번호 — getUser()/requireAuth() 뒤에만 뜻이 있다.
     * 비밀번호를 바꾼 기기만 남기거나(revokeAllFor), 액세스 토큰만으로 갱신할 때 번호를 이어 줄 때 쓴다.
     */
    public static function currentSessionId()
    {
        return self::$sessionId;
    }

    /**
     * Hash a plaintext password.
     *
     * Uses Gnuboard5's get_encrypt_string() if available, otherwise
     * falls back to password_hash().
     *
     * @param  string $password
     * @return string Hashed password
     */
    public static function hashPassword($password)
    {
        if (function_exists('get_encrypt_string')) {
            return get_encrypt_string($password);
        }

        return password_hash($password, PASSWORD_DEFAULT);
    }

    /**
     * Verify a plaintext password against the stored hash.
     *
     * Uses Gnuboard5's check_password() if available, otherwise
     * falls back to password_verify().
     *
     * @param  string $password  Plaintext password
     * @param  string $hash      Stored hash
     * @return bool
     */
    public static function verifyPassword($password, $hash)
    {
        if (function_exists('check_password')) {
            return check_password($password, $hash);
        }

        return password_verify($password, $hash);
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    /**
     * Extract the Bearer token from the Authorization header.
     *
     * @return string|null
     */
    private static function extractBearerToken()
    {
        $header = null;

        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $header = $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        } elseif (function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            // Header keys can vary in case
            foreach ($headers as $key => $value) {
                if (strtolower($key) === 'authorization') {
                    $header = $value;
                    break;
                }
            }
        }

        if ($header && preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return trim($matches[1]);
        }

        if (!empty($_COOKIE['g5_token']) && is_string($_COOKIE['g5_token'])) {
            return trim((string) $_COOKIE['g5_token']);
        }

        return null;
    }
}

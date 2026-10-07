<?php
/**
 * Refresh Token 서비스.
 *
 * 디자인:
 *  - issue(): 64-bit hex 랜덤 raw token 생성 → SHA-256 해시만 DB 저장.
 *    client 는 raw token 보유, 서버는 hash 로만 검증 → DB 유출돼도 토큰 자체는 미노출.
 *  - exchange(): client 가 보낸 raw token 의 hash 가 active 상태로 매칭되면
 *    새 access token + 새 refresh token (rotation) 발급, 이전 refresh 는 revoke.
 *    rotation 으로 토큰 탈취 시 attacker / legitimate 둘 다 다음 사용에서 401 받음.
 *  - revoke(): 단건 또는 mb_id 전체 (로그아웃 / 비밀번호 변경 시).
 *  - session_family: 로그인 한 번에 번호 하나(회전해도 그대로). 액세스 토큰의 sid 로 실어 보내고
 *    Auth::getUser() 가 요청마다 isSessionActive() 로 확인한다 — 세션을 끊으면 액세스 토큰 만료(30분)를
 *    기다리지 않고 바로 끊긴다. 그누보드 세션(/adm)도 같은 번호로 닫힌다(plugin/webapp/bridge/api_session.php).
 *  - gc(): 만료 후 30 일 지난 row 정리.
 */
declare(strict_types=1);

if (!defined('_GNUBOARD_')) exit;

if (!class_exists('RefreshToken')) {

class RefreshToken
{
    /**
     * 재사용 유예(앱 SC-16). 회전은 끝났는데 응답만 잃은 클라이언트가 직전 토큰을 다시 보내면
     * 이 시간 안이고 후속 토큰이 아직 쓰이지 않았을 때만 "재시도"로 보고 새 쌍을 준다.
     * 그 밖의 재제시는 종전대로 재사용 감지(전 세션 폐기)다.
     */
    const REUSE_GRACE_SECONDS = 60;

    /**
     * 새 refresh token 발급. raw token (client 보관용) 반환.
     */
    public static function issue(string $mb_id, ?string $deviceLabel = null, ?string $userAgent = null, ?string $ip = null): string
    {
        $table = DB::table('refresh_token_table');
        $raw   = bin2hex(random_bytes(32)); // 64-hex chars = 256 bits
        $hash  = hash('sha256', $raw);
        $expiresAt = date('Y-m-d H:i:s', time() + (defined('JWT_REFRESH_EXPIRE_SECONDS') ? JWT_REFRESH_EXPIRE_SECONDS : 30 * 86400));
        // 기기 이름은 클라이언트가 보내는 값 — 열(VARCHAR(64)) 길이에 맞춰 여기서 자르고 태그 · 제어문자를 뺀다(DB 가 조용히 자르는 것에 기대지 않는다).
        if ($deviceLabel !== null) {
            $deviceLabel = mb_substr(trim((string) preg_replace('/[\x00-\x1f\x7f]/u', '', strip_tags($deviceLabel))), 0, 64, 'UTF-8');
            if ($deviceLabel === '') $deviceLabel = null;
        }

        DB::execute(
            "INSERT INTO `{$table}`
                (mb_id, token_hash, status, device_label, user_agent, ip, created_at, expires_at)
             VALUES (?, ?, 'active', ?, ?, ?, NOW(), ?)",
            [$mb_id, $hash, $deviceLabel, $userAgent ? mb_substr($userAgent, 0, 255) : null, $ip, $expiresAt]
        );
        if (self::hasFamilyColumn()) {
            // 새 로그인 = 새 세션 번호. 첫 행의 token_id 를 그대로 번호로 쓴다.
            // lastInsertId 는 사이에 낀 조회(컬럼 확인)로 0 이 될 수 있어 해시로 행을 찾는다.
            DB::execute("UPDATE `{$table}` SET session_family = token_id WHERE token_hash = ?", [$hash]);
        }
        return $raw;
    }

    /**
     * raw refresh token 으로 mb_id 조회 + rotation. 실패 시 null.
     * 성공 시 ['mb_id' => ..., 'new_refresh' => raw new token].
     *
     * @return array{mb_id:string,new_refresh:string}|null
     */
    public static function exchange(string $rawToken, ?string $userAgent = null, ?string $ip = null): ?array
    {
        if ($rawToken === '') return null;
        $table = DB::table('refresh_token_table');
        $hash  = hash('sha256', $rawToken);

        DB::beginTransaction();
        try {
            $row = DB::fetch(
                "SELECT * FROM `{$table}`
                  WHERE token_hash = ? AND status = 'active'
                    AND expires_at > NOW()
                  LIMIT 1 FOR UPDATE",
                [$hash]
            );
            if (!$row) {
                $grace = self::graceRetry($hash, $userAgent, $ip);
                if ($grace !== null) {
                    DB::commit();
                    return $grace;
                }
                $reuseMbId = null;
                $reuse = DB::fetch(
                    "SELECT * FROM `{$table}`
                      WHERE token_hash = ?
                      LIMIT 1",
                    [$hash]
                );
                // 서버가 끊은 토큰(세션 목록·전체 로그아웃·비밀번호 변경)을 그 기기가 다시 내민 것은 도난 재사용이
                // 아니다 — 거절만 한다. 이걸 재사용으로 보면 끊은 쪽 기기까지 모두 로그아웃된다.
                $revokedRemotely = $reuse && (int) ($reuse['revoked_remotely'] ?? 0) === 1;
                if ($reuse && !$revokedRemotely && (string) ($reuse['status'] ?? '') !== 'active' && !empty($reuse['mb_id'])) {
                    $reuseMbId = (string) $reuse['mb_id'];
                }
                DB::rollBack();
                if ($reuseMbId !== null) {
                    self::revokeAllFor($reuseMbId);
                    error_log('[RefreshToken] revoked all active tokens after refresh token reuse for mb_id=' . $reuseMbId);
                }
                return null;
            }

            // revoke old, issue new (rotation)
            DB::execute(
                "UPDATE `{$table}` SET status = 'revoked', revoked_at = NOW(), last_used_at = NOW()
                  WHERE token_id = ?",
                [(int) $row['token_id']]
            );

            [$newRaw, $newId] = self::insertSuccessor($row, $userAgent, $ip);
            if (self::hasGraceColumn()) {
                DB::execute("UPDATE `{$table}` SET replaced_by_token_id = ? WHERE token_id = ?", [$newId, (int) $row['token_id']]);
            }

            DB::commit();
            return ['mb_id' => (string) $row['mb_id'], 'new_refresh' => $newRaw];
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
    }

    /**
     * 회전된 토큰의 후속 행을 넣는다(기기 이름·만료 규칙은 회전과 같다). [raw, token_id] 반환.
     *
     * @param array<string,mixed> $row 이전 토큰 행
     * @return array{0:string,1:int}
     */
    private static function insertSuccessor(array $row, ?string $userAgent, ?string $ip): array
    {
        $table = DB::table('refresh_token_table');
        $newRaw  = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + (defined('JWT_REFRESH_EXPIRE_SECONDS') ? JWT_REFRESH_EXPIRE_SECONDS : 30 * 86400));
        DB::execute(
            "INSERT INTO `{$table}`
                (mb_id, token_hash, status, device_label, user_agent, ip, created_at, expires_at)
             VALUES (?, ?, 'active', ?, ?, ?, NOW(), ?)",
            [
                (string) $row['mb_id'],
                hash('sha256', $newRaw),
                $row['device_label'],
                $userAgent ? mb_substr($userAgent, 0, 255) : $row['user_agent'],
                $ip ?: $row['ip'],
                $expiresAt,
            ]
        );
        $newId = (int) DB::lastInsertId();
        if (self::hasFamilyColumn()) {
            // 회전은 같은 로그인 — 세션 번호를 이어받는다(칸이 생기기 전 행이면 그 행 번호로 시작).
            $family = (int) ($row['session_family'] ?? 0) ?: (int) $row['token_id'];
            DB::execute("UPDATE `{$table}` SET session_family = ? WHERE token_hash = ?", [$family, hash('sha256', $newRaw)]);
        }
        return [$newRaw, $newId];
    }

    /**
     * 응답을 잃은 재시도(SC-16) — 트랜잭션 안에서 부른다. 조건을 모두 만족할 때만 새 쌍을, 아니면 null(재사용 감지로):
     *  - 제시 토큰이 회전으로 revoke 됐고(replaced_by_token_id 있음) 그게 REUSE_GRACE_SECONDS 안이며 만료 전
     *  - 후속 토큰이 같은 회원 것이고 아직 active(=한 번도 회전되지 않음 — 정상 클라이언트가 이미 썼다면 진짜 재사용)
     * 후속 토큰은 replaced_by_token_id 없이 폐기한다 — 누가 그걸 다시 내밀면 체인 없이 곧장 재사용 감지다.
     * 직전 토큰의 체인도 끊어 유예는 한 번뿐이다(60초 안 반복 재생으로 쌍을 계속 받아가지 못하게).
     * 한계: 60초 안에 탈취자가 먼저 재제시하면 정상 재시도와 구별할 수 없다 — 정상 클라이언트가 폐기된 후속
     * 토큰을 내미는 순간 전 세션 폐기로 정리된다(명세가 받아들인 절충).
     *
     * @return array{mb_id:string,new_refresh:string}|null
     */
    private static function graceRetry(string $hash, ?string $userAgent, ?string $ip): ?array
    {
        if (!self::hasGraceColumn()) {
            return null;
        }
        $table = DB::table('refresh_token_table');
        $old = DB::fetch(
            "SELECT *, (revoked_at >= NOW() - INTERVAL " . (int) self::REUSE_GRACE_SECONDS . " SECOND) AS in_grace
               FROM `{$table}`
              WHERE token_hash = ? AND status = 'revoked' AND replaced_by_token_id IS NOT NULL AND expires_at > NOW()
              LIMIT 1 FOR UPDATE",
            [$hash]
        );
        if (!$old || (int) $old['in_grace'] !== 1) {
            return null;
        }
        $next = DB::fetch(
            "SELECT token_id, mb_id, status FROM `{$table}` WHERE token_id = ? LIMIT 1 FOR UPDATE",
            [(int) $old['replaced_by_token_id']]
        );
        if (!$next || (string) $next['status'] !== 'active' || (string) $next['mb_id'] !== (string) $old['mb_id']) {
            return null;
        }

        DB::execute(
            "UPDATE `{$table}` SET status = 'revoked', revoked_at = NOW(), replaced_by_token_id = NULL WHERE token_id = ?",
            [(int) $next['token_id']]
        );
        [$newRaw] = self::insertSuccessor($old, $userAgent, $ip);
        // 유예는 한 번만 — 직전 토큰의 체인을 끊는다. 같은 토큰을 또 내밀면(탈취 재생 등) 종전대로 재사용 감지다.
        DB::execute("UPDATE `{$table}` SET replaced_by_token_id = NULL WHERE token_id = ?", [(int) $old['token_id']]);
        error_log('[RefreshToken] grace retry re-issued refresh token for mb_id=' . (string) $old['mb_id']);
        return ['mb_id' => (string) $old['mb_id'], 'new_refresh' => $newRaw];
    }

    /** 설치기가 나중에 더한 컬럼이 있나(요청당 한 번 확인). 없으면 그 기능만 꺼지고 종전 동작 그대로. */
    private static function hasColumn(string $column): bool
    {
        static $ready = [];
        if (!array_key_exists($column, $ready)) {
            try {
                $ready[$column] = (bool) DB::fetch(
                    "SELECT 1 AS x FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1",
                    [DB::table('refresh_token_table'), $column]
                );
            } catch (\Throwable $e) {
                $ready[$column] = false;
            }
        }
        return $ready[$column];
    }

    /** replaced_by_token_id — 회전 체인. 있을 때만 응답을 잃은 재시도 유예를 켠다. */
    private static function hasGraceColumn(): bool
    {
        return self::hasColumn('replaced_by_token_id');
    }

    /** session_family — 로그인 세션 번호. 있을 때만 sid 를 싣고 확인한다. */
    private static function hasFamilyColumn(): bool
    {
        return self::hasColumn('session_family');
    }

    /** revoked_remotely — 서버가 끊은 토큰 표시. 있을 때만 그 토큰의 재제시를 재사용으로 보지 않는다. */
    private static function hasRemoteColumn(): bool
    {
        return self::hasColumn('revoked_remotely');
    }

    /** 로그인 세션 번호를 쓰는 설치본인가(session_family 컬럼). sid 없는 토큰을 더는 늘려 주지 않을 때 본다. */
    public static function tracksSessions(): bool
    {
        return self::hasFamilyColumn();
    }

    /**
     * raw refresh token 이 속한 로그인 세션 번호. 액세스 토큰의 sid 와 그누보드 세션(ss_api_sid)에 넣는다.
     * 컬럼이 없거나 토큰을 못 찾으면 null — 그때는 sid 없이 발급해 종전처럼 동작한다.
     */
    public static function sessionOf(string $rawToken): ?int
    {
        if ($rawToken === '' || !self::hasFamilyColumn()) return null;
        $row = DB::fetch(
            "SELECT session_family FROM `" . DB::table('refresh_token_table') . "` WHERE token_hash = ? LIMIT 1",
            [hash('sha256', $rawToken)]
        );
        $family = (int) ($row['session_family'] ?? 0);
        return $family > 0 ? $family : null;
    }

    /**
     * 그 로그인 세션이 아직 살아 있나 — 회전 중인 active 행이 하나라도 있으면 그렇다.
     * 세션 목록의 로그아웃·전체 로그아웃·재사용 감지가 active 행을 없애면 그 자리에서 false 가 된다.
     * 회전은 한 트랜잭션(이전 행 revoke + 새 행 insert)이라 그 사이에 false 를 보는 일은 없다.
     */
    public static function isSessionActive(int $sessionId, string $mb_id): bool
    {
        if ($sessionId <= 0 || $mb_id === '') return false;
        return (bool) DB::fetch(
            "SELECT 1 AS x FROM `" . DB::table('refresh_token_table') . "`
              WHERE session_family = ? AND mb_id = ? AND status = 'active' AND expires_at > NOW()
              LIMIT 1",
            [$sessionId, $mb_id]
        );
    }

    /**
     * Active login sessions for a member. Returns metadata only; token hashes are
     * intentionally never exposed to the client.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function activeSessionsFor(string $mb_id): array
    {
        if ($mb_id === '') return [];
        $table = DB::table('refresh_token_table');
        return DB::fetchAll(
            "SELECT token_id, device_label, user_agent, ip, created_at, expires_at, last_used_at
               FROM `{$table}`
              WHERE mb_id = ?
                AND status = 'active'
                AND expires_at > NOW()
              ORDER BY COALESCE(last_used_at, created_at) DESC, token_id DESC",
            [$mb_id]
        );
    }

    /**
     * Revoke one active refresh token that belongs to the given member.
     */
    public static function revokeForMemberById(string $mb_id, int $tokenId): bool
    {
        if ($mb_id === '' || $tokenId <= 0) return false;
        $table = DB::table('refresh_token_table');
        if (self::hasFamilyColumn()) {
            // 목록을 본 뒤 그 기기가 회전했으면 목록의 token_id 는 이미 revoked 다 — 행이 아니라 그 로그인 세션을 끊는다.
            $row = DB::fetch(
                "SELECT session_family FROM `{$table}` WHERE token_id = ? AND mb_id = ? LIMIT 1",
                [$tokenId, $mb_id]
            );
            $family = (int) ($row['session_family'] ?? 0);
            if ($family > 0) {
                $n = DB::execute(
                    "UPDATE `{$table}`
                        SET status = 'revoked', revoked_at = NOW()" . self::remoteMark() . "
                      WHERE session_family = ?
                        AND mb_id = ?
                        AND status = 'active'",
                    [$family, $mb_id]
                );
                return $n > 0;
            }
        }
        $n = DB::execute(
            "UPDATE `{$table}`
                SET status = 'revoked', revoked_at = NOW()" . self::remoteMark() . "
              WHERE token_id = ?
                AND mb_id = ?
                AND status = 'active'",
            [$tokenId, $mb_id]
        );
        return $n > 0;
    }

    /**
     * 단건 revoke (현재 토큰만 무효화).
     */
    public static function revoke(string $rawToken): bool
    {
        if ($rawToken === '') return false;
        $table = DB::table('refresh_token_table');
        $hash  = hash('sha256', $rawToken);
        $n = DB::execute(
            "UPDATE `{$table}` SET status = 'revoked', revoked_at = NOW()
              WHERE token_hash = ? AND status = 'active'",
            [$hash]
        );
        return $n > 0;
    }

    /**
     * 한 회원의 모든 active 토큰 revoke (비밀번호 변경 / 탈퇴 / 전체 로그아웃 / 재사용 감지).
     * $exceptSession 을 주면 그 로그인 세션만 남긴다 — 비밀번호를 바꾼 그 기기는 로그인을 유지한다.
     * 서버가 끊은 것이므로 그 기기들이 토큰을 다시 내밀어도 재사용으로 보지 않는다(remoteMark).
     */
    public static function revokeAllFor(string $mb_id, ?int $exceptSession = null): int
    {
        $table = DB::table('refresh_token_table');
        if ($exceptSession !== null && $exceptSession > 0 && self::hasFamilyColumn()) {
            $revoked = DB::execute(
                "UPDATE `{$table}` SET status = 'revoked', revoked_at = NOW()" . self::remoteMark() . "
                  WHERE mb_id = ? AND status = 'active' AND (session_family IS NULL OR session_family <> ?)",
                [$mb_id, $exceptSession]
            );
        } else {
            $revoked = DB::execute(
                "UPDATE `{$table}` SET status = 'revoked', revoked_at = NOW()" . self::remoteMark() . "
                  WHERE mb_id = ? AND status = 'active'",
                [$mb_id]
            );
        }
        self::revokeCoreAutoLogin($mb_id);
        return $revoked;
    }

    /**
     * 그누보드 원본의 자동 로그인 토큰도 지운다(5.6.41 부터 g5_member_auto_login 에 기기마다 31일짜리로 남는다).
     * 원본은 그 기기에서 로그아웃할 때만 지워서, 전체 로그아웃 · 비밀번호 변경 뒤에도 다른 브라우저의 "자동로그인"이
     * 살아 있을 수 있다. 표 이름이 등록되지 않은 판(5.6.30 등)은 건너뛰고, 표가 아직 없으면 로그만 남긴다.
     */
    private static function revokeCoreAutoLogin(string $mb_id): void
    {
        $table = isset($GLOBALS['g5']['member_auto_login_table']) ? (string) $GLOBALS['g5']['member_auto_login_table'] : '';
        if ($mb_id === '' || $table === '' || !preg_match('/^[A-Za-z0-9_]+$/', $table)) {
            return;
        }
        try {
            DB::execute("DELETE FROM `{$table}` WHERE mb_id = ?", [$mb_id]);
        } catch (\Throwable $e) {
            error_log('[RefreshToken] core auto-login cleanup skipped: ' . $e->getMessage());
        }
    }

    /** 서버가 끊는 UPDATE 에 붙이는 SET 조각 — 컬럼이 없는 설치본에서는 빈 문자열. */
    private static function remoteMark(): string
    {
        return self::hasRemoteColumn() ? ', revoked_remotely = 1' : '';
    }

    /**
     * 만료 후 30 일 지난 row 정리.
     */
    public static function gc(int $keepDays = 30): int
    {
        $table = DB::table('refresh_token_table');
        $cutoff = date('Y-m-d H:i:s', time() - ($keepDays * 86400));
        return DB::execute(
            "DELETE FROM `{$table}` WHERE expires_at < ?",
            [$cutoff]
        );
    }
}

} // class_exists guard

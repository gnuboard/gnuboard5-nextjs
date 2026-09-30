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

        DB::execute(
            "INSERT INTO `{$table}`
                (mb_id, token_hash, status, device_label, user_agent, ip, created_at, expires_at)
             VALUES (?, ?, 'active', ?, ?, ?, NOW(), ?)",
            [$mb_id, $hash, $deviceLabel, $userAgent ? mb_substr($userAgent, 0, 255) : null, $ip, $expiresAt]
        );
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
                    "SELECT mb_id, status, expires_at FROM `{$table}`
                      WHERE token_hash = ?
                      LIMIT 1",
                    [$hash]
                );
                if ($reuse && (string) ($reuse['status'] ?? '') !== 'active' && !empty($reuse['mb_id'])) {
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
        return [$newRaw, (int) DB::lastInsertId()];
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

    /** replaced_by_token_id 컬럼(설치기가 만든다)이 있을 때만 유예를 켠다 — 없으면 종전 동작 그대로. */
    private static function hasGraceColumn(): bool
    {
        static $ready = null;
        if ($ready === null) {
            try {
                $ready = (bool) DB::fetch(
                    "SELECT 1 AS x FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'replaced_by_token_id' LIMIT 1",
                    [DB::table('refresh_token_table')]
                );
            } catch (\Throwable $e) {
                $ready = false;
            }
        }
        return $ready;
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
        $n = DB::execute(
            "UPDATE `{$table}`
                SET status = 'revoked', revoked_at = NOW()
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
     * 한 회원의 모든 active 토큰 revoke (비밀번호 변경 / 탈퇴 / 전체 로그아웃).
     */
    public static function revokeAllFor(string $mb_id): int
    {
        $table = DB::table('refresh_token_table');
        return DB::execute(
            "UPDATE `{$table}` SET status = 'revoked', revoked_at = NOW()
              WHERE mb_id = ? AND status = 'active'",
            [$mb_id]
        );
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

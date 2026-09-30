<?php
/**
 * PDO Database Wrapper for Gnuboard5 REST API
 *
 * Replaces legacy sql_query(), sql_fetch(), sql_fetch_array(), sql_real_escape_string().
 * Uses PDO Prepared Statements to prevent SQL injection.
 *
 * Usage:
 *   DB::fetch("SELECT * FROM g5_member WHERE mb_id = ?", [$mb_id]);
 *   DB::fetchAll("SELECT * FROM g5_member WHERE mb_level >= ?", [5]);
 *   DB::execute("UPDATE g5_member SET mb_point = ? WHERE mb_id = ?", [100, 'admin']);
 *   DB::count("SELECT COUNT(*) FROM g5_member WHERE mb_level >= ?", [5]);
 *   DB::table('member_table')  // returns 'g5_member' (whitelist validated)
 *
 * Read replica routing (선택):
 *   replica 호스트를 설정하면 read-heavy 핫패스를 primary 부담 없이 처리 가능.
 *   환경에 G5_REPLICA_HOST 가 정의돼있으면 readFetch/readFetchAll/readCount 가
 *   replica 쪽으로 라우팅됨. 정의 없거나 replica 연결 실패 시 자동으로 primary 폴백.
 *   설정 위치는 운영 서버 sites/<host>/extend/ 또는 dbconfig 옆.
 *
 *   define('G5_REPLICA_HOST', 'replica.internal');
 *   define('G5_REPLICA_USER', 'g5_ro');
 *   define('G5_REPLICA_PASSWORD', '...');
 *   // 이하 미정의시 primary 값 재사용:
 *   //   G5_REPLICA_DB, G5_REPLICA_PORT
 *
 * 트랜잭션 안에서는 read 호출도 primary 로 가야 일관성 깨지지 않음 — 자동 처리.
 */

class DB
{
    private static ?PDO $primaryPdo = null;
    private static ?PDO $replicaPdo = null;
    /** 트랜잭션 카운터 — beginTransaction/commit/rollback 으로 증감. 0이 아니면 replica 비활성. */
    private static int $txDepth = 0;
    /** Replica 연결 실패 후 재시도까지의 cooldown 시작 시각 (unix). */
    private static int $replicaCooldownUntil = 0;

    /**
     * Get or create singleton PDO connection using G5_MYSQL_* constants.
     */
    public static function getPdo(): PDO
    {
        if (self::$primaryPdo !== null) {
            return self::$primaryPdo;
        }

        $host = defined('G5_MYSQL_HOST') ? G5_MYSQL_HOST : 'localhost';
        $db   = defined('G5_MYSQL_DB')   ? G5_MYSQL_DB   : '';
        $user = defined('G5_MYSQL_USER') ? G5_MYSQL_USER : '';
        $pass = defined('G5_MYSQL_PASSWORD') ? G5_MYSQL_PASSWORD : '';

        $dsn = "mysql:host={$host};dbname={$db};charset=utf8mb4";

        self::$primaryPdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            // DSN의 charset만 믿지 않고 명시적으로 SET NAMES — 그누보드 common.php가
            // 이후 sql_set_charset(G5_DB_CHARSET='utf8')을 호출해도 우리 PDO 연결은
            // 별개라 영향 없지만, 일부 PHP/PDO mysql 드라이버 빌드에서 DSN charset이
            // 무시되는 케이스가 있어 방어적으로 보장.
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
        ]);

        // Mirror gnuboard common.php (G5_MYSQL_SET_MODE): relax sql_mode so the
        // API connection accepts the same legacy zero-date values the rest of
        // gnuboard writes (e.g. mb_email_certify '0000-00-00 00:00:00'). Without
        // this the API's strict-mode PDO session rejects them with a 500.
        if (defined('G5_MYSQL_SET_MODE') && G5_MYSQL_SET_MODE) {
            self::$primaryPdo->exec("SET SESSION sql_mode = ''");
        }

        return self::$primaryPdo;
    }

    /**
     * Read replica 연결 획득. 미설정 또는 연결 실패 시 null 반환 → 호출자가 primary 폴백.
     * 한 번 실패하면 30 초 cooldown — 매 요청마다 끊긴 replica 에 reconnect 시도하지 않도록.
     */
    public static function getReplicaPdo(): ?PDO
    {
        if (!defined('G5_REPLICA_HOST') || G5_REPLICA_HOST === '') return null;

        if (self::$replicaPdo !== null) return self::$replicaPdo;

        if (time() < self::$replicaCooldownUntil) return null;

        $host = G5_REPLICA_HOST;
        $port = defined('G5_REPLICA_PORT') ? (string) G5_REPLICA_PORT : '';
        $db   = defined('G5_REPLICA_DB')   ? G5_REPLICA_DB   : (defined('G5_MYSQL_DB')   ? G5_MYSQL_DB   : '');
        $user = defined('G5_REPLICA_USER') ? G5_REPLICA_USER : (defined('G5_MYSQL_USER') ? G5_MYSQL_USER : '');
        $pass = defined('G5_REPLICA_PASSWORD')
            ? G5_REPLICA_PASSWORD
            : (defined('G5_MYSQL_PASSWORD') ? G5_MYSQL_PASSWORD : '');

        $dsn = "mysql:host={$host};dbname={$db};charset=utf8mb4";
        if ($port !== '') $dsn .= ";port={$port}";

        try {
            self::$replicaPdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_TIMEOUT            => 2, // replica 응답 느리면 primary 로 폴백
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
            ]);
            if (defined('G5_MYSQL_SET_MODE') && G5_MYSQL_SET_MODE) {
                self::$replicaPdo->exec("SET SESSION sql_mode = ''");
            }
            return self::$replicaPdo;
        } catch (\Throwable $e) {
            self::$replicaPdo = null;
            self::$replicaCooldownUntil = time() + 30; // 30s 동안 재시도 안 함
            return null;
        }
    }

    /**
     * Read 라우팅 결정 — 트랜잭션 안이면 무조건 primary,
     * replica 미설정이거나 연결 실패면 primary, 그 외 replica.
     */
    private static function readPdo(): PDO
    {
        if (self::$txDepth > 0) return self::getPdo();
        $replica = self::getReplicaPdo();
        return $replica ?? self::getPdo();
    }

    private static function isReprepareError(\Throwable $e): bool
    {
        if ($e instanceof \PDOException) {
            $driverCode = isset($e->errorInfo[1]) ? (int) $e->errorInfo[1] : 0;
            if ($driverCode === 1615) {
                return true;
            }
        }

        return stripos($e->getMessage(), 'Prepared statement needs to be re-prepared') !== false;
    }

    private static function resetPdo(PDO $pdo): void
    {
        if (self::$primaryPdo === $pdo) {
            self::$primaryPdo = null;
        }

        if (self::$replicaPdo === $pdo) {
            self::$replicaPdo = null;
            self::$replicaCooldownUntil = time() + 30;
        }
    }

    private static function runPdoQuery(callable $pdoFactory, callable $query)
    {
        $pdo = $pdoFactory();

        try {
            return $query($pdo);
        } catch (\Throwable $e) {
            if (self::$txDepth > 0 || !self::isReprepareError($e)) {
                throw $e;
            }

            self::resetPdo($pdo);
            return $query($pdoFactory());
        }
    }

    /**
     * Fetch a single row from primary.
     *
     * @param  string $sql    SQL with ? placeholders
     * @param  array  $params Bind values
     * @return array|null     Associative array or null if not found
     */
    public static function fetch(string $sql, array $params = []): ?array
    {
        return self::runPdoQuery(
            fn() => self::getPdo(),
            function (PDO $pdo) use ($sql, $params) {
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $row = $stmt->fetch();
                return $row ?: null;
            }
        );
    }

    /**
     * Fetch all rows from primary.
     *
     * @param  string $sql    SQL with ? placeholders
     * @param  array  $params Bind values
     * @return array          Array of associative arrays
     */
    public static function fetchAll(string $sql, array $params = []): array
    {
        return self::runPdoQuery(
            fn() => self::getPdo(),
            function (PDO $pdo) use ($sql, $params) {
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                return $stmt->fetchAll();
            }
        );
    }

    /**
     * Execute INSERT / UPDATE / DELETE on primary.
     *
     * @param  string $sql    SQL with ? placeholders
     * @param  array  $params Bind values
     * @return int            Number of affected rows
     */
    public static function execute(string $sql, array $params = []): int
    {
        return self::runPdoQuery(
            fn() => self::getPdo(),
            function (PDO $pdo) use ($sql, $params) {
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                return $stmt->rowCount();
            }
        );
    }

    /**
     * Shortcut for SELECT COUNT(*) queries on primary.
     */
    public static function count(string $sql, array $params = []): int
    {
        return self::runPdoQuery(
            fn() => self::getPdo(),
            function (PDO $pdo) use ($sql, $params) {
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                return (int) $stmt->fetchColumn();
            }
        );
    }

    // -----------------------------------------------------------------------
    // Read replica variants — replica 가 있으면 그쪽으로, 실패 시 primary 폴백.
    // 트랜잭션 안에서 호출되면 primary 로 라우팅 (read-after-write 일관성).
    // -----------------------------------------------------------------------

    public static function readFetch(string $sql, array $params = []): ?array
    {
        try {
            return self::runPdoQuery(
                fn() => self::readPdo(),
                function (PDO $pdo) use ($sql, $params) {
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                    $row = $stmt->fetch();
                    return $row ?: null;
                }
            );
        } catch (\Throwable $e) {
            self::demoteReplicaOnError($e);
            return self::fetch($sql, $params);
        }
    }

    public static function readFetchAll(string $sql, array $params = []): array
    {
        try {
            return self::runPdoQuery(
                fn() => self::readPdo(),
                function (PDO $pdo) use ($sql, $params) {
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                    return $stmt->fetchAll();
                }
            );
        } catch (\Throwable $e) {
            self::demoteReplicaOnError($e);
            return self::fetchAll($sql, $params);
        }
    }

    public static function readCount(string $sql, array $params = []): int
    {
        try {
            return self::runPdoQuery(
                fn() => self::readPdo(),
                function (PDO $pdo) use ($sql, $params) {
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                    return (int) $stmt->fetchColumn();
                }
            );
        } catch (\Throwable $e) {
            self::demoteReplicaOnError($e);
            return self::count($sql, $params);
        }
    }

    /**
     * Replica 가 죽었거나 lag 등으로 쿼리 실패 시 cooldown 부여 → 이후 primary 사용.
     */
    private static function demoteReplicaOnError(\Throwable $e): void
    {
        // 트랜잭션 안에서는 replica 안 쓰므로 demote 불필요.
        if (self::$txDepth > 0) return;
        self::$replicaPdo = null;
        self::$replicaCooldownUntil = time() + 30;
    }

    /**
     * Get the last inserted auto-increment ID.
     */
    public static function lastInsertId(): string
    {
        return self::getPdo()->lastInsertId();
    }

    /**
     * Get a validated table name from the $g5 array.
     */
    public static function table(string $key): string
    {
        global $g5;

        if (isset($g5[$key])) {
            return $g5[$key];
        }

        throw new \InvalidArgumentException("Unknown table key: {$key}");
    }

    /**
     * Get the write table name for a board (g5_write_{bo_table}).
     */
    public static function writeTable(string $bo_table): string
    {
        global $g5;
        $safe = preg_replace('/[^a-zA-Z0-9_]/', '', $bo_table);
        return $g5['write_prefix'] . $safe;
    }

    public static function beginTransaction(): void
    {
        if (self::$txDepth === 0) {
            self::getPdo()->beginTransaction();
        }
        self::$txDepth++;
    }

    public static function commit(): void
    {
        if (self::$txDepth <= 0) return;
        self::$txDepth--;
        if (self::$txDepth === 0) {
            self::getPdo()->commit();
        }
    }

    public static function rollBack(): void
    {
        if (self::$txDepth <= 0) return;
        self::$txDepth = 0;
        self::getPdo()->rollBack();
    }
}

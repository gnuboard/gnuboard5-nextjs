<?php
/**
 * 앱 E2E(Maestro) 회원 시드 — PLAN OPS-01.2. 멱등: 매 실행 e2e_user1~4 를 같은 상태로 되돌린다.
 *
 *   E2E_PASSWORD='...' php nextjs/scripts/smoke/seed_e2e_members.php [--users=4]
 *
 * - 비밀번호는 환경변수 E2E_PASSWORD 로만 받는다(기본값 없음, 출력하지 않음).
 * - e2e_user4 는 계정 삭제 흐름이 매번 지우므로 --force 로 되살린다(탈퇴 비식별화된 행을 덮어쓴다).
 * - 실제 생성은 seed_nextjs_smoke_user.php 에 맡긴다(로컬 DB 만, 일반 회원 레벨 2, 표식 mb_10).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

$password = getenv('E2E_PASSWORD');
if (!is_string($password) || strlen($password) < 8) {
    fwrite(STDERR, "seed_e2e_members: set E2E_PASSWORD (8-64 chars).\n");
    exit(1);
}

$count = 4;
foreach ($argv ?? [] as $arg) {
    if (strpos($arg, '--users=') === 0) {
        $count = max(1, min(9, (int) substr($arg, 8)));
    }
}

$seed = __DIR__ . '/seed_nextjs_smoke_user.php';
$failed = 0;
for ($i = 1; $i <= $count; $i++) {
    $id = 'e2e_user' . $i;
    $cmd = [PHP_BINARY, $seed, '--json', '--id=' . $id, '--email=' . $id . '@example.test', '--name=E2E User ' . $i, '--nick=E2E' . $i];
    // 삭제 흐름 전용 계정은 탈퇴로 표식이 지워져 있으므로 덮어쓴다.
    if ($i === 4) {
        $cmd[] = '--force';
    }
    $env = array_merge(getenv(), ['LOCAL_SMOKE_LOGIN_PASSWORD' => $password]);
    $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env);
    if (!is_resource($proc)) {
        fwrite(STDERR, "{$id}: could not start seed\n");
        $failed++;
        continue;
    }
    $out = stream_get_contents($pipes[1]);
    $err = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    // PHP 시작 경고(예: 모듈 중복 로드)가 stdout 앞에 붙을 수 있다 — JSON 은 마지막 줄이다.
    $lines = array_values(array_filter(array_map('trim', explode("\n", (string) $out)), 'strlen'));
    $json = $lines ? json_decode((string) end($lines), true) : null;
    if ($code !== 0 || !is_array($json) || empty($json['success'])) {
        $reason = preg_match('/seed_nextjs_smoke_user: (.+)/', (string) $err, $m) ? $m[1] : 'exit ' . $code;
        fwrite(STDERR, "{$id}: failed ({$reason})\n");
        $failed++;
        continue;
    }
    echo "{$id}: {$json['action']}\n";
}
exit($failed === 0 ? 0 : 1);

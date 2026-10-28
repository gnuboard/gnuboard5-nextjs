<?php
/**
 * 웹 에디터 사진 대장(g5_editor_image) — 임시 저장 → 저장 때 옮기기 · 붙이기 → 글을 지우면 사진도 지우기 → 임시 사진 정리.
 *
 *   1) 웹 에디터(글 · 댓글 · 상품 후기 · 상품 문의 · 1:1 문의)는 stage=tmp 를 붙여 POST /v1/upload 한다. 사진을
 *      data/tmp/editor_upload/ 에 두고 대장에 ei_state 0(임시)으로 적는다. stage 없이 올린 사진(앱 · 그 밖)은 예전처럼
 *      data/editor/<yymm>/ 에 바로 두고 2(지우지 않음)로 적는다.
 *   2) 그 글을 저장하는 API(boards · posts · comments · shop/reviews · reviews_qna_routes · qas)가 저장 전에
 *      api_editor_tmp_finalize() 로 본문의 임시 사진을 data/editor/<yymm>/ 으로 옮기고 주소를 바꾼다. 올린 회원(또는
 *      최고관리자)의 사진만 옮긴다. 새 글은 등록 뒤 번호가 생기므로 api_editor_attach() 로 붙인다(1).
 *   3) 글을 지우면 붙은 사진 파일과 행을 지운다 — api_editor_delete_attached(). 그누보드 화면 · 관리자 화면 · API 가 같은
 *      그누보드 이벤트(bbs_delete · qa_delete · shop_item_use_deleted …)를 부르므로 plugin/webapp/editor/events.php 한 곳에서.
 *      글을 복사하면 두 글이 같은 파일을 쓰므로 그 사진은 2(지우지 않음)로 돌리고, 옮기면 새 게시판 · 번호로 고친다.
 *   4) 글에 붙지 못한 임시 사진(글을 안 쓰고 나감)과 옮긴 뒤 저장이 실패해 붙지 못한 사진은 TableCleanup 의 editor_tmp
 *      단계가 WEBAPP_EDITOR_TMP_KEEP_DAYS(기본 3일 — 글쓰기 임시 저장이 하루 가므로 여유를 둔다) 뒤에 파일과 행을 함께 지운다.
 *   5) 삭제 이벤트 없이 글이 사라진 경우(관리자의 게시판 삭제 · 상품 삭제 등)는 editor_orphan 단계가 원래 표에 그 번호가
 *      없는 사진을 찾아 지운다(붙은 지 WEBAPP_EDITOR_ORPHAN_GRACE_DAYS 일 넘은 것만).
 *
 * 표가 아직 없는 설치본(업그레이드 전)에서는 임시 저장을 쓰지 않고 예전처럼 바로 저장한다(api_editor_uploads_ready).
 * 파일 이름은 upload.php 가 만드는 무작위 이름(시각 14자리_영숫자 16자)이라 본문 주소에서 바로 대장 행을 찾는다.
 */

if (!defined('_GNUBOARD_')) exit;

if (!defined('API_EDITOR_TMP_DIR')) {
    // G5_DATA_PATH 기준. 이름에 "/editor/" 가 들어가면 안 된다 — upload.php 의 지우기 · api_editor_image_ref() 가
    // 그 표시로 data/editor/ 사진을 알아본다.
    define('API_EDITOR_TMP_DIR', 'tmp/editor_upload');
}

if (!defined('API_EDITOR_STATE_TMP')) {
    define('API_EDITOR_STATE_TMP', 0);      // data/tmp 에서 글을 기다린다
    define('API_EDITOR_STATE_ATTACHED', 1); // data/editor 로 옮겨져 글에 붙었다 — 글을 지우면 함께 지운다
    define('API_EDITOR_STATE_KEPT', 2);     // 바로 저장(앱 등) · 복사된 글이 함께 씀 — 저절로 지우지 않는다
    /** 사진이 붙는 곳의 종류(ei_kind) — 게시판 글 · 댓글, 상품 후기, 상품 문의, 1:1 문의. */
    define('API_EDITOR_KINDS', ['write', 'item_use', 'item_qa', 'qa']);
    define('API_EDITOR_NAME_PATTERN', '[0-9]{14}_[A-Za-z0-9]{16}\.(?:gif|jpe?g|png|webp|bmp)');
}

/** 대장 표가 있는지 — 요청마다 한 번만 본다. */
function api_editor_uploads_ready(): bool
{
    try {
        return api_editor_table_exists(DB::table('editor_image_table'));
    } catch (Throwable $e) {
        return false; // 표 키가 등록되지 않은 설치본
    }
}

function api_editor_upload_file_name_ok(string $name): bool
{
    return preg_match('/^' . API_EDITOR_NAME_PATTERN . '$/i', $name) === 1;
}

/** G5_DATA_PATH 기준 폴더($dir)의 사진 주소 — 그누보드 저장 형식(G5_DATA_URL)과 같다. */
function api_editor_upload_url(string $dir, string $name): string
{
    return G5_DATA_URL . '/' . $dir . '/' . $name;
}

/**
 * 사진이 붙는 곳. bo_table 은 게시판 글 · 댓글(write)만, 부모는 글 번호(댓글이면 원글, 1:1 답변이면 질문)이고 없으면 자기 번호.
 *
 * @return array{kind:string,bo_table:string,ref_id:int,parent_id:int}
 */
function api_editor_target(string $kind, int $refId, int $parentId = 0, string $boTable = ''): array
{
    if (!in_array($kind, API_EDITOR_KINDS, true)) {
        throw new InvalidArgumentException('Unknown editor image kind: ' . $kind);
    }
    return [
        'kind'      => $kind,
        'bo_table'  => $kind === 'write' ? substr($boTable, 0, 20) : '',
        'ref_id'    => max(0, $refId),
        'parent_id' => max(0, $parentId > 0 ? $parentId : $refId),
    ];
}

/**
 * 올린 사진 한 장을 대장에 적는다. 실패하면 false(로그만 남긴다).
 *
 * @param array{file:string,dir:string,state:int,mb_id:string,source:string,mime:string,size:int,width:int,height:int,ip:string} $row
 */
function api_editor_upload_record(array $row): bool
{
    try {
        DB::execute(
            'INSERT INTO `' . DB::table('editor_image_table') . '`
                (ei_file, ei_dir, ei_state, mb_id, ei_source, ei_mime, ei_size, ei_width, ei_height, ei_ip, ei_datetime)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $row['file'],
                $row['dir'],
                (int) $row['state'],
                substr((string) $row['mb_id'], 0, 20),
                mb_substr((string) $row['source'], 0, 255, 'UTF-8'),
                substr((string) $row['mime'], 0, 32),
                max(0, (int) $row['size']),
                min(65535, max(0, (int) $row['width'])),
                min(65535, max(0, (int) $row['height'])),
                substr((string) $row['ip'], 0, 45),
                date('Y-m-d H:i:s'),
            ]
        );
        return true;
    } catch (Throwable $e) {
        error_log('[editor-uploads] record: ' . $e->getMessage());
        return false;
    }
}

/**
 * 저장 직전의 본문에서 임시 사진(…/data/tmp/editor_upload/<파일>)을 data/editor/<yymm>/ 으로 옮기고 주소를 바꾼다.
 * - 이미 옮긴 사진(같은 글을 다시 보냄 · 다른 글에 붙여 넣음)은 옮긴 곳 주소로만 바꾼다.
 * - 옮겼지만 저장이 실패해 아직 글에 붙지 않은 내 사진(data/editor 주소)도 이번 글에 붙일 몫으로 돌려준다.
 * - 남의 임시 사진이나 대장에 없는 주소는 그대로 둔다.
 *
 * @param array{kind:string,bo_table:string,ref_id:int,parent_id:int}|null $target 글이 이미 있으면(수정) 바로 붙인다.
 *        새 글은 null 로 부르고 등록 뒤 api_editor_attach($ids, $target).
 * @return array{html:string, ids:int[]} 바뀐 본문과 이번 글에 붙일(붙인) 대장 행 번호
 */
function api_editor_tmp_finalize(string $html, array $member, ?array $target = null): array
{
    $result = ['html' => $html, 'ids' => []];
    if ($html === '' || stripos($html, '/editor') === false || !api_editor_uploads_ready()) {
        return $result;
    }

    $isSuper = class_exists('Auth') && Auth::adminRole($member) === 'super';
    $actor = (string) ($member['mb_id'] ?? '');
    $resolved = [];
    $ids = [];
    $pattern = '~(?:https?:)?(?://[^/"\'\s<>]+)?[^"\'\s<>]*?/(' . preg_quote(API_EDITOR_TMP_DIR, '~') . '|editor/[0-9A-Za-z_]{1,20})/('
        . API_EDITOR_NAME_PATTERN . ')~i';

    $replaced = preg_replace_callback($pattern, static function (array $m) use ($actor, $isSuper, $target, &$resolved, &$ids) {
        $isTmp = strcasecmp($m[1], API_EDITOR_TMP_DIR) === 0;
        $key = ($isTmp ? 't:' : 'e:') . $m[2];
        if (!array_key_exists($key, $resolved)) {
            $resolved[$key] = api_editor_resolve($m[2], $isTmp, $actor, $isSuper, $target, $ids);
        }
        return $resolved[$key] ?? $m[0];
    }, $html);

    $result['html'] = is_string($replaced) ? $replaced : $html;
    $result['ids'] = array_values(array_unique($ids));
    return $result;
}

/**
 * 본문의 사진 한 장 — 옮기거나(임시) 붙일 몫으로 고른다. 주소를 바꿔야 하면 새 주소, 그대로면 null.
 *
 * @param int[] $ids 이번 글에 붙일(붙인) 행 번호를 더한다
 */
function api_editor_resolve(string $name, bool $isTmpUrl, string $actor, bool $isSuper, ?array $target, array &$ids): ?string
{
    $table = DB::table('editor_image_table');
    $row = DB::fetch("SELECT ei_id, ei_dir, ei_state, mb_id, ei_kind FROM `{$table}` WHERE ei_file = ? LIMIT 1", [$name]);
    if (!$row) {
        return null;
    }
    $eiId = (int) $row['ei_id'];
    $isOwner = $isSuper || ($actor !== '' && (string) $row['mb_id'] === $actor);

    if ((int) $row['ei_state'] === API_EDITOR_STATE_TMP) {
        return $isOwner && $isTmpUrl ? api_editor_tmp_move($eiId, $name, $target, $ids) : null;
    }

    // 옮겼지만 저장이 실패해 아직 어느 글에도 붙지 않은 내 사진 — 이번 글에 붙인다.
    if ($isOwner && (int) $row['ei_state'] === API_EDITOR_STATE_ATTACHED && (string) $row['ei_kind'] === '') {
        $ids[] = $eiId;
        if ($target !== null) {
            api_editor_attach([$eiId], $target);
        }
    }
    $dir = (string) $row['ei_dir'];
    return $isTmpUrl && strpos($dir, 'editor/') === 0 ? api_editor_upload_url($dir, $name) : null;
}

/**
 * 임시 사진 한 장을 data/editor/<yymm>/ 으로 옮긴다. 옮겼으면 새 주소, 못 옮겼으면 null(본문은 임시 주소 그대로).
 *
 * @param int[] $ids
 */
function api_editor_tmp_move(int $eiId, string $name, ?array $target, array &$ids): ?string
{
    $table = DB::table('editor_image_table');
    $src = G5_DATA_PATH . '/' . API_EDITOR_TMP_DIR . '/' . $name;
    if (!is_file($src)) {
        return null;
    }
    $dir = 'editor/' . date('ym');
    $dstDir = G5_DATA_PATH . '/' . $dir;
    if (!is_dir($dstDir)) {
        @mkdir($dstDir, 0755, true);
        @file_put_contents($dstDir . '/index.html', '');
    }

    // 먼저 행을 차지한다 — 같은 글을 두 번 보낸 요청이 겹쳐도 한 쪽만 파일을 옮긴다.
    $claimed = DB::execute(
        "UPDATE `{$table}` SET ei_state = ?, ei_dir = ?, ei_kind = ?, bo_table = ?, ei_ref_id = ?, ei_parent_id = ?, ei_attached_at = ?
          WHERE ei_id = ? AND ei_state = ?",
        [
            API_EDITOR_STATE_ATTACHED, $dir,
            $target['kind'] ?? '', $target['bo_table'] ?? '', $target['ref_id'] ?? 0, $target['parent_id'] ?? 0,
            date('Y-m-d H:i:s'), $eiId, API_EDITOR_STATE_TMP,
        ]
    );
    if ($claimed !== 1) {
        $now = DB::fetch("SELECT ei_dir, ei_state FROM `{$table}` WHERE ei_id = ? LIMIT 1", [$eiId]);
        return $now && (int) $now['ei_state'] !== API_EDITOR_STATE_TMP && strpos((string) $now['ei_dir'], 'editor/') === 0
            ? api_editor_upload_url((string) $now['ei_dir'], $name)
            : null;
    }

    $dst = $dstDir . '/' . $name;
    if (!@rename($src, $dst)) {
        // 옮기지 못했으면 임시 상태로 되돌린다 — 본문은 임시 주소 그대로, 다음 저장 때 다시 해 본다.
        DB::execute(
            "UPDATE `{$table}` SET ei_state = ?, ei_dir = ?, ei_kind = '', bo_table = '', ei_ref_id = 0, ei_parent_id = 0,
                    ei_attached_at = NULL WHERE ei_id = ?",
            [API_EDITOR_STATE_TMP, API_EDITOR_TMP_DIR, $eiId]
        );
        error_log('[editor-uploads] move failed: ' . $name);
        return null;
    }
    // 올린 사람 정보(upload.php 의 .meta.php — 지우기 권한 확인)도 함께.
    if (is_file($src . '.meta.php')) {
        @rename($src . '.meta.php', $dst . '.meta.php');
    }

    $ids[] = $eiId;
    return api_editor_upload_url($dir, $name);
}

/**
 * 옮겨 둔 사진들을 글에 붙인다 — 새 글 · 새 댓글 · 새 후기처럼 저장한 뒤에야 번호가 생길 때.
 *
 * @param int[] $ids api_editor_tmp_finalize() 가 돌려준 행 번호
 * @param array{kind:string,bo_table:string,ref_id:int,parent_id:int} $target api_editor_target()
 */
function api_editor_attach(array $ids, array $target): void
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if ($ids === [] || (int) ($target['ref_id'] ?? 0) <= 0) {
        return;
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    DB::execute(
        'UPDATE `' . DB::table('editor_image_table') . "` SET ei_kind = ?, bo_table = ?, ei_ref_id = ?, ei_parent_id = ?
          WHERE ei_state = ? AND ei_id IN ({$placeholders})",
        array_merge(
            [$target['kind'], $target['bo_table'], (int) $target['ref_id'], (int) $target['parent_id'], API_EDITOR_STATE_ATTACHED],
            $ids
        )
    );
}

/**
 * 지운 글에 붙은 사진의 파일과 행을 지운다. $byParent 면 그 글과 딸린 댓글(답변)까지 — ei_parent_id 로 찾는다.
 *
 * @return int 지운 사진 수
 */
function api_editor_delete_attached(string $kind, string $boTable, int $id, bool $byParent = false): int
{
    if ($id <= 0 || !in_array($kind, API_EDITOR_KINDS, true) || !api_editor_uploads_ready()) {
        return 0;
    }
    $table = DB::table('editor_image_table');
    $column = $byParent ? 'ei_parent_id' : 'ei_ref_id';
    $rows = DB::fetchAll(
        "SELECT ei_id, ei_file, ei_dir FROM `{$table}` WHERE ei_kind = ? AND bo_table = ? AND {$column} = ? AND ei_state = ?",
        [$kind, $kind === 'write' ? $boTable : '', $id, API_EDITOR_STATE_ATTACHED]
    );
    return api_editor_purge_rows($rows, API_EDITOR_STATE_ATTACHED);
}

/**
 * 대장 행들($rows: ei_id · ei_file · ei_dir)의 사진 파일(.meta.php 함께)과 행을 지운다. 행은 아직 $state 인 것만 —
 * 그 사이 상태가 바뀐 행(임시 사진이 글에 붙음 등)은 남긴다. 파일은 대장이 쓰는 두 폴더 안의 것만 지운다.
 *
 * @param array<int,array{ei_id:mixed,ei_file:mixed,ei_dir:mixed}> $rows
 * @return int 지운 사진 수
 */
function api_editor_purge_rows(array $rows, int $state): int
{
    if ($rows === []) {
        return 0;
    }
    $ids = [];
    foreach ($rows as $row) {
        $name = (string) $row['ei_file'];
        $dir = (string) $row['ei_dir'];
        if (api_editor_upload_file_name_ok($name)
            && ($dir === API_EDITOR_TMP_DIR || preg_match('#^editor/[0-9A-Za-z_]{1,20}$#', $dir))) {
            $path = G5_DATA_PATH . '/' . $dir . '/' . $name;
            @unlink($path);
            @unlink($path . '.meta.php');
        }
        $ids[] = (int) $row['ei_id'];
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    // 실제로 지운 행 수 — 정리 단계(TableCleanup::drain)가 이 수로 다음 묶음을 돌지 정한다.
    return (int) DB::execute(
        'DELETE FROM `' . DB::table('editor_image_table') . "` WHERE ei_state = ? AND ei_id IN ({$placeholders})",
        array_merge([$state], $ids)
    );
}

/**
 * 게시판 글을 옮기거나 복사했다(bbs_move_copy, 한 행씩). 본문의 사진 중 원래 글에 붙은 것을 —
 *   옮김: 새 게시판 · 새 번호로 고친다.  복사: 두 글이 같은 파일을 쓰므로 2(지우지 않음)로 돌린다.
 * 원래 게시판 이름은 이벤트에 없어서 본문의 파일 이름과 원래 번호로 찾는다.
 */
function api_editor_move_copy(string $content, int $oldId, string $dstBoTable, int $newId, int $newParentId, bool $copy): void
{
    if ($content === '' || $oldId <= 0 || !api_editor_uploads_ready()
        || !preg_match_all('~/editor/[0-9A-Za-z_]{1,20}/(' . API_EDITOR_NAME_PATTERN . ')~i', $content, $m)) {
        return;
    }
    $names = array_values(array_unique($m[1]));
    $placeholders = implode(',', array_fill(0, count($names), '?'));
    $table = DB::table('editor_image_table');
    $where = "ei_kind = 'write' AND ei_state = ? AND ei_ref_id = ? AND ei_file IN ({$placeholders})";
    if ($copy) {
        DB::execute("UPDATE `{$table}` SET ei_state = ? WHERE {$where}",
            array_merge([API_EDITOR_STATE_KEPT, API_EDITOR_STATE_ATTACHED, $oldId], $names));
        return;
    }
    DB::execute("UPDATE `{$table}` SET bo_table = ?, ei_ref_id = ?, ei_parent_id = ? WHERE {$where}",
        array_merge([substr($dstBoTable, 0, 20), $newId, $newParentId > 0 ? $newParentId : $newId, API_EDITOR_STATE_ATTACHED, $oldId], $names));
}

/**
 * $days 일 넘게 글에 붙지 못한 임시 사진을 파일과 행째 지운다(최대 $limit 장). TableCleanup editor_tmp 단계.
 *
 * @return int 지운 행 수
 */
function api_editor_tmp_gc(int $days, int $limit): int
{
    if ($days <= 0 || $limit <= 0 || !api_editor_uploads_ready()) {
        return 0;
    }
    $rows = DB::fetchAll(
        'SELECT ei_id, ei_file, ei_dir FROM `' . DB::table('editor_image_table') . "` WHERE ei_state = ? AND ei_datetime < ?
          ORDER BY ei_id LIMIT {$limit}",
        [API_EDITOR_STATE_TMP, date('Y-m-d H:i:s', time() - $days * 86400)]
    );
    // ei_dir 은 늘 임시 폴더지만, 행에 무엇이 적혔든 임시 폴더의 파일만 지운다.
    foreach ($rows as $i => $row) {
        $rows[$i]['ei_dir'] = API_EDITOR_TMP_DIR;
    }
    return api_editor_purge_rows($rows, API_EDITOR_STATE_TMP);
}

/** dry-run — 지울 임시 사진 수. */
function api_editor_tmp_gc_count(int $days): int
{
    if ($days <= 0 || !api_editor_uploads_ready()) {
        return 0;
    }
    return DB::count(
        'SELECT COUNT(*) FROM `' . DB::table('editor_image_table') . '` WHERE ei_state = ? AND ei_datetime < ?',
        [API_EDITOR_STATE_TMP, date('Y-m-d H:i:s', time() - $days * 86400)]
    );
}

/**
 * data/editor 로 옮겼지만 $days 일이 지나도 어느 글에도 붙지 않은 사진 — 옮긴 뒤 저장이 실패하고(등록 오류 등) 다시
 * 저장하지 않았다. 다시 저장하면 그때 붙으므로(api_editor_resolve) 임시 사진과 같은 날수를 기다린다.
 *
 * @return int 지운 사진 수
 */
function api_editor_unbound_gc(int $days, int $limit): int
{
    if ($days <= 0 || $limit <= 0 || !api_editor_uploads_ready()) {
        return 0;
    }
    $rows = DB::fetchAll(
        'SELECT ei_id, ei_file, ei_dir FROM `' . DB::table('editor_image_table') . "` WHERE ei_state = ? AND ei_kind = ''
            AND ei_attached_at < ? ORDER BY ei_id LIMIT {$limit}",
        [API_EDITOR_STATE_ATTACHED, date('Y-m-d H:i:s', time() - $days * 86400)]
    );
    return api_editor_purge_rows($rows, API_EDITOR_STATE_ATTACHED);
}

/** dry-run — 글에 붙지 못한 채 남은 사진 수. */
function api_editor_unbound_gc_count(int $days): int
{
    if ($days <= 0 || !api_editor_uploads_ready()) {
        return 0;
    }
    return DB::count(
        'SELECT COUNT(*) FROM `' . DB::table('editor_image_table') . "` WHERE ei_state = ? AND ei_kind = '' AND ei_attached_at < ?",
        [API_EDITOR_STATE_ATTACHED, date('Y-m-d H:i:s', time() - $days * 86400)]
    );
}

/**
 * 붙은 글이 없어진 사진(최대 $limit 장) — 삭제 이벤트 없이 지워진 글의 몫. 그누보드 관리자의 게시판 삭제(글 표째),
 * 상품 삭제(그 상품의 후기 · 문의를 바로 지움), 직접 DB 정리 같은 경우다. 붙은 지 $graceDays 일 넘은 행만 본다.
 * 원래 표를 확인할 수 없으면(쇼핑몰 · 1:1 문의 표가 없는 설치본, 게시판 행은 있는데 글 표가 없음) 그 종류는 건너뛴다.
 *
 * @return array<int,array{ei_id:mixed,ei_file:mixed,ei_dir:mixed}>
 */
function api_editor_orphan_rows(int $graceDays, int $limit): array
{
    global $g5;
    if ($graceDays <= 0 || $limit <= 0 || !api_editor_uploads_ready()) {
        return [];
    }
    $table = DB::table('editor_image_table');
    $cutoff = date('Y-m-d H:i:s', time() - $graceDays * 86400);
    $attached = API_EDITOR_STATE_ATTACHED;
    $rows = [];

    // 상품 후기 · 상품 문의 · 1:1 문의 — 번호가 원래 표에 없으면.
    $refs = [
        'item_use' => ['g5_shop_item_use_table', 'is_id'],
        'item_qa'  => ['g5_shop_item_qa_table', 'iq_id'],
        'qa'       => ['qa_content_table', 'qa_id'],
    ];
    foreach ($refs as $kind => [$key, $pk]) {
        $left = $limit - count($rows);
        if ($left <= 0) {
            return $rows;
        }
        if (empty($g5[$key]) || !api_editor_table_exists((string) $g5[$key])) {
            continue;
        }
        $rows = array_merge($rows, DB::fetchAll(
            "SELECT e.ei_id, e.ei_file, e.ei_dir FROM `{$table}` e LEFT JOIN `{$g5[$key]}` r ON r.`{$pk}` = e.ei_ref_id
              WHERE e.ei_kind = ? AND e.ei_state = {$attached} AND e.ei_attached_at < ? AND r.`{$pk}` IS NULL
              ORDER BY e.ei_id LIMIT {$left}",
            [$kind, $cutoff]
        ));
    }

    // 게시판 글 · 댓글 — 게시판마다. 게시판을 통째로 지웠으면(게시판 행도 글 표도 없으면) 그 게시판의 사진 전부.
    $boards = DB::fetchAll(
        "SELECT DISTINCT bo_table FROM `{$table}` WHERE ei_kind = 'write' AND ei_state = {$attached} AND ei_attached_at < ?",
        [$cutoff]
    );
    foreach ($boards as $board) {
        $left = $limit - count($rows);
        if ($left <= 0) {
            return $rows;
        }
        $boTable = (string) $board['bo_table'];
        if (!preg_match('/^[A-Za-z0-9_]{1,20}$/', $boTable)) {
            continue;
        }
        $writeTable = DB::writeTable($boTable);
        if (api_editor_table_exists($writeTable)) {
            $rows = array_merge($rows, DB::fetchAll(
                "SELECT e.ei_id, e.ei_file, e.ei_dir FROM `{$table}` e LEFT JOIN `{$writeTable}` w ON w.wr_id = e.ei_ref_id
                  WHERE e.ei_kind = 'write' AND e.bo_table = ? AND e.ei_state = {$attached} AND e.ei_attached_at < ?
                    AND w.wr_id IS NULL ORDER BY e.ei_id LIMIT {$left}",
                [$boTable, $cutoff]
            ));
        } elseif (!DB::fetch('SELECT 1 AS ok FROM `' . DB::table('board_table') . '` WHERE bo_table = ? LIMIT 1', [$boTable])) {
            $rows = array_merge($rows, DB::fetchAll(
                "SELECT ei_id, ei_file, ei_dir FROM `{$table}`
                  WHERE ei_kind = 'write' AND bo_table = ? AND ei_state = {$attached} AND ei_attached_at < ?
                  ORDER BY ei_id LIMIT {$left}",
                [$boTable, $cutoff]
            ));
        }
    }
    return $rows;
}

/** 붙은 글이 없어진 사진을 지운다(TableCleanup editor_orphan 단계). @return int 지운 사진 수 */
function api_editor_orphan_gc(int $graceDays, int $limit): int
{
    return api_editor_purge_rows(api_editor_orphan_rows($graceDays, $limit), API_EDITOR_STATE_ATTACHED);
}

/** dry-run — 붙은 글이 없어진 사진 수(정리 크론의 미리 보기라 넉넉한 상한까지만 센다). */
function api_editor_orphan_gc_count(int $graceDays): int
{
    return count(api_editor_orphan_rows($graceDays, 100000));
}

/** 표가 있는지 — 같은 요청에서 한 번만 본다. */
function api_editor_table_exists(string $name): bool
{
    static $seen = [];
    if (!array_key_exists($name, $seen)) {
        try {
            $seen[$name] = (bool) DB::fetch(
                'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
                [$name]
            );
        } catch (Throwable $e) {
            $seen[$name] = false;
        }
    }
    return $seen[$name];
}

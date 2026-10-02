<?php
/**
 * Gnuboard5 REST API - Post Attachments (file reconciliation)
 *
 * Mounted under boards.php when route matches /v1/boards/{bo_table}/{wr_id}/files.
 * Expects $bo_table and $wr_id to be already set by the parent dispatcher.
 *
 * Routes handled:
 *   GET  /v1/boards/{bo_table}/{wr_id}/files
 *     -> List current attachments (public; same visibility as the post itself).
 *
 *   PUT  /v1/boards/{bo_table}/{wr_id}/files (multipart/form-data)
 *     Form fields:
 *       order[]        - one entry per final slot, in the desired display order.
 *                        Each entry is either:
 *                          * a numeric string ("3")  -> keep existing bf_no=3
 *                          * "new:<i>"               -> place files[i] here
 *       files[]        - newly uploaded files (referenced by "new:<i>" in order[])
 *       bf_content[]   - per-row description; index aligns with the FINAL slot.
 *                        Optional.
 *     Server reconciles: deletes anything not referenced by order[], then
 *     inserts every slot in order[] sequence with bf_no = 0,1,2,... This is
 *     what makes drag-reorder + drag-insert (mixing new files between existing
 *     ones) work in a single round-trip.
 *
 *     -> Auth required; ownership check (post author or admin).
 */

if (!defined('_GNUBOARD_')) exit;
require_once __DIR__ . '/../lib/attachment-rules.php'; // 첨부 허용 규칙(1:1 문의 첨부와 같이 쓴다)
if (!isset($bo_table, $wr_id)) {
    Response::error('Internal: post-files mounted without bo_table/wr_id.', 500);
}

$boardTable     = DB::table('board_table');
$boardFileTable = DB::table('board_file_table');
$writeTable     = DB::writeTable($bo_table);

// -------------------------------------------------------------------------
// Common: validate post + board
// -------------------------------------------------------------------------
$board = api_get_board($bo_table);
if (!$board) {
    Response::error('Board not found.', 404);
}

$post = DB::fetch(
    "SELECT * FROM {$writeTable} WHERE wr_id = ? LIMIT 1",
    [$wr_id]
);
if (!$post) {
    Response::error('Post not found.', 404);
}

// -------------------------------------------------------------------------
// GET - list current attachments
// -------------------------------------------------------------------------
if ($apiMethod === 'GET') {
    $viewer = Auth::getUser();
    if ((string) ($post['wr_10'] ?? '') === 'report_hidden'
        && (!$viewer || !Auth::canManagePost($viewer, $bo_table, $post))) {
        Response::error('Post not found.', 404);
    }
    if (!api_can_read_board_post($viewer, $bo_table, $board, $post)) {
        Response::error('You do not have permission to read this post.', 403);
    }
    if (api_is_blocked_author(
        $viewer,
        (string) ($post['mb_id'] ?? ''),
        (string) ($post['wr_name'] ?? '')
    ) && !Auth::canManagePost($viewer ?: array(), $bo_table, $post)) {
        Response::error('Post not found.', 404);
    }

    $rows = DB::fetchAll(
        "SELECT bf_no, bf_source, bf_file, bf_content, bf_filesize,
                bf_width, bf_height, bf_type, bf_download, bf_datetime, bf_fileurl, bf_thumburl
         FROM {$boardFileTable}
         WHERE bo_table = ? AND wr_id = ?
         ORDER BY bf_no ASC",
        [$bo_table, $wr_id]
    );
    foreach ($rows as &$r) {
        $r['bf_url'] = api_board_file_url($bo_table, $wr_id, $r['bf_no'], $r['bf_file'], 0, 0, $r);
        $r['bf_download_url'] = api_board_file_download_url($bo_table, $wr_id, $r['bf_no']);
    }
    Response::success($rows);
}

// -------------------------------------------------------------------------
// PUT - reconcile attachments (multipart/form-data)
// -------------------------------------------------------------------------
if ($apiMethod !== 'PUT' && $apiMethod !== 'POST') {
    Response::error('Method not allowed.', 405);
}

$member = Auth::requireAuth();

// 그누보드 표준 권한: 본인 OR cf_admin / gr_admin / bo_admin 중 하나
if (!Auth::canManagePost($member, $bo_table, $post)) {
    Response::error('Forbidden.', 403);
}
// 첨부를 바꾸는 것도 글 수정이다 — 원본 write_update.php 와 같은 수정 제한(관리자 레벨 · 답변글 · bo_count_modify).
$blocked = api_post_change_blocked($member, $bo_table, $board, $post, $writeTable, 'modify');
if ($blocked !== null) {
    Response::error($blocked[0], $blocked[1]);
}
$isAdmin = Auth::adminRole($member, $bo_table) !== '';

// PHP doesn't natively parse multipart out of PUT bodies. Workaround: clients
// send POST with multipart (we accept POST too).
$orderInput = $_POST['order'] ?? [];
if (!is_array($orderInput)) $orderInput = [$orderInput];

$bfContent = $_POST['bf_content'] ?? [];
if (!is_array($bfContent)) $bfContent = [];

// Normalize uploaded files into a per-file array (preserving the "new:i" indexing).
$uploaded = post_files_normalize_files($_FILES['files'] ?? null);

// Parse order[] into a list of slot descriptors.
// Each slot is either ['kind' => 'keep', 'bf_no' => int] or ['kind' => 'new', 'index' => int].
$slots = [];
foreach ($orderInput as $entry) {
    if (is_string($entry) && strpos($entry, 'new:') === 0) {
        $idx = (int) substr($entry, 4);
        if (!isset($uploaded[$idx])) {
            Response::error("order[]에서 참조한 new:{$idx}에 해당하는 업로드 파일이 없습니다.", 422);
        }
        $slots[] = ['kind' => 'new', 'index' => $idx];
    } elseif (is_numeric($entry)) {
        $slots[] = ['kind' => 'keep', 'bf_no' => (int) $entry];
    }
    // else: silently skip malformed entries
}

// -------------------------------------------------------------------------
// Validation
// -------------------------------------------------------------------------
$maxCount = (int) ($board['bo_upload_count'] ?? 0);
if ($maxCount > 0 && count($slots) > $maxCount && !$isAdmin) {
    Response::error("첨부파일은 {$maxCount}개를 초과할 수 없습니다.", 422);
}

$maxSize = (int) ($board['bo_upload_size'] ?? 0);
foreach ($uploaded as $u) {
    if ($u['error'] !== UPLOAD_ERR_OK) {
        Response::error("업로드 중 오류 ({$u['name']}): code={$u['error']}", 400);
    }
    if ($maxSize > 0 && $u['size'] > $maxSize && !$isAdmin) {
        $kb = number_format($maxSize);
        Response::error("\"{$u['name']}\" 파일이 게시판 제한 용량({$kb} 바이트)을 초과합니다.", 422);
    }
}

// -------------------------------------------------------------------------
// Read existing rows
// -------------------------------------------------------------------------
$existingRows = DB::fetchAll(
    "SELECT * FROM {$boardFileTable} WHERE bo_table = ? AND wr_id = ?",
    [$bo_table, $wr_id]
);
$existing = [];
foreach ($existingRows as $row) {
    $existing[(int) $row['bf_no']] = $row;
}

// Validate that every keep slot points to an existing attachment.
foreach ($slots as $slot) {
    if ($slot['kind'] === 'keep' && !isset($existing[$slot['bf_no']])) {
        Response::error("Unknown bf_no in order[]: {$slot['bf_no']}", 422);
    }
}

// Set of bf_no still kept after reconciliation.
$keptBfNoSet = [];
foreach ($slots as $slot) {
    if ($slot['kind'] === 'keep') $keptBfNoSet[$slot['bf_no']] = true;
}

// -------------------------------------------------------------------------
// Save new uploaded files to disk first. If any fails, rollback what was
// already saved so we don't leave orphan files.
// -------------------------------------------------------------------------
$boardDir = G5_DATA_PATH . '/file/' . $bo_table;
if (!is_dir($boardDir)) {
    @mkdir($boardDir, 0755, true);
}

$newRows  = [];
$savedDisk = []; // for rollback
try {
    foreach ($uploaded as $i => $u) {
        $saved = post_files_save_disk($u, $boardDir);
        $savedDisk[] = $saved['path'];
        // 검사 플러그인이 거부하면 이번 요청에서 저장한 파일을 모두 지우고 멈춘다.
        $newRows[] = post_files_run_upload_hooks($saved, $board, $wr_id, $member, static function () use (&$savedDisk) {
            foreach ($savedDisk as $p) @unlink($p);
        });
    }
} catch (Throwable $e) {
    foreach ($savedDisk as $p) @unlink($p);
    error_log('[api/post-files] Upload processing failed: ' . $e->getMessage());
    Response::error('Upload processing failed.', 500);
}

// -------------------------------------------------------------------------
// Reconcile: drop files no longer referenced by order[], then DELETE all rows
// + re-INSERT in the new order. Composite PK (bo_table, wr_id, bf_no) makes
// plain UPDATE of bf_no painful (collisions during reorder), so wipe-and-reinsert
// is simplest and safest for the small N typical of attachments.
// -------------------------------------------------------------------------
foreach ($existing as $bfNo => $row) {
    if (!isset($keptBfNoSet[$bfNo])) {
        // 그누보드 훅(bbs/write_update.php 의 파일 삭제) — 외부 저장소 플러그인이 지울 경로를 바꾸거나 직접 지운다.
        $filePath = api_run_replace('delete_file_path', $boardDir . '/' . str_replace('../', '', $row['bf_file']), array($row), $member);
        if (is_string($filePath) && is_file($filePath)) @unlink($filePath);
        if (function_exists('delete_board_thumbnail') && $row['bf_file']) {
            @delete_board_thumbnail($bo_table, $row['bf_file']);
        }
    }
}

DB::execute(
    "DELETE FROM {$boardFileTable} WHERE bo_table = ? AND wr_id = ?",
    [$bo_table, $wr_id]
);

// Build final row list by walking slots in user-defined order.
$final = [];
foreach ($slots as $slot) {
    if ($slot['kind'] === 'keep') {
        $final[] = $existing[$slot['bf_no']];
    } else {
        $final[] = $newRows[$slot['index']];
    }
}

$now = date('Y-m-d H:i:s');
foreach ($final as $i => $row) {
    $content = isset($bfContent[$i]) ? (string) $bfContent[$i] : (string) ($row['bf_content'] ?? '');
    DB::execute(
        "INSERT INTO {$boardFileTable}
            (bo_table, wr_id, bf_no, bf_source, bf_file, bf_download,
             bf_content, bf_fileurl, bf_thumburl, bf_storage,
             bf_filesize, bf_width, bf_height, bf_type, bf_datetime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $bo_table,
            $wr_id,
            $i,
            (string) ($row['bf_source']  ?? ''),
            (string) ($row['bf_file']    ?? ''),
            (int)    ($row['bf_download'] ?? 0),
            $content,
            (string) ($row['bf_fileurl'] ?? ''),
            (string) ($row['bf_thumburl'] ?? ''),
            (string) ($row['bf_storage']  ?? ''),
            (int)    ($row['bf_filesize'] ?? 0),
            (int)    ($row['bf_width']    ?? 0),
            (int)    ($row['bf_height']   ?? 0),
            (int)    ($row['bf_type']     ?? 0),
            isset($row['bf_datetime']) && $row['bf_datetime'] !== '0000-00-00 00:00:00'
                ? (string) $row['bf_datetime']
                : $now,
        ]
    );
    // 그누보드 훅 — 새로 올린 첨부의 행을 넣은 뒤(bo_table, wr_id, 원본 $upload 모양 배열, $w)
    if (isset($row['_upload'])) {
        api_run_event('write_update_file_insert', array($bo_table, $wr_id, $row['_upload'], 'u'), $member);
    }
}

// Re-fetch and return the new state.
$updated = DB::fetchAll(
    "SELECT bf_no, bf_source, bf_file, bf_content, bf_filesize,
            bf_width, bf_height, bf_type, bf_download, bf_datetime, bf_fileurl, bf_thumburl
     FROM {$boardFileTable}
     WHERE bo_table = ? AND wr_id = ?
     ORDER BY bf_no ASC",
    [$bo_table, $wr_id]
);
foreach ($updated as &$u) {
    $u['bf_url'] = api_board_file_url($bo_table, $wr_id, $u['bf_no'], $u['bf_file'], 0, 0, $u);
    $u['bf_download_url'] = api_board_file_download_url($bo_table, $wr_id, $u['bf_no']);
}

// 첨부가 바뀌면 목록 썸네일도 바뀐다 — 그누보드 latest() 위젯 캐시를 비운다(bbs/write_update.php 와 같다).
api_call_core('delete_cache_latest', array($bo_table), $member);

Response::success($updated);

// =========================================================================
// Helpers (file scope)
// =========================================================================

/**
 * Normalize PHP's awkward $_FILES array (when name="files[]") into a per-file
 * list, dropping empty slots.
 */
function post_files_normalize_files($entry)
{
    if (!$entry || !isset($entry['name'])) return [];
    $names = (array) $entry['name'];
    $out   = [];
    for ($i = 0, $n = count($names); $i < $n; $i++) {
        if (!$names[$i]) continue; // skip empty slots
        $out[] = [
            'name'     => $names[$i],
            'type'     => $entry['type'][$i]     ?? '',
            'tmp_name' => $entry['tmp_name'][$i] ?? '',
            'error'    => (int) ($entry['error'][$i] ?? UPLOAD_ERR_NO_FILE),
            'size'     => (int) ($entry['size'][$i]  ?? 0),
        ];
    }
    return $out;
}

/**
 * Save one uploaded file to $boardDir using gnuboard's filename convention
 * (unpredictable, prevents direct URL guessing). Returns ['path' => ..., 'meta' => row].
 */
function post_files_save_disk(array $u, $boardDir)
{
    if (!is_uploaded_file($u['tmp_name'])) {
        throw new RuntimeException("Not an uploaded file: {$u['name']}");
    }

    $orig   = $u['name'];
    $extension = strtolower(pathinfo((string) $orig, PATHINFO_EXTENSION));
    if (!post_files_allowed_extension($extension)) {
        throw new RuntimeException("File extension is not allowed: {$orig}");
    }

    $sanitized = preg_replace(
        "/\.(php|pht|phtm|htm|shtml|shtm|cgi|pl|exe|jsp|asp|inc|phar|svg|svgz)/i",
        "$0-x",
        $orig
    );

    // Image meta (width/height/type) — also doubles as a "is this really an image" check
    // for files claiming image extensions.
    $imgInfo = @getimagesize($u['tmp_name']);
    global $config;
    $imageExt = isset($config['cf_image_extension']) ? $config['cf_image_extension'] : 'gif|jpg|jpeg|png|webp';
    if (preg_match("/\.({$imageExt})$/i", $orig)) {
        if (!$imgInfo || $imgInfo[2] < 1 || $imgInfo[2] > 18) {
            throw new RuntimeException("의심스러운 이미지 파일: {$orig}");
        }
    }

    $mime = post_files_detect_mime($u['tmp_name']);
    if (!post_files_allowed_mime($extension, $mime, $imgInfo)) {
        throw new RuntimeException("File MIME type is not allowed: {$orig}");
    }

    // Unique filename: ip-hash + random + sanitized original.
    $chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $rand  = '';
    for ($k = 0; $k < 8; $k++) {
        $rand .= $chars[random_int(0, strlen($chars) - 1)];
    }
    $ipHash = md5(sha1($_SERVER['REMOTE_ADDR'] ?? ''));
    $base   = function_exists('replace_filename') ? replace_filename($sanitized) : preg_replace('/[^A-Za-z0-9._-]/', '_', $sanitized);
    $stored = $ipHash . '_' . $rand . '_' . $base;

    $dest = $boardDir . '/' . $stored;
    if (!@move_uploaded_file($u['tmp_name'], $dest)) {
        throw new RuntimeException("파일 저장 실패: {$orig}");
    }
    if (defined('G5_FILE_PERMISSION')) {
        @chmod($dest, G5_FILE_PERMISSION);
    }

    return [
        'path' => $dest,
        'meta' => [
            'bf_source'   => $orig,
            'bf_file'     => $stored,
            'bf_download' => 0,
            'bf_filesize' => $u['size'],
            'bf_width'    => $imgInfo ? (int) $imgInfo[0] : 0,
            'bf_height'   => $imgInfo ? (int) $imgInfo[1] : 0,
            'bf_type'     => $imgInfo ? (int) $imgInfo[2] : 0,
        ],
    ];
}

/**
 * 그누보드 훅 write_update_upload_file · write_update_upload_array 를 원본과 같은 인자로 부른다.
 * 플러그인은 원본 $upload[$i] 모양(file · source · filesize · image · fileurl · thumburl · storage)을 받으므로
 * 그 모양으로 건네고, 돌려받은 값을 첨부 행으로 옮긴다. 행을 넣은 뒤 부를 write_update_file_insert 용으로
 * 그 배열을 '_upload' 에 같이 둔다(INSERT 는 열을 하나씩 고르므로 이 키는 저장되지 않는다).
 */
function post_files_run_upload_hooks(array $saved, array $board, $wr_id, array $member, ?callable $onBlock = null): array
{
    $meta = $saved['meta'];
    $upload = [
        'file'     => $meta['bf_file'],
        'source'   => $meta['bf_source'],
        'filesize' => $meta['bf_filesize'],
        'image'    => [$meta['bf_width'], $meta['bf_height'], $meta['bf_type']],
        'fileurl'  => '',
        'thumburl' => '',
        'storage'  => '',
    ];

    // 저장 전 검사 자리라 거부 · 실패를 무시하지 않는다(api_run_before_replace) — 원래 값으로 계속하면 플러그인의 거부가 사라진다.
    $destFile = api_run_before_replace('write_update_upload_file', $saved['path'], [$board, $wr_id, 'u'], $member, $onBlock);
    $hooked = api_run_before_replace('write_update_upload_array', $upload, [$destFile, $board, $wr_id, 'u'], $member, $onBlock);
    if (is_array($hooked)) {
        $upload = array_merge($upload, $hooked);
    }

    return array_merge($meta, [
        'bf_file'     => (string) $upload['file'],
        'bf_source'   => (string) $upload['source'],
        'bf_filesize' => (int) $upload['filesize'],
        'bf_fileurl'  => (string) $upload['fileurl'],
        'bf_thumburl' => (string) $upload['thumburl'],
        'bf_storage'  => (string) $upload['storage'],
        '_upload'     => $upload,
    ]);
}

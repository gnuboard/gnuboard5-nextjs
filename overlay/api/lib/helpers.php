<?php
/**
 * Gnuboard5 REST API - Common Helper Functions
 *
 * Utility functions shared across all API handlers.
 */
require_once __DIR__ . '/request_helpers.php';

/**
 * Return the current HTTP request method in uppercase.
 *
 * @return string  GET, POST, PUT, PATCH, DELETE, OPTIONS …
 */
function get_request_method()
{
    return strtoupper($_SERVER['REQUEST_METHOD']);
}

/**
 * Parse and return the JSON request body as an associative array.
 *
 * Falls back to $_POST when the content-type is form-encoded.
 *
 * @return array
 */
function get_request_body()
{
    $contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';

    // JSON body
    if (strpos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return api_restore_request_editor_urls(is_array($data) ? $data : []);
    }

    // Form-encoded or multipart
    if (!empty($_POST)) {
        return api_restore_request_editor_urls($_POST);
    }

    // Last resort: try to parse raw input as JSON anyway
    $raw = file_get_contents('php://input');
    if ($raw) {
        $data = json_decode($raw, true);
        if (is_array($data)) {
            return api_restore_request_editor_urls($data);
        }
    }

    return [];
}

/**
 * 글 · 댓글 본문(wr_content)에 실려 온 이 API 의 에디터 사진 주소를 그누보드 저장 형식으로 되돌린다
 * (lib/editor-images.php api_restore_editor_image_urls). 수정 화면이 읽기 응답의 API 주소를 그대로 보내므로,
 * 쓰기 핸들러마다 하지 않고 입력을 읽는 이 입구에서 한 번 한다.
 */
function api_restore_request_editor_urls(array $body)
{
    if (isset($body['wr_content']) && is_string($body['wr_content']) && function_exists('api_restore_editor_image_urls')) {
        $body['wr_content'] = api_restore_editor_image_urls($body['wr_content']);
    }

    return $body;
}

/**
 * Return sanitized query-string parameters ($_GET), excluding the
 * internal _route parameter used by the router.
 *
 * @return array
 */
function get_query_params()
{
    $params = $_GET;
    unset($params['_route']);

    // Basic sanitization
    array_walk_recursive($params, function (&$value) {
        $value = api_sanitize_input($value);
    });

    return $params;
}

/**
 * Extract named parameters from a route using a regex pattern.
 *
 * Example:
 *   get_route_param('boards/free/posts/123', '#^boards/(\w+)/posts/(\d+)$#')
 *   → ['free', '123']
 *
 * @param  string      $route   The route string (without leading slash)
 * @param  string      $pattern A regex with capture groups
 * @return array|false          Matched groups (index 1+) or false
 */
function get_route_param($route, $pattern)
{
    if (preg_match($pattern, $route, $matches)) {
        array_shift($matches); // remove full match
        return $matches;
    }
    return false;
}

/**
 * Sanitize a single input value.
 *
 * 이름 앞에 api_ 를 붙인 까닭: 최신 그누보드의 lib/common.lib.php 가 같은 이름의
 * sanitize_input() 을 이미 갖고 있어, 접두사가 없으면 부팅 도중 "Cannot redeclare"
 * 치명적 오류로 API 전체가 500 이 된다. 두 함수는 하는 일도 달라서 그누보드 것을
 * 그대로 쓸 수도 없다.
 *
 * @param  mixed $value
 * @return string
 */
function api_sanitize_input($value)
{
    if (is_array($value)) {
        return array_map('api_sanitize_input', $value);
    }
    $value = (string) $value;
    $value = trim($value);
    $value = strip_tags($value);
    $value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    return $value;
}

/**
 * Generate the full public URL for an uploaded file.
 *
 * @param  string $filename  Relative path inside G5_DATA_DIR (e.g. "file/free/img_12345.jpg")
 * @return string            Absolute URL
 */
function get_upload_url($filename)
{
    if (!$filename) {
        return '';
    }

    // If it already looks like a full URL, return as-is
    if (preg_match('#^https?://#', $filename)) {
        return $filename;
    }

    return G5_DATA_URL . '/' . ltrim($filename, '/');
}

/**
 * Build a public YoungCart item image URL only when the file exists locally.
 * 상품 이미지 주소의 정본 — shop/common.php 의 shop_api_item_image_url() 도 이것을 부른다.
 * (예전에는 shop/products.php · shop/events.php 에도 같은 이름의 사본이 있었지만, 이 파일이 먼저
 *  실려 그 사본은 한 번도 정의되지 않았다.)
 *
 * Gnuboard data can store either "image.jpg" or "it_id/image.jpg" in it_imgN.
 * Returning an empty string for missing files prevents browsers from fetching
 * 404 HTML as an image, which Chromium reports as ORB failures.
 *
 * @param  string $it_id
 * @param  string $imageField
 * @return string
 */
function api_shop_item_image_url($it_id, $imageField)
{
    if (!$imageField) {
        return '';
    }
    if (preg_match('#^https?://#i', $imageField)) {
        return $imageField;
    }

    $imageField = ltrim(str_replace('\\', '/', $imageField), '/');
    $candidates = [$imageField];
    if ($it_id && strpos($imageField, '/') === false) {
        $candidates[] = $it_id . '/' . $imageField;
    }

    foreach ($candidates as $candidate) {
        // data/item 밖을 가리키는 값(../)은 받지 않는다.
        if (strpos($candidate, '..') !== false) {
            continue;
        }
        $path = G5_DATA_PATH . '/item/' . $candidate;
        if (is_file($path)) {
            $segments = array_map('rawurlencode', explode('/', trim(str_replace('\\', '/', $candidate), '/')));
            $stamp = filemtime($path) ?: 0;
            $base = api_public_app_base_url();
            return ($base !== '' ? $base : '')
                . '/api/v1/shop/images/item/'
                . implode('/', $segments)
                . ($stamp ? '?v=' . $stamp : '');
        }
    }

    return '';
}

/**
 * Format a date/datetime string for API output (ISO 8601).
 *
 * @param  string $datetime  e.g. "2024-01-15 09:30:00" or "20240115"
 * @return string|null       ISO 8601 string or null if empty/invalid
 */
function format_datetime($datetime)
{
    if (!$datetime || $datetime === '0000-00-00 00:00:00' || $datetime === '') {
        return null;
    }

    $ts = strtotime($datetime);
    if ($ts === false || $ts < 0) {
        return null;
    }

    return date('c', $ts); // ISO 8601: 2024-01-15T09:30:00+09:00
}

/**
 * Get the public URL for a member's icon/avatar image.
 *
 * Gnuboard5 stores member icons in G5_DATA_PATH/member/[first 2 chars of mb_id]/mb_id.gif
 *
 * @param  string $mb_id
 * @return string|null  URL or null if no icon exists
 */
/**
 * 회원이미지 URL — 그누보드 회원정보 수정의 "회원이미지"(data/member_image/앞두글자/<아이콘이름>.gif).
 * 회원아이콘(get_member_icon_url)과는 다른 파일이다. 바꿔 올리면 주소가 달라지도록 수정 시각을 붙인다.
 */
function get_member_image_url($mb_id)
{
    if (!$mb_id) {
        return null;
    }

    $name = function_exists('get_mb_icon_name') ? get_mb_icon_name($mb_id) : $mb_id;
    $relative = '/member_image/' . substr($mb_id, 0, 2) . '/' . $name . '.gif';

    if (!is_file(G5_DATA_PATH . $relative)) {
        return null;
    }

    return G5_DATA_URL . $relative . '?' . filemtime(G5_DATA_PATH . $relative);
}

function get_member_icon_url($mb_id)
{
    if (!$mb_id) {
        return null;
    }

    $dir  = substr($mb_id, 0, 2);
    $path = G5_DATA_PATH . '/member/' . $dir . '/' . $mb_id . '.gif';

    if (file_exists($path)) {
        return G5_DATA_URL . '/member/' . $dir . '/' . $mb_id . '.gif';
    }

    return null;
}

/**
 * 글 · 목록 줄의 글쓴이 그림 두 가지 — 글 상세와 게시판 목록이 같은 필드를 내도록 한곳에서 만든다.
 *   mb_icon_path : 회원아이콘(이름 옆 작은 그림, data/member)
 *   mb_image_path: 회원이미지(프로필 사진, 아바타 원에 쓴다, data/member_image)
 * 한 요청 안에서 같은 회원은 파일을 다시 확인하지 않는다(목록에 같은 글쓴이가 여러 줄).
 * 회원 정보 · 로그인 응답처럼 한 사람만 다루는 곳은 $fresh = true 로 언제나 파일을 다시 본다
 * (같은 요청에서 그림을 올리거나 지운 뒤에도 옛 값을 내지 않게).
 *
 * @return array{mb_icon_path: string|null, mb_image_path: string|null}
 */
function api_member_media_urls($mb_id, $fresh = false)
{
    static $cache = array();

    $mb_id = (string) $mb_id;
    if ($mb_id === '') {
        return array('mb_icon_path' => null, 'mb_image_path' => null);
    }
    if ($fresh || !isset($cache[$mb_id])) {
        $cache[$mb_id] = array(
            'mb_icon_path' => get_member_icon_url($mb_id),
            'mb_image_path' => get_member_image_url($mb_id),
        );
    }

    return $cache[$mb_id];
}

/**
 * 비밀글 · 비밀댓글인가 — wr_option 에 'secret' 이 들었나(그누보드 원본 strstr($wr_option, 'secret') 과 같다).
 * 글 · 댓글 · 새글 · 검색 · 최근 댓글이 같은 판정을 쓴다. 요청으로 받은 wr_option 문자열에도 쓴다.
 */
function api_is_secret_option($wr_option)
{
    return strpos((string) $wr_option, 'secret') !== false;
}

/**
 * 글의 wr_option 을 그누보드 bbs/write_update.php 와 같게 만든다 — "html1|html2,secret,mail" (이 순서).
 *
 * - 그누보드 글쓰기 폼과 같은 필드 html · secret · mail 을 받는다. 원본처럼 값에서 html1|html2 · secret · mail 을
 *   골라낸다(에디터 게시판의 스킨은 html=html1 을 숨겨 보낸다). html 의 1 · 2 도 html1 · html2 로 받는다.
 *   secret · mail 은 true · 1 도 켬으로 본다.
 * - 예전 API 필드 wr_option(쉼표 문자열 또는 배열)도 받는다 — 오면 셋을 모두 그것으로 정한다.
 * - 요청에 없는 항목은 $current(수정 전 wr_option)를 그대로 둔다. 새 글이면 빈 값에서 시작한다.
 */
function api_build_wr_option(array $input, $current = '')
{
    $pickHtml = function ($value) {
        $value = strtolower(trim((string) $value));
        if ($value === '1' || $value === '2') {
            $value = 'html' . $value;
        }
        return preg_match('#html(1|2)#', $value, $matches) ? $matches[0] : '';
    };
    $flag = function ($value, $word) {
        if ($value === true || $value === 1 || $value === '1') {
            return $word;
        }
        return (is_string($value) && stripos($value, $word) !== false) ? $word : '';
    };

    $current = strtolower((string) $current);
    $parts = array(
        'html'   => $pickHtml($current),
        'secret' => $flag($current, 'secret'),
        'mail'   => $flag($current, 'mail'),
    );

    if (array_key_exists('wr_option', $input)) {
        $raw = is_array($input['wr_option'])
            ? implode(',', array_map('strval', $input['wr_option']))
            : (string) $input['wr_option'];
        $parts = array(
            'html'   => $pickHtml($raw),
            'secret' => $flag($raw, 'secret'),
            'mail'   => $flag($raw, 'mail'),
        );
    }
    if (array_key_exists('html', $input)) {
        $parts['html'] = $pickHtml($input['html']);
    }
    if (array_key_exists('secret', $input)) {
        $parts['secret'] = $flag($input['secret'], 'secret');
    }
    if (array_key_exists('mail', $input)) {
        $parts['mail'] = $flag($input['mail'], 'mail');
    }

    return implode(',', array_filter($parts));
}

/**
 * 댓글의 비밀 여부 — 그누보드 write_comment_update.php 의 폼 필드 wr_secret(값 secret). secret · 예전 wr_option 도 받는다.
 * 'secret' 또는 '' 를 돌려준다. 요청에 셋 다 없으면 null(수정에서 "바꾸지 않음").
 */
function api_comment_secret_option(array $input)
{
    foreach (array('wr_secret', 'secret', 'wr_option') as $key) {
        if (array_key_exists($key, $input)) {
            $value = is_array($input[$key]) ? implode(',', array_map('strval', $input[$key])) : $input[$key];
            return api_build_wr_option(array('secret' => $value)) === 'secret' ? 'secret' : '';
        }
    }
    return null;
}

/**
 * 이 사람이 이 게시판에서 HTML(html1 · html2 · 에디터)을 쓸 수 있나 — 그누보드 write.php 의
 * $is_html(mb_level >= bo_html_level). 관리자는 늘 된다. 비회원은 레벨 1.
 */
function api_board_html_allowed(array $board, $member, $adminRole = '')
{
    if ((string) $adminRole !== '') {
        return true;
    }
    $level = is_array($member) && isset($member['mb_level']) ? (int) $member['mb_level'] : 1;
    return $level >= (int) ($board['bo_html_level'] ?? 1);
}

/**
 * 새 글 · 답글 · 댓글 알림 메일 — 그누보드 bbs/write_update.php · write_comment_update.php 의 "메일발송 사용" 과 같다.
 * 환경설정 메일 사용(cf_email_use)과 게시판 메일 발송(bo_use_email)이 모두 켜져 있을 때만 보내고, 수정은 보내지 않는다.
 *
 * 받는 사람(환경설정 cf_email_wr_*): 게시판 · 그룹 · 최고관리자, 원글 작성자,
 * 답글이면 원글이 "답변메일받기"(wr_option 의 mail)를 켰을 때 원글 작성자, 댓글이면 cf_email_wr_comment_all 로 댓글 쓴 사람 모두.
 *
 * @param array       $board   게시판 행
 * @param string      $w       '' 새 글 · 'r' 답글 · 'c' 댓글
 * @param int         $wrId    새 글 · 답글이면 그 글, 댓글이면 댓글이 달린 글
 * @param array|null  $parent  답글이면 원글, 댓글이면 댓글이 달린 글(wr_subject · wr_email · wr_option), 새 글이면 null
 * @param array       $writer  쓴 사람 ['name' => , 'email' => ]
 * @param array       $item    ['subject' => 제목(댓글이면 빈 값), 'content' => 본문, 'wr_option' => , 'comment_id' => 댓글 번호]
 *
 * 메일이 실패해도 글쓰기는 막지 않는다(error_log 만).
 */
function api_send_board_write_mail(array $board, $w, $wrId, $parent, array $writer, array $item)
{
    global $config;

    if (empty($config['cf_email_use']) || empty($board['bo_use_email'])) {
        return;
    }

    $boTable = (string) ($board['bo_table'] ?? '');
    try {
        if (!function_exists('mailer') && defined('G5_LIB_PATH')) {
            include_once G5_LIB_PATH . '/mailer.lib.php';
        }
        if (!function_exists('mailer')) {
            return;
        }

        $memberEmail = static function ($mbId) {
            $mbId = trim((string) $mbId);
            if ($mbId === '') {
                return '';
            }
            $row = DB::fetch('SELECT mb_email FROM ' . DB::table('member_table') . ' WHERE mb_id = ? LIMIT 1', array($mbId));
            return $row ? trim((string) $row['mb_email']) : '';
        };

        $isComment = ($w === 'c');
        $commentId = (int) ($item['comment_id'] ?? 0);
        $labels = array('' => '입력', 'r' => '답변', 'c' => '댓글 ');
        $subject = '[' . $config['cf_title'] . '] ' . $board['bo_subject'] . ' 게시판에 ' . ($labels[$w] ?? '입력') . '글이 올라왔습니다.';

        // 메일 본문 틀(bbs/write_update_mail.php)이 읽는 변수들.
        $wr_name = get_text((string) $writer['name']);
        if ($isComment) {
            // 댓글은 원본처럼 "원글 제목 + 댓글" 을 글자로. 댓글 에디터의 HTML 은 글자로 풀어 넣는다.
            $commentText = preg_replace('#<br\s*/?>|</p>#i', "\n", (string) $item['content']);
            $commentText = html_entity_decode(strip_tags($commentText), ENT_QUOTES, 'UTF-8');
            $wr_subject = get_text((string) ($parent['wr_subject'] ?? ''));
            $wr_content = nl2br(get_text("원글\n" . ($parent['wr_subject'] ?? '') . "\n\n\n댓글\n" . trim($commentText)));
        } else {
            $option = (string) ($item['wr_option'] ?? '');
            $tmpHtml = strpos($option, 'html1') !== false ? 1 : (strpos($option, 'html2') !== false ? 2 : 0);
            $wr_subject = get_text((string) $item['subject']);
            $wr_content = conv_content((string) $item['content'], $tmpHtml);
        }
        $link_url = get_pretty_url($boTable, $wrId) . ($isComment && $commentId > 0 ? '#c_' . $commentId : '');

        ob_start();
        include G5_BBS_PATH . '/write_update_mail.php';
        $content = ob_get_clean();

        $emails = array();
        if (!empty($config['cf_email_wr_board_admin'])) {
            $emails[] = $memberEmail($board['bo_admin'] ?? '');
        }
        if (!empty($config['cf_email_wr_group_admin'])) {
            $group = DB::fetch('SELECT gr_admin FROM ' . DB::table('group_table') . ' WHERE gr_id = ? LIMIT 1', array($board['gr_id'] ?? ''));
            $emails[] = $memberEmail($group['gr_admin'] ?? '');
        }
        if (!empty($config['cf_email_wr_super_admin'])) {
            $emails[] = $memberEmail($config['cf_admin'] ?? '');
        }
        // 원글 작성자 — 새 글이면 쓴 사람 자신, 답글 · 댓글이면 원글 작성자.
        $originEmail = $w === '' ? (string) $writer['email'] : (string) ($parent['wr_email'] ?? '');
        if (!empty($config['cf_email_wr_write'])) {
            $emails[] = $originEmail;
        }
        // 답글: 원글이 "답변메일받기"(mail)를 켰으면 원글 작성자에게.
        if ($w === 'r' && $parent && strpos((string) ($parent['wr_option'] ?? ''), 'mail') !== false) {
            $emails[] = $originEmail;
        }
        // 댓글: 댓글 쓴 모든 사람에게(원글 작성자 · 지금 쓴 사람 빼고).
        if ($isComment && !empty($config['cf_email_wr_comment_all'])) {
            $rows = DB::fetchAll(
                'SELECT DISTINCT wr_email FROM ' . DB::writeTable($boTable) . '
                 WHERE wr_parent = ? AND wr_email NOT IN (?, ?, \'\')',
                array($wrId, $originEmail, (string) $writer['email'])
            );
            foreach ($rows as $row) {
                $emails[] = (string) $row['wr_email'];
            }
        }

        $emails = array_values(array_unique(array_filter(array_map('trim', $emails))));
        if (!$isComment) {
            // 그누보드 훅(bbs/write_update.php) — api_run_replace 로 불러 플러그인의 출력 · alert 가 응답을 깨지 않게.
            $emails = (array) api_run_replace('write_update_mail_list', $emails, array($board, $wrId));
        }
        foreach ($emails as $to) {
            api_call_core('mailer', array($wr_name, (string) $writer['email'], $to, $subject, $content, 1));
        }
    } catch (\Throwable $e) {
        error_log('[api/board-mail] ' . $boTable . ' ' . $w . ' ' . $wrId . ': ' . $e->getMessage());
    }
}

/**
 * 목록 API 의 쪽 번호(?page=, 1 부터). 숫자가 아니거나 1 보다 작으면 1.
 */
function api_page_number()
{
    return max(1, (int) ($_GET['page'] ?? 1));
}

/**
 * 목록 API 의 쪽 번호 · 쪽당 개수 · 건너뛸 줄 수를 한 번에 읽는다.
 * 쪽당 개수는 ?per_page= (또는 $param 으로 준 이름, 예: 'limit')를 1 ~ $max 로 자르고, 없으면 $default.
 * 핸들러마다 기본값 · 상한이 다르므로(후기 10, 상품 20, 댓글 50 …) 그대로 넘긴다.
 *
 * @return array{0: int, 1: int, 2: int} [page, perPage, offset]
 */
function api_page_params($default = 20, $max = 100, $param = 'per_page')
{
    $page = api_page_number();
    $perPage = min((int) $max, max(1, (int) ($_GET[$param] ?? $default)));

    return [$page, $perPage, ($page - 1) * $perPage];
}

function api_current_origin()
{
    return api_public_request_origin(false);
}

function api_public_app_base_url()
{
    if (defined('G5_WEBAPP_APP_URL') && G5_WEBAPP_APP_URL) {
        return rtrim((string) G5_WEBAPP_APP_URL, '/');
    }

    // 그누보드는 자기 설치 경로를 G5_URL 로 안다. 요청 origin 만 쓰면 하위 폴더 설치에서
    // /gnu5512 가 빠져 이미지 같은 절대 주소가 틀어진다. 스킴·호스트는 실제 요청을 따르고
    // (프록시 뒤에서도 맞도록), 경로는 G5_URL 에서 가져온다.
    $g5_path = defined('G5_URL') ? (string) parse_url((string) G5_URL, PHP_URL_PATH) : '';
    $g5_path = ($g5_path !== '' && $g5_path !== '/') ? '/' . trim($g5_path, '/') : '';

    $origin = api_current_origin();
    if ($origin !== '') {
        return rtrim($origin, '/') . $g5_path;
    }

    return defined('G5_URL') ? rtrim((string) G5_URL, '/') : '';
}

function api_board_file_path($bo_table, $bf_file)
{
    $bo_table = api_sanitize_bo_table($bo_table);
    $bf_file = trim(str_replace('\\', '/', (string) $bf_file), '/');

    if ($bo_table === '' || $bf_file === '' || strpos($bf_file, '..') !== false) {
        return '';
    }

    $base_dir = realpath(G5_DATA_PATH . '/file/' . $bo_table);
    if ($base_dir === false) {
        return '';
    }

    $path = realpath($base_dir . '/' . $bf_file);
    if ($path === false || !is_file($path)) {
        return '';
    }

    $base_dir = rtrim(str_replace('\\', '/', $base_dir), '/');
    $normalized_path = str_replace('\\', '/', $path);
    if ($normalized_path !== $base_dir && strpos($normalized_path, $base_dir . '/') !== 0) {
        return '';
    }

    return $path;
}

/** 목록이 쓸 수 있는 축소 폭 — 사진 파생본 공통 목록(lib/image-variants.php)과 같다. */
function api_board_file_thumb_widths()
{
    return api_image_variant_widths();
}

/**
 * 외부 저장소에 둔 첨부의 주소. 저장소 플러그인(S3 등)은 그누보드 훅 write_update_upload_array 에서
 * 파일을 옮기고 bf_fileurl · bf_thumburl 을 채운다. 목록 썸네일이면 bf_thumburl 을 먼저 쓴다 — 글 보기처럼
 * 큰 칸에 그리는 사진에는 플러그인이 만든 작은 썸네일을 쓰지 않는다(흐려진다).
 * http(s) 주소가 아니면 쓰지 않는다(javascript: 같은 값이 화면 링크로 가지 않게).
 */
function api_board_file_remote_url(array $fileRow, $preferThumb = false)
{
    $candidates = $preferThumb
        ? array($fileRow['bf_thumburl'] ?? '', $fileRow['bf_fileurl'] ?? '')
        : array($fileRow['bf_fileurl'] ?? '');
    foreach ($candidates as $url) {
        $url = trim((string) $url);
        if ($url !== '' && preg_match('#^https?://#i', $url) && filter_var($url, FILTER_VALIDATE_URL)) {
            return $url;
        }
    }
    return '';
}

/**
 * 첨부 사진 주소 — 로컬(data/file)에 있으면 board-files 통로(크기별 사본 · 캐시), 없으면 외부 저장소 주소.
 *
 * @param array $fileRow     첨부 행(bf_fileurl · bf_thumburl). 로컬 파일이 없을 때만 본다.
 * @param bool  $remoteThumb 외부 저장소면 bf_thumburl 을 먼저 쓴다(목록 썸네일만)
 */
function api_board_file_url($bo_table, $wr_id, $bf_no, $bf_file, $width = 0, $height = 0, array $fileRow = array(), $remoteThumb = false)
{
    $path = api_board_file_path($bo_table, $bf_file);
    if ($path === '') {
        return api_board_file_remote_url($fileRow, (bool) $remoteThumb);
    }

    $bo_table = api_sanitize_bo_table($bo_table);
    $wr_id = (int) $wr_id;
    $bf_no = (int) $bf_no;
    if ($bo_table === '' || $wr_id < 1 || $bf_no < 0) {
        return '';
    }

    $segments = array_map('rawurlencode', explode('/', trim(str_replace('\\', '/', (string) $bf_file), '/')));
    $stamp = filemtime($path) ?: 0;
    $base = api_public_app_base_url();

    $query = [];
    if ($stamp) {
        $query['v'] = $stamp;
    }
    // 목록이 쓰는 크기만 싣는다. 주소에 크기가 들어가야 브라우저·CDN 이 크기별로 따로 캐시한다.
    // 세로가 있으면 게시판 갤러리 크기로 잘라 낸 썸네일(lib/image-variants.php).
    $width = (int) $width;
    $height = (int) $height;
    if ($width > 0 && api_image_size_allowed($width, $height)) {
        $query['w'] = $width;
        if ($height > 0) {
            $query['h'] = $height;
        }
    }

    return ($base !== '' ? $base : '')
        . '/api/v1/board-files/'
        . rawurlencode($bo_table)
        . '/'
        . $wr_id
        . '/'
        . $bf_no
        . '/'
        . implode('/', $segments)
        . ($query ? '?' . http_build_query($query) : '');
}

/**
 * Get the write table name for a board.
 *
 * @param  string $bo_table
 * @return string  Full table name, e.g. "g5_write_free"
 */
function api_write_table($bo_table)
{
    return DB::writeTable(api_sanitize_bo_table($bo_table));
}

/**
 * Convert internal Next.js route paths into Gnuboard5/YoungCart rewrite paths.
 *
 * Examples:
 *   /boards/free          -> /free
 *   /boards/free/12       -> /free/12
 *   /shop/products/123    -> /shop/123
 *   /shop/categories/20   -> /shop/list-20
 */
function api_g5_short_href($href)
{
    $href = trim((string) $href);
    if ($href === '' || $href[0] !== '/') {
        return $href;
    }

    $hash = '';
    $hashPos = strpos($href, '#');
    if ($hashPos !== false) {
        $hash = substr($href, $hashPos);
        $href = substr($href, 0, $hashPos);
    }

    $query = '';
    $queryPos = strpos($href, '?');
    if ($queryPos !== false) {
        $query = substr($href, $queryPos);
        $href = substr($href, 0, $queryPos);
    }

    $path = $href !== '' ? $href : '/';
    $suffix = $query . $hash;

    if (preg_match('#^/boards/([0-9A-Za-z_]+)$#', $path, $m)) {
        return '/' . $m[1] . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/rss$#', $path, $m)) {
        return '/rss/' . $m[1] . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/write$#', $path, $m)) {
        return '/' . $m[1] . '/write' . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/([0-9]+)$#', $path, $m)) {
        return '/' . $m[1] . '/' . $m[2] . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/([^/]+)/$#', $path, $m)) {
        return '/' . $m[1] . '/' . $m[2] . '/' . $suffix;
    }
    if (preg_match('#^/boards/([0-9A-Za-z_]+)/([^/]+)$#', $path, $m)) {
        return '/' . $m[1] . '/' . $m[2] . $suffix;
    }
    if (preg_match('#^/shop/categories/([0-9A-Za-z]+)$#', $path, $m)) {
        return '/shop/list-' . $m[1] . $suffix;
    }
    if (preg_match('#^/shop/products/([^/]+)/$#', $path, $m)) {
        $reserved = [
            'cart' => true,
            'categories' => true,
            'compare' => true,
            'couponzone' => true,
            'events' => true,
            'order' => true,
            'orders' => true,
            'payment' => true,
            'personalpay' => true,
            'products' => true,
            'wishlist' => true,
        ];
        if (empty($reserved[$m[1]]) && !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $m[1])) {
            return '/shop/' . $m[1] . '/' . $suffix;
        }
    }
    if (preg_match('#^/shop/products/([^/]+)$#', $path, $m)) {
        $reserved = [
            'cart' => true,
            'categories' => true,
            'compare' => true,
            'couponzone' => true,
            'events' => true,
            'order' => true,
            'orders' => true,
            'payment' => true,
            'personalpay' => true,
            'products' => true,
            'wishlist' => true,
        ];
        if (empty($reserved[$m[1]]) && !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $m[1])) {
            return '/shop/' . $m[1] . $suffix;
        }
    }
    if ($path === '/shop/products' && $query !== '') {
        parse_str(ltrim($query, '?'), $params);
        for ($i = 1; $i <= 5; $i++) {
            $key = 'it_type' . $i;
            if (isset($params[$key]) && (string) $params[$key] === '1') {
                unset($params[$key]);
                $nextQuery = http_build_query($params);
                return '/shop/type-' . $i . ($nextQuery !== '' ? '?' . $nextQuery : '') . $hash;
            }
        }
    }

    return $path . $suffix;
}

function api_bbs_rewrite_mode()
{
    $config = api_get_config();
    return isset($config['cf_bbs_rewrite']) ? (int) $config['cf_bbs_rewrite'] : 0;
}

function api_board_post_href($bo_table, $wr_id, $wr_seo_title = '', $suffix = '')
{
    $bo_table = api_sanitize_bo_table($bo_table);
    $wr_id = (int) $wr_id;
    $wr_seo_title = trim((string) $wr_seo_title);

    if (api_bbs_rewrite_mode() === 2 && $wr_seo_title !== '') {
        return api_g5_short_href(
            '/boards/' . rawurlencode($bo_table) . '/' . rawurlencode($wr_seo_title) . '/' . $suffix
        );
    }

    return api_g5_short_href('/boards/' . rawurlencode($bo_table) . '/' . $wr_id . $suffix);
}

/**
 * 글 · 댓글을 지울 때 쓰면서 받은 포인트를 거둔다 — 그누보드 bbs/delete.php · delete_comment.php 와 같다.
 * 받은 내역이 있으면 그 내역을 지우고(delete_point), 지울 수 없으면 같은 만큼 뺀다.
 * 거두지 않으면 쓰고 지우기를 되풀이해 포인트를 쌓을 수 있다.
 *
 * @param string $action  '쓰기' 또는 '댓글' (줄 때 쓴 po_rel_action)
 * @param int    $point   게시판의 bo_write_point 또는 bo_comment_point
 * @param string $content 차감 내역에 남길 글(원본: "게시판 12 글삭제", "게시판 12-34 댓글삭제")
 */
function api_revoke_board_point($mbId, $bo_table, $relId, $action, $point, $content)
{
    $mbId = (string) $mbId;
    if ($mbId === '' || !function_exists('delete_point') || !function_exists('insert_point')) {
        return;
    }
    if (!delete_point($mbId, (string) $bo_table, (string) $relId, (string) $action)) {
        insert_point($mbId, (int) $point * (-1), (string) $content);
    }
}

/**
 * 그룹 · 게시판 관리자가 자기보다 레벨이 높은 회원의 글 · 댓글을 건드리려 하나 — 그누보드 bbs/delete.php ·
 * delete_comment.php 는 이때 지우지 못하게 한다. 최고관리자, 자기 글, 비회원 글은 해당 없음.
 *
 * @param string $role Auth::adminRole($member, $bo_table)
 * @param array  $row  글 · 댓글 행(mb_id)
 */
function api_board_admin_outranked(array $member, $role, array $row)
{
    if ($role !== 'group' && $role !== 'board') {
        return false;
    }
    $authorId = (string) ($row['mb_id'] ?? '');
    if ($authorId === '' || $authorId === (string) ($member['mb_id'] ?? '')) {
        return false;
    }
    $author = DB::fetch('SELECT mb_level FROM ' . DB::table('member_table') . ' WHERE mb_id = ? LIMIT 1', [$authorId]);
    return $author && (int) ($member['mb_level'] ?? 0) < (int) $author['mb_level'];
}

/** LIKE 'prefix%' 에 넣을 값 — prefix 안의 % · _ · \ 는 글자 그대로 */
function api_like_prefix($prefix)
{
    return addcslashes((string) $prefix, '%_\\') . '%';
}

/**
 * 글을 고치거나 지우기 전에 그누보드가 거는 제한 — bbs/write.php · write_update.php(수정), bbs/delete.php(삭제).
 *  - 그룹 · 게시판 관리자는 자기보다 레벨이 높은 회원의 글을 건드리지 못한다(403).
 *  - 관리자가 아니면 답변글이 있는 글, 남이 단 댓글이 bo_count_modify / bo_count_delete 건 이상인 글은 막는다(409).
 *    수정은 bo_count_modify 가 0 이면 제한이 없고, 삭제는 원본대로 bo_count_delete 를 그대로 비교한다.
 * 권한(본인 · 관리자) 검사를 통과한 뒤에 부른다. 막으면 [메시지, 상태], 아니면 null.
 *
 * @param string $mode 'modify' 또는 'delete'
 */
function api_post_change_blocked(array $member, $bo_table, array $board, array $post, $write_table, $mode)
{
    $isDelete = $mode === 'delete';
    $verb = $isDelete ? '삭제' : '수정';
    $role = Auth::adminRole($member, $bo_table);
    if (api_board_admin_outranked($member, $role, $post)) {
        return array("자신의 권한보다 높은 권한의 회원이 작성한 글은 {$verb}할 수 없습니다.", 403);
    }
    if ($role !== '') {
        return null;
    }

    // 답변글이 있으면 막는다 — 지우면 답변글만 남고, 고치면 답변글이 가리키는 내용이 바뀐다.
    $replyCount = (int) DB::count(
        "SELECT COUNT(*) FROM {$write_table}
         WHERE wr_reply LIKE ? AND wr_id <> ? AND wr_num = ? AND wr_is_comment = 0",
        [api_like_prefix($post['wr_reply'] ?? ''), (int) $post['wr_id'], (int) $post['wr_num']]
    );
    if ($replyCount > 0) {
        return array("이 글과 관련된 답변글이 존재하므로 {$verb}할 수 없습니다.\n"
            . ($isDelete ? '우선 답변글부터 삭제하여 주십시오.' : '답변글이 있는 원글은 수정할 수 없습니다.'), 409);
    }

    // 남이 단 댓글이 기준 이상이면 막는다 — 지우면 남의 댓글과 그 포인트까지 사라진다.
    $limit = (int) ($board[$isDelete ? 'bo_count_delete' : 'bo_count_modify'] ?? 0);
    if (!$isDelete && $limit <= 0) {
        return null;
    }
    $othersComments = (int) DB::count(
        "SELECT COUNT(*) FROM {$write_table} WHERE wr_parent = ? AND mb_id <> ? AND wr_is_comment = 1",
        [(int) $post['wr_id'], (string) $member['mb_id']]
    );
    if ($othersComments >= $limit) {
        return array("이 글과 관련된 댓글이 존재하므로 {$verb}할 수 없습니다.\n댓글이 {$limit}건 이상 달린 원글은 {$verb}할 수 없습니다.", 409);
    }
    return null;
}

/**
 * 댓글을 고치거나 지우기 전에 그누보드가 거는 제한 — bbs/write_comment_update.php(수정), delete_comment.php(삭제).
 * 관리자 레벨 비교(403), 관리자가 아니면 답변 댓글이 있는 댓글은 막는다(409). 막으면 [메시지, 상태], 아니면 null.
 *
 * @param string $mode 'modify' 또는 'delete'
 */
function api_comment_change_blocked(array $member, $bo_table, array $comment, $write_table, $mode)
{
    $verb = $mode === 'delete' ? '삭제' : '수정';
    $role = Auth::adminRole($member, $bo_table);
    if (api_board_admin_outranked($member, $role, $comment)) {
        return array("관리자의 권한보다 높은 회원의 댓글이므로 {$verb}할 수 없습니다.", 403);
    }
    if ($role !== '') {
        return null;
    }
    $replyCount = (int) DB::count(
        "SELECT COUNT(*) FROM {$write_table}
         WHERE wr_comment_reply LIKE ? AND wr_id <> ? AND wr_parent = ? AND wr_comment = ? AND wr_is_comment = 1",
        [api_like_prefix($comment['wr_comment_reply'] ?? ''), (int) $comment['wr_id'], (int) $comment['wr_parent'], (int) $comment['wr_comment']]
    );
    if ($replyCount > 0) {
        return array("이 댓글과 관련된 답변 댓글이 존재하므로 {$verb}할 수 없습니다.", 409);
    }
    return null;
}

function api_board_file_download_url($bo_table, $wr_id, $bf_no)
{
    $bo_table = api_sanitize_bo_table($bo_table);
    $wr_id = (int) $wr_id;
    $params = array(
        'bo_table' => $bo_table,
        'wr_id' => $wr_id,
        'no' => (int) $bf_no,
    );

    if (function_exists('download_file_nonce_key')) {
        $params['nonce'] = download_file_nonce_key($bo_table, $wr_id);
    }

    $base = defined('G5_BBS_URL') ? G5_BBS_URL : G5_URL . '/bbs';
    return $base . '/download.php?' . http_build_query($params, '', '&');
}

function api_shop_product_href($it_id, $it_seo_title = '', $suffix = '')
{
    $it_id = trim((string) $it_id);
    $it_seo_title = trim((string) $it_seo_title);

    if (api_bbs_rewrite_mode() === 2 && $it_seo_title !== '') {
        $slug = trim($it_seo_title, '/');
        $reserved = [
            'cart' => true,
            'categories' => true,
            'compare' => true,
            'couponzone' => true,
            'events' => true,
            'order' => true,
            'orders' => true,
            'payment' => true,
            'personalpay' => true,
            'products' => true,
            'wishlist' => true,
        ];

        if ($slug !== '' && empty($reserved[strtolower($slug)]) && !preg_match('#^(list-[0-9a-z]+|type-[1-5])$#i', $slug)) {
            return api_g5_short_href('/shop/products/' . rawurlencode($slug) . '/' . $suffix);
        }
    }

    return api_g5_short_href('/shop/products/' . rawurlencode($it_id) . $suffix);
}

/**
 * Strip sensitive fields from a member row for safe API output.
 *
 * @param  array $member  Full member row from g5_member
 * @return array           Member row without password and other sensitive fields
 */
function api_member_safe(array $member)
{
    $exclude = [
        'mb_password', 'mb_password2', 'mb_password_q', 'mb_password_a',
        'mb_intercept_date',
        'mb_leave_date',
        'mb_email_certify',
        'mb_email_certify2',
        'mb_lost_certify',
        'mb_certify',
        'mb_adult',
        'mb_dupinfo', 'mb_jumin',
        'mb_login_ip',
        'mb_ip',
        'mb_memo',
        'mb_1', 'mb_2', 'mb_3', 'mb_4', 'mb_5',
        'mb_6', 'mb_7', 'mb_8', 'mb_9', 'mb_10',
    ];

    foreach ($exclude as $key) {
        unset($member[$key]);
    }

    return $member;
}

/**
 * Return a public-only subset of member profile data.
 *
 * @param  array $member
 * @return array
 */
function api_member_public(array $member)
{
    return [
        'mb_id'        => isset($member['mb_id']) ? $member['mb_id'] : '',
        'mb_nick'      => isset($member['mb_nick']) ? $member['mb_nick'] : '',
        'mb_level'     => (int) (isset($member['mb_level']) ? $member['mb_level'] : 0),
        'mb_point'     => (int) (isset($member['mb_point']) ? $member['mb_point'] : 0),
        'mb_datetime'  => isset($member['mb_datetime']) ? $member['mb_datetime'] : '',
        'mb_icon_path' => get_member_icon_url(isset($member['mb_id']) ? $member['mb_id'] : ''),
    ];
}

/**
 * Verify that a board exists and return its configuration row.
 *
 * @param  string $bo_table
 * @return array|false  Board row or false if not found
 */
function api_get_board($bo_table)
{
    $bo_table = api_sanitize_bo_table($bo_table);
    if (!$bo_table) {
        return false;
    }

    $table = DB::table('board_table');
    $sql = "SELECT * FROM {$table}
            WHERE bo_table = ?
            LIMIT 1";
    $board = DB::fetch($sql, [$bo_table]);

    if (!$board || empty($board['bo_table'])) {
        return false;
    }

    return $board;
}

/**
 * Get the current Gnuboard5 site configuration row.
 *
 * @return array
 */
function api_get_config()
{
    $table = DB::table('config_table');
    $sql = "SELECT * FROM {$table} LIMIT 1";
    $config = DB::fetch($sql);
    return $config ?: [];
}

require_once __DIR__ . '/board_access_helpers.php';

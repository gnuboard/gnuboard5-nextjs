<?php
/**
 * Gnuboard5 REST API - Shop Product Q&A routes.
 *
 * Included by reviews.php when routed through /v1/shop/reviews/qna.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

$qnaAction = isset($shopSegments[1]) ? $shopSegments[1] : '';
$queryIqId = isset($_GET['iq_id']) && preg_match('/^\d+$/', (string) $_GET['iq_id'])
    ? (string) $_GET['iq_id']
    : '';
if ($qnaAction === '' && $queryIqId !== '') {
    $qnaAction = $queryIqId;
}
$isMineScope = $qnaAction === 'mine'
    || (isset($_GET['scope']) && $_GET['scope'] === 'mine');

// ----- GET/PATCH/DELETE /v1/shop/reviews/qna/{iq_id} or ?iq_id=XXX -----
if ($qnaAction !== '' && preg_match('/^\d+$/', (string) $qnaAction)) {
    if (!in_array($apiMethod, ['GET', 'PATCH', 'DELETE'], true)) {
        Response::error('Method not allowed.', 405);
    }

    $member = Auth::requireAuth();
    $iqId = (int) $qnaAction;
    $qnaTable = DB::table('g5_shop_item_qa_table');
    $itemTable = DB::table('g5_shop_item_table');

    $qna = DB::fetch(
        "SELECT q.iq_id, q.it_id, q.mb_id, q.iq_subject, q.iq_question, q.iq_answer,
                q.iq_name, q.iq_email, q.iq_hp, q.iq_time, q.iq_secret,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM {$qnaTable} q
         LEFT JOIN {$itemTable} i ON i.it_id = q.it_id
         WHERE q.iq_id = ? AND q.mb_id = ? LIMIT 1",
        [$iqId, $member['mb_id']]
    );
    if (!$qna) {
        Response::error('Product Q&A not found.', 404);
    }

    if ($apiMethod === 'GET') {
        Response::success(shop_api_format_my_qna_row($qna));
    }

    if (trim((string) ($qna['iq_answer'] ?? '')) !== '') {
        Response::error('Answered product Q&A cannot be changed.', 409);
    }

    if ($apiMethod === 'DELETE') {
        shop_api_delete_qna_editor_thumbnails($qna['iq_question'] ?? '');
        shop_api_delete_qna_editor_thumbnails($qna['iq_answer'] ?? '');

        DB::execute(
            "DELETE FROM {$qnaTable}
             WHERE iq_id = ? AND mb_id = ?",
            [$iqId, $member['mb_id']]
        );
        if (function_exists('run_event')) {
            run_event('shop_item_qa_deleted', $iqId, (string) ($qna['it_id'] ?? ''));
        }
        Response::success([
            'deleted' => true,
            'iq_id' => $iqId,
        ]);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $iq_subject = isset($input['iq_subject']) ? shop_api_clean_plain_text($input['iq_subject']) : '';
    $iq_question = isset($input['iq_question']) ? shop_api_clean_qna_question($input['iq_question']) : '';
    $iq_secret = !empty($input['iq_secret']) ? 1 : 0;
    $iq_email = array_key_exists('iq_email', (array) $input)
        ? shop_api_clean_qna_contact($input['iq_email'])
        : (string) ($qna['iq_email'] ?? '');
    $iq_hp = array_key_exists('iq_hp', (array) $input)
        ? shop_api_clean_qna_contact($input['iq_hp'])
        : (string) ($qna['iq_hp'] ?? '');

    $errors = [];
    if ($iq_subject === '') {
        $errors['iq_subject'] = 'iq_subject is required.';
    }
    if ($iq_question === '') {
        $errors['iq_question'] = 'iq_question is required.';
    }
    if (!empty($errors)) {
        Response::error('Validation failed.', 422, $errors);
    }

    DB::execute(
        "UPDATE {$qnaTable}
         SET iq_subject = ?,
             iq_question = ?,
             iq_secret = ?,
             iq_email = ?,
             iq_hp = ?
         WHERE iq_id = ? AND mb_id = ?",
        [$iq_subject, $iq_question, $iq_secret, $iq_email, $iq_hp, $iqId, $member['mb_id']]
    );
    if (function_exists('run_event')) {
        run_event('shop_item_qa_updated', $iqId, (string) ($qna['it_id'] ?? ''));
    }

    $updated = DB::fetch(
        "SELECT q.iq_id, q.it_id, q.mb_id, q.iq_subject, q.iq_question, q.iq_answer,
                q.iq_name, q.iq_email, q.iq_hp, q.iq_time, q.iq_secret,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM {$qnaTable} q
         LEFT JOIN {$itemTable} i ON i.it_id = q.it_id
         WHERE q.iq_id = ? AND q.mb_id = ? LIMIT 1",
        [$iqId, $member['mb_id']]
    );

    Response::success(shop_api_format_my_qna_row($updated));
}

// ----- GET /v1/shop/reviews/qna/mine or ?scope=mine - List my product Q&A -----
if ($apiMethod === 'GET' && $isMineScope) {
    $member = Auth::requireAuth();

    $page    = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = max(1, min(100, (int) ($_GET['per_page'] ?? 10)));
    $offset  = ($page - 1) * $perPage;
    $status  = trim((string) ($_GET['status'] ?? ''));
    $q       = trim((string) ($_GET['q'] ?? ''));

    $qnaTable = DB::table('g5_shop_item_qa_table');
    $itemTable = DB::table('g5_shop_item_table');
    $where = ['q.mb_id = ?'];
    $params = [$member['mb_id']];

    if ($status === 'answered') {
        $where[] = "q.iq_answer <> ''";
    } elseif ($status === 'unanswered') {
        $where[] = "(q.iq_answer IS NULL OR q.iq_answer = '')";
    }

    if ($q !== '') {
        $where[] = "(q.iq_subject LIKE ? OR q.iq_question LIKE ? OR q.iq_answer LIKE ? OR i.it_name LIKE ?)";
        $like = '%' . $q . '%';
        array_push($params, $like, $like, $like, $like);
    }

    $whereSql = implode(' AND ', $where);
    $total = DB::count(
        "SELECT COUNT(*)
         FROM {$qnaTable} q
         LEFT JOIN {$itemTable} i ON i.it_id = q.it_id
         WHERE {$whereSql}",
        $params
    );

    $rows = DB::fetchAll(
        "SELECT q.iq_id, q.it_id, q.mb_id, q.iq_subject, q.iq_question, q.iq_answer,
                q.iq_name, q.iq_email, q.iq_hp, q.iq_time, q.iq_secret,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM {$qnaTable} q
         LEFT JOIN {$itemTable} i ON i.it_id = q.it_id
         WHERE {$whereSql}
         ORDER BY q.iq_id DESC
         LIMIT ?, ?",
        array_merge($params, [$offset, $perPage])
    );

    $qnaList = [];
    foreach ($rows as $row) {
        $qnaList[] = shop_api_format_my_qna_row($row);
    }

    Response::paginated($qnaList, $total, $page, $perPage);
}

// ----- GET /v1/shop/reviews/qna?it_id=XXX - List product Q&A, or all public Q&A if it_id is omitted -----
if ($apiMethod === 'GET' && $qnaAction === '') {

    $it_id = isset($_GET['it_id']) ? trim($_GET['it_id']) : '';
    $page    = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = max(1, min(100, (int) ($_GET['per_page'] ?? 20)));
    $offset  = ($page - 1) * $perPage;
    $viewer  = Auth::getUser();
    $viewerId = !empty($viewer['mb_id']) ? (string) $viewer['mb_id'] : '';
    $isAdmin = $viewer && Auth::adminRole($viewer) === 'super';
    $q       = trim((string) ($_GET['q'] ?? ($_GET['stx'] ?? '')));
    $sfl     = trim((string) ($_GET['sfl'] ?? ''));
    $sst     = trim((string) ($_GET['sst'] ?? 'q.iq_id'));
    $sod     = strtolower(trim((string) ($_GET['sod'] ?? 'desc')));

    $qnaTable = DB::table('g5_shop_item_qa_table');
    $itemTable = DB::table('g5_shop_item_table');
    $where = [];
    $params = [];
    if ($it_id !== '') {
        $where[] = 'q.it_id = ?';
        $params[] = $it_id;
    }
    if ($q !== '') {
        $allowedSearchFields = [
            'i.it_name' => 'i.it_name',
            'q.it_id' => 'q.it_id',
            'q.iq_subject' => 'q.iq_subject',
            'q.iq_question' => 'q.iq_question',
            'q.iq_name' => 'q.iq_name',
            'q.mb_id' => 'q.mb_id',
        ];
        $field = $allowedSearchFields[$sfl] ?? '';
        if ($field === '') {
            $where[] = "(i.it_name LIKE ? OR q.iq_subject LIKE ? OR q.iq_question LIKE ? OR q.iq_name LIKE ? OR q.it_id LIKE ?)";
            $like = '%' . $q . '%';
            array_push($params, $like, $like, $like, $like, $like);
        } elseif ($field === 'q.it_id') {
            $where[] = "{$field} LIKE ?";
            $params[] = $q . '%';
        } elseif ($field === 'q.iq_name' || $field === 'q.mb_id') {
            $where[] = "{$field} = ?";
            $params[] = $q;
        } else {
            $where[] = "{$field} LIKE ?";
            $params[] = '%' . $q . '%';
        }
    }
    $whereSql = $where ? implode(' AND ', $where) : '1';
    $allowedSortFields = [
        'q.iq_id' => 'q.iq_id',
        'q.iq_time' => 'q.iq_time',
        'q.iq_datetime' => 'q.iq_time',
        'q.it_id' => 'q.it_id',
        'i.it_name' => 'i.it_name',
    ];
    $sortField = $allowedSortFields[$sst] ?? 'q.iq_id';
    $sortDirection = in_array($sod, ['asc', 'desc'], true) ? $sod : 'desc';

    $total = DB::count(
        "SELECT COUNT(*)
         FROM {$qnaTable} q
         LEFT JOIN {$itemTable} i ON i.it_id = q.it_id
         WHERE {$whereSql}",
        $params
    );

    $rows = DB::fetchAll(
        "SELECT q.iq_id, q.it_id, q.mb_id, q.iq_subject, q.iq_question, q.iq_answer,
                q.iq_name, q.iq_email, q.iq_hp, q.iq_time, q.iq_secret,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM {$qnaTable} q
         LEFT JOIN {$itemTable} i ON i.it_id = q.it_id
         WHERE {$whereSql}
         ORDER BY {$sortField} {$sortDirection}
         LIMIT ?, ?",
        array_merge($params, [$offset, $perPage])
    );

    $qnaList = [];
    foreach ($rows as $row) {
        $isSecret = (int) ($row['iq_secret'] ?? 0) === 1;
        $isOwner = $viewerId !== '' && $viewerId === (string) $row['mb_id'];
        $isAnswered = trim((string) ($row['iq_answer'] ?? '')) !== '';
        $canView = !$isSecret || $isOwner || $isAdmin;
        $canMutate = $isOwner && !$isAnswered;
        $qnaList[] = [
            'iq_id'       => $row['iq_id'],
            'it_id'       => $row['it_id'],
            'it_name'     => $row['it_name'] ?? '',
            'it_seo_title' => $row['it_seo_title'] ?? '',
            'ca_id'       => $row['ca_id'] ?? '',
            'it_price'    => (int) ($row['it_price'] ?? 0),
            'mb_id'       => $canView ? $row['mb_id'] : '',
            'iq_subject'  => $canView ? $row['iq_subject'] : '비밀글입니다.',
            'iq_question' => $canView ? $row['iq_question'] : '',
            'iq_answer'   => $canView ? $row['iq_answer'] : '',
            'iq_secret'   => (int) ($row['iq_secret'] ?? 0),
            'iq_email'    => ($isOwner || $isAdmin) ? ($row['iq_email'] ?? '') : '',
            'iq_hp'       => ($isOwner || $isAdmin) ? ($row['iq_hp'] ?? '') : '',
            'is_answered' => $isAnswered,
            'can_view'    => $canView,
            'can_edit'    => $canMutate,
            'can_delete'  => $canMutate,
            'iq_name'     => $canView ? $row['iq_name'] : '비공개',
            'iq_time'     => $row['iq_time'],
            'mb_nick'     => $canView ? $row['iq_name'] : '비공개',
            'product_image_url' => shop_api_item_image_url($row['it_id'] ?? '', $row['it_img1'] ?? ''),
        ];
    }

    Response::paginated($qnaList, $total, $page, $perPage);
}

// ----- POST /v1/shop/reviews/qna - Ask a question -----
if ($apiMethod === 'POST' && $qnaAction === '') {

    $member = Auth::requireAuth();

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $it_id      = isset($input['it_id']) ? trim($input['it_id']) : '';
    $iq_subject = isset($input['iq_subject']) ? shop_api_clean_plain_text($input['iq_subject']) : '';
    $iq_question = isset($input['iq_question']) ? shop_api_clean_qna_question($input['iq_question']) : '';

    $errors = [];
    if (!$it_id) {
        $errors['it_id'] = 'it_id is required.';
    }
    if (!$iq_subject) {
        $errors['iq_subject'] = 'iq_subject is required.';
    }
    if (!$iq_question) {
        $errors['iq_question'] = 'iq_question is required.';
    }
    if (!empty($errors)) {
        Response::error('Validation failed.', 422, $errors);
    }

    $item = DB::fetch(
        "SELECT it_id FROM " . DB::table('g5_shop_item_table') . "
         WHERE it_id = ? AND it_use = '1' LIMIT 1",
        [$it_id]
    );
    if (!$item) {
        Response::error('Product not found.', 404);
    }

    $iq_secret = !empty($input['iq_secret']) ? 1 : 0;
    $iq_email = array_key_exists('iq_email', (array) $input)
        ? shop_api_clean_qna_contact($input['iq_email'])
        : shop_api_clean_qna_contact($member['mb_email'] ?? '');
    $iq_hp = array_key_exists('iq_hp', (array) $input)
        ? shop_api_clean_qna_contact($input['iq_hp'])
        : shop_api_clean_qna_contact($member['mb_hp'] ?? '');
    $iq_name = trim(strip_tags((string) ($member['mb_name'] ?? '')));
    if ($iq_name === '') {
        $iq_name = trim(strip_tags((string) ($member['mb_nick'] ?? $member['mb_id'])));
    }

    DB::execute(
        "INSERT INTO " . DB::table('g5_shop_item_qa_table') . " SET
            it_id       = ?,
            mb_id       = ?,
            iq_subject  = ?,
            iq_question = ?,
            iq_answer   = '',
            iq_secret   = ?,
            iq_name     = ?,
            iq_email    = ?,
            iq_hp       = ?,
            iq_password = ?,
            iq_time     = ?,
            iq_ip       = ?",
        [
            $it_id, $member['mb_id'], $iq_subject, $iq_question,
            $iq_secret, $iq_name, $iq_email, $iq_hp, (string) ($member['mb_password'] ?? ''),
            defined('G5_TIME_YMDHIS') ? G5_TIME_YMDHIS : date('Y-m-d H:i:s'),
            $_SERVER['REMOTE_ADDR'] ?? '',
        ]
    );

    $newId = DB::lastInsertId();
    if (function_exists('run_event')) {
        run_event('shop_item_qa_created', $newId, $it_id);
    }
    $newQa = DB::fetch(
        "SELECT q.iq_id, q.it_id, q.mb_id, q.iq_subject, q.iq_question, q.iq_answer,
                q.iq_name, q.iq_email, q.iq_hp, q.iq_time, q.iq_secret,
                i.it_name, i.ca_id, i.it_price, i.it_img1, i.it_seo_title
         FROM " . DB::table('g5_shop_item_qa_table') . " q
         LEFT JOIN " . DB::table('g5_shop_item_table') . " i ON i.it_id = q.it_id
         WHERE q.iq_id = ? LIMIT 1",
        [$newId]
    );

    Response::success(shop_api_format_my_qna_row($newQa), 201);
}

Response::error('Method not allowed.', 405);

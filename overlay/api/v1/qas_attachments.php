<?php
/**
 * Q&A attachment helpers.
 */

if (!defined('_GNUBOARD_')) exit;

function api_qa_file_url($file)
{
    $file = trim((string) $file);
    if ($file === '') {
        return '';
    }

    return G5_DATA_URL . '/qa/' . rawurlencode($file);
}

function api_qa_delete_files($row)
{
    for ($i = 1; $i <= 2; $i++) {
        $file = isset($row['qa_file' . $i]) ? (string) $row['qa_file' . $i] : '';
        if ($file === '') {
            continue;
        }

        $safeFile = function_exists('clean_relative_paths') ? clean_relative_paths($file) : basename($file);
        @unlink(G5_DATA_PATH . '/qa/' . $safeFile);

        if (function_exists('delete_qa_thumbnail')) {
            delete_qa_thumbnail($safeFile);
        }
    }

    if (function_exists('delete_editor_thumbnail') && !empty($row['qa_content'])) {
        delete_editor_thumbnail($row['qa_content']);
    }
}

function api_qa_delete_file_slot($row, $slot)
{
    $slot = (int) $slot;
    if ($slot < 1 || $slot > 2) {
        return;
    }

    $file = isset($row['qa_file' . $slot]) ? (string) $row['qa_file' . $slot] : '';
    if ($file === '') {
        return;
    }

    $safeFile = function_exists('clean_relative_paths') ? clean_relative_paths($file) : basename($file);
    @unlink(G5_DATA_PATH . '/qa/' . $safeFile);
    if (function_exists('delete_qa_thumbnail')) {
        delete_qa_thumbnail($safeFile);
    }
}

function api_qa_normalize_upload_files()
{
    if (empty($_FILES['bf_file']) || !isset($_FILES['bf_file']['name'])) {
        return [];
    }

    $entry = $_FILES['bf_file'];
    $names = (array) $entry['name'];
    $files = [];
    $rawCount = 0;
    foreach ($names as $slot => $name) {
        if ($name) {
            $rawCount++;
        }
        $slot = (int) $slot;
        if ($slot < 1 || $slot > 2 || !$name) {
            continue;
        }

        $files[$slot] = [
            'name' => $name,
            'type' => isset($entry['type'][$slot]) ? $entry['type'][$slot] : '',
            'tmp_name' => isset($entry['tmp_name'][$slot]) ? $entry['tmp_name'][$slot] : '',
            'error' => isset($entry['error'][$slot]) ? (int) $entry['error'][$slot] : UPLOAD_ERR_NO_FILE,
            'size' => isset($entry['size'][$slot]) ? (int) $entry['size'][$slot] : 0,
        ];
    }

    if ($rawCount > 2 || count($files) > 2) {
        Response::error('Only up to two Q&A attachments are allowed.', 422);
    }

    return $files;
}

function api_qa_file_delete_requested($slot)
{
    $slot = (int) $slot;
    $input = isset($_POST['bf_file_del']) ? $_POST['bf_file_del'] : [];
    if (is_array($input) && !empty($input[$slot])) {
        return true;
    }

    return !empty($_POST['bf_file_del' . $slot]) || !empty($_POST['qa_file_del' . $slot]);
}

function api_qa_save_uploaded_file($file, $qaConfig, $isAdmin)
{
    global $config;

    $uploadMaxFilesize = ini_get('upload_max_filesize');
    $filename = function_exists('get_safe_filename')
        ? get_safe_filename($file['name'])
        : basename($file['name']);

    if ($file['error'] === UPLOAD_ERR_INI_SIZE) {
        Response::error('Attachment exceeds server upload_max_filesize (' . $uploadMaxFilesize . ').', 422);
    }
    if ($file['error'] !== UPLOAD_ERR_OK) {
        Response::error('Attachment upload failed.', 400);
    }
    if (!is_uploaded_file($file['tmp_name'])) {
        Response::error('Invalid uploaded attachment.', 400);
    }

    $maxSize = (int) ($qaConfig['qa_upload_size'] ?? 0);
    if (!$isAdmin && $maxSize > 0 && (int) $file['size'] > $maxSize) {
        Response::error('Attachment exceeds the configured Q&A upload size.', 422);
    }

    $imageExt = isset($config['cf_image_extension']) ? (string) $config['cf_image_extension'] : 'gif|jpg|jpeg|png|webp';
    $flashExt = isset($config['cf_flash_extension']) ? (string) $config['cf_flash_extension'] : '';
    if (preg_match("/\.({$imageExt})$/i", $filename) || ($flashExt && preg_match("/\.({$flashExt})$/i", $filename))) {
        $imageInfo = @getimagesize($file['tmp_name']);
        if (!$imageInfo || $imageInfo[2] < 1 || $imageInfo[2] > 18) {
            Response::error('Invalid image attachment.', 422);
        }
    }

    @mkdir(G5_DATA_PATH . '/qa', defined('G5_DIR_PERMISSION') ? G5_DIR_PERMISSION : 0755, true);
    @chmod(G5_DATA_PATH . '/qa', defined('G5_DIR_PERMISSION') ? G5_DIR_PERMISSION : 0755);

    $source = $filename;
    $storedBase = preg_replace(
        "/\.(php|pht|phtm|htm|shtml|shtm|cgi|pl|exe|jsp|asp|inc|phar|svg|svgz)/i",
        "$0-x",
        $filename
    );
    $storedBase = function_exists('replace_filename')
        ? replace_filename($storedBase)
        : preg_replace('/[^A-Za-z0-9._-]/', '_', $storedBase);

    $chars = array_merge(range(0, 9), range('a', 'z'), range('A', 'Z'));
    shuffle($chars);
    $shuffle = implode('', $chars);
    $ipHash = md5(sha1(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : ''));
    $stored = $ipHash . '_' . substr($shuffle, 0, 8) . '_' . $storedBase;
    $dest = G5_DATA_PATH . '/qa/' . $stored;

    if (!@move_uploaded_file($file['tmp_name'], $dest)) {
        Response::error('Failed to save Q&A attachment.', 500);
    }
    if (defined('G5_FILE_PERMISSION')) {
        @chmod($dest, G5_FILE_PERMISSION);
    }

    return [
        'file' => $stored,
        'source' => $source,
    ];
}

function api_qa_process_attachments($existingRow, $qaConfig, $isAdmin)
{
    $result = [
        1 => [
            'file' => isset($existingRow['qa_file1']) ? (string) $existingRow['qa_file1'] : '',
            'source' => isset($existingRow['qa_source1']) ? (string) $existingRow['qa_source1'] : '',
        ],
        2 => [
            'file' => isset($existingRow['qa_file2']) ? (string) $existingRow['qa_file2'] : '',
            'source' => isset($existingRow['qa_source2']) ? (string) $existingRow['qa_source2'] : '',
        ],
    ];

    $files = api_qa_normalize_upload_files();
    for ($slot = 1; $slot <= 2; $slot++) {
        if (api_qa_file_delete_requested($slot)) {
            if ($existingRow) {
                api_qa_delete_file_slot($existingRow, $slot);
            }
            $result[$slot] = ['file' => '', 'source' => ''];
        }

        if (isset($files[$slot])) {
            if ($existingRow) {
                api_qa_delete_file_slot($existingRow, $slot);
            }
            $result[$slot] = api_qa_save_uploaded_file($files[$slot], $qaConfig, $isAdmin);
        }
    }

    return [
        'qa_file1' => $result[1]['file'],
        'qa_source1' => $result[1]['source'],
        'qa_file2' => $result[2]['file'],
        'qa_source2' => $result[2]['source'],
    ];
}

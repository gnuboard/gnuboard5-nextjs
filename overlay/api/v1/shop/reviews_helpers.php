<?php
/**
 * Shop review and product Q&A helpers.
 */

if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_format_my_review_row')) {
    function shop_api_format_my_review_row(array $row): array
    {
        return [
            'is_id'             => $row['is_id'],
            'it_id'             => $row['it_id'],
            'it_name'           => $row['it_name'] ?? '',
            'it_seo_title'      => $row['it_seo_title'] ?? '',
            'ca_id'             => $row['ca_id'] ?? '',
            'it_price'          => (int) ($row['it_price'] ?? 0),
            'mb_id'             => $row['mb_id'],
            'is_subject'        => $row['is_subject'],
            'is_content'        => $row['is_content'],
            'is_score'          => (int) ($row['is_score'] ?? 0),
            'is_name'           => $row['is_name'],
            'is_confirm'        => (string) ($row['is_confirm'] ?? '0'),
            'is_time'           => $row['is_time'],
            'mb_nick'           => $row['is_name'],
            'product_image_url' => api_image_url_with_width(shop_api_item_image_url($row['it_id'] ?? '', $row['it_img1'] ?? ''), 400),
        ];
    }
}

if (!function_exists('shop_api_format_my_qna_row')) {
    function shop_api_format_my_qna_row(array $row): array
    {
        $isAnswered = trim((string) ($row['iq_answer'] ?? '')) !== '';

        return [
            'iq_id'             => $row['iq_id'],
            'it_id'             => $row['it_id'],
            'it_name'           => $row['it_name'] ?? '',
            'it_seo_title'      => $row['it_seo_title'] ?? '',
            'ca_id'             => $row['ca_id'] ?? '',
            'it_price'          => (int) ($row['it_price'] ?? 0),
            'mb_id'             => $row['mb_id'],
            'iq_subject'        => $row['iq_subject'],
            'iq_question'       => $row['iq_question'],
            'iq_answer'         => $row['iq_answer'],
            'iq_secret'         => (int) ($row['iq_secret'] ?? 0),
            'iq_email'          => $row['iq_email'] ?? '',
            'iq_hp'             => $row['iq_hp'] ?? '',
            'is_answered'       => $isAnswered,
            'can_view'          => true,
            'can_edit'          => !$isAnswered,
            'can_delete'        => !$isAnswered,
            'iq_name'           => $row['iq_name'],
            'iq_time'           => $row['iq_time'],
            'mb_nick'           => $row['iq_name'],
            'product_image_url' => api_image_url_with_width(shop_api_item_image_url($row['it_id'] ?? '', $row['it_img1'] ?? ''), 400),
        ];
    }
}

if (!function_exists('shop_api_review_reply_columns')) {
    /**
     * 후기 표에 있는 관리자 답변 칸(is_reply_subject · is_reply_content · is_reply_name). 새 설치 SQL 에는 셋 다
     * 있지만 예전 영카트에서 올라온 DB 에는 없을 수 있다 — 원본 화면은 SELECT * 라 빈 값으로 넘어간다.
     * @return string[]
     */
    function shop_api_review_reply_columns(): array
    {
        static $columns = null;
        if ($columns === null) {
            try {
                $found = array_map(static function (array $row): string {
                    return strtolower((string) ($row['c'] ?? ''));
                }, DB::fetchAll(
                    "SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
                      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    [DB::table('g5_shop_item_use_table')]
                ));
            } catch (Throwable $e) {
                $found = []; // 표 정보를 못 읽으면 답변 없이 — 목록 · 쓰기는 그대로 된다
            }
            $columns = array_values(array_intersect(['is_reply_subject', 'is_reply_content', 'is_reply_name'], $found));
        }
        return $columns;
    }
}

if (!function_exists('shop_api_review_reply_select')) {
    /** 후기 SELECT 의 답변 칸 — 표에 없는 칸은 빈 문자열로 읽는다. */
    function shop_api_review_reply_select(string $alias, array $existing): string
    {
        $parts = [];
        foreach (['is_reply_subject', 'is_reply_content', 'is_reply_name'] as $column) {
            $parts[] = in_array($column, $existing, true) ? "{$alias}.{$column}" : "'' AS {$column}";
        }
        return implode(', ', $parts);
    }
}

if (!function_exists('shop_api_review_author_name')) {
    function shop_api_review_author_name(array $member): string
    {
        $name = trim(strip_tags((string) ($member['mb_name'] ?? '')));
        if ($name !== '') {
            return $name;
        }

        $name = trim(strip_tags((string) ($member['mb_nick'] ?? '')));
        if ($name !== '') {
            return $name;
        }

        return trim(strip_tags((string) ($member['mb_id'] ?? '')));
    }
}

if (!function_exists('shop_api_clean_plain_text')) {
    function shop_api_clean_plain_text($value): string
    {
        return trim(strip_tags((string) $value));
    }
}

if (!function_exists('shop_api_clean_user_html')) {
    function shop_api_clean_user_html($value): string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return '';
        }

        $blockedTags = 'script|style|iframe|object|embed|svg|math|meta|link|base';
        $value = preg_replace("#<\s*({$blockedTags})\b[^>]*>.*?<\s*/\s*\\1\s*>#is", '', $value);
        $value = preg_replace("#<\s*/?\s*({$blockedTags})\b[^>]*>#is", '', $value);
        $value = preg_replace('/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $value);
        $value = preg_replace('/\s+style\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $value);
        $value = preg_replace('/\s+(href|src|srcset|xlink:href|formaction|action)\s*=\s*(?:"\s*(?:javascript|vbscript|data|file):[^"]*"|\'\s*(?:javascript|vbscript|data|file):[^\']*\'|(?:javascript|vbscript|data|file):[^\s>]+)/i', '', $value);

        return trim($value);
    }
}

if (!function_exists('shop_api_clean_review_content')) {
    function shop_api_clean_review_content($value): string
    {
        return shop_api_clean_user_html($value);
    }
}

if (!function_exists('shop_api_normalize_review_score')) {
    function shop_api_normalize_review_score($value): int
    {
        $score = (int) $value;
        return ($score > 5 || $score < 1) ? 1 : $score;
    }
}

if (!function_exists('shop_api_clean_qna_contact')) {
    function shop_api_clean_qna_contact($value): string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return '';
        }

        if (function_exists('clean_xss_tags')) {
            return clean_xss_tags(stripslashes($value), 1, 1);
        }

        return strip_tags($value);
    }
}

if (!function_exists('shop_api_clean_qna_question')) {
    function shop_api_clean_qna_question($value): string
    {
        return shop_api_clean_user_html($value);
    }
}

if (!function_exists('shop_api_delete_editor_thumbnails')) {
    function shop_api_delete_editor_thumbnails($contents): void
    {
        $contents = (string) $contents;
        if ($contents === '' || !defined('G5_PATH')) {
            return;
        }

        if (!function_exists('get_editor_image')) {
            return;
        }
        if (!function_exists('delete_item_thumbnail') && defined('G5_LIB_PATH') && is_file(G5_LIB_PATH . '/shop.lib.php')) {
            require_once G5_LIB_PATH . '/shop.lib.php';
        }
        if (!function_exists('delete_item_thumbnail')) {
            return;
        }

        $images = get_editor_image($contents, false);
        if (!isset($images[1]) || !is_array($images[1])) {
            return;
        }

        foreach ($images[1] as $src) {
            $path = parse_url((string) $src, PHP_URL_PATH);
            if (!is_string($path) || $path === '') {
                continue;
            }

            if (strpos($path, '/data/') !== 0) {
                $path = preg_replace('#^/.*/data#', '/data', $path);
            }
            if (!is_string($path) || !preg_match('#^/data/editor/[A-Za-z0-9_]{1,20}/[^/]+\.(gif|jpe?g|bmp|png|webp)$#i', $path)) {
                continue;
            }
            if (strpos($path, '..') !== false) {
                continue;
            }

            $file = str_replace('/', DIRECTORY_SEPARATOR, G5_PATH . $path);
            if (is_file($file)) {
                delete_item_thumbnail(dirname($file), basename($file));
            }
        }
    }
}

if (!function_exists('shop_api_delete_qna_editor_thumbnails')) {
    function shop_api_delete_qna_editor_thumbnails($contents): void
    {
        shop_api_delete_editor_thumbnails($contents);
    }
}

if (!function_exists('shop_api_refresh_review_stats')) {
    function shop_api_refresh_review_stats(string $itId): void
    {
        $stats = DB::fetch(
            "SELECT COUNT(*) AS cnt, IFNULL(SUM(is_score), 0) AS total
             FROM " . DB::table('g5_shop_item_use_table') . "
             WHERE it_id = ? AND is_confirm = '1'",
            [$itId]
        ) ?: [];

        $count = (int) ($stats['cnt'] ?? 0);
        $average = $count > 0 ? ((int) ($stats['total'] ?? 0)) / $count : 0;

        DB::execute(
            "UPDATE " . DB::table('g5_shop_item_table') . "
             SET it_use_cnt = ?, it_use_avg = ?
             WHERE it_id = ?",
            [$count, $average, $itId]
        );
    }
}

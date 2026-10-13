<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

function handbook_metadata_url_parts_path($parts)
{
    $path = isset($parts['path']) && $parts['path'] !== '' ? $parts['path'] : '/';
    $query = isset($parts['query']) && $parts['query'] !== '' ? '?' . $parts['query'] : '';
    $fragment = isset($parts['fragment']) && $parts['fragment'] !== '' ? '#' . $parts['fragment'] : '';

    return $path . $query . $fragment;
}

function handbook_is_rewritable_metadata_host($host)
{
    $host = strtolower(trim((string) $host, '[]'));
    if ($host === '') {
        return false;
    }

    $current_host = parse_url(handbook_g5_url(), PHP_URL_HOST);
    if ($current_host && $host === strtolower($current_host)) {
        return true;
    }

    if ($host === 'localhost' || $host === '::1' || strpos($host, '127.') === 0) {
        return true;
    }

    return (bool) preg_match('#^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)#', $host);
}

function handbook_is_local_metadata_url_path($path)
{
    $path = handbook_normalize_route_path($path);

    $exact_paths = array(
        '/',
        '/favicon.ico',
        '/manifest.json',
        '/manifest.webmanifest',
        '/og-default.png',
        '/robots.txt',
        '/sitemap.xml',
        '/sitemap-posts.xml',
        '/sw.js',
    );

    if (in_array($path, $exact_paths, true) || preg_match('#^/icon-[0-9]+\.png$#', $path)) {
        return true;
    }

    $prefixes = array(
        '/admin',
        '/boards',
        '/content',
        '/faq',
        '/forgot-password',
        '/login',
        '/members',
        '/mypage',
        '/polls',
        '/recent',
        '/register',
        '/rss',
        '/search',
        '/shop',
    );

    foreach ($prefixes as $prefix) {
        if ($path === $prefix || strpos($path, $prefix . '/') === 0) {
            return true;
        }
    }

    return (bool) preg_match('#^/[0-9A-Za-z_]+(?:/[^/]+)?$#', $path);
}

function handbook_rewrite_same_site_metadata_url($value)
{
    $value = (string) $value;
    $parts = parse_url(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8'));

    if (empty($parts['scheme']) || empty($parts['host'])) {
        return $value;
    }

    $scheme = strtolower($parts['scheme']);
    if (($scheme !== 'http' && $scheme !== 'https') || !handbook_is_rewritable_metadata_host($parts['host'])) {
        return $value;
    }

    $path = isset($parts['path']) && $parts['path'] !== '' ? $parts['path'] : '/';
    if (!handbook_is_local_metadata_url_path($path)) {
        return $value;
    }

    $short_path = handbook_short_path(handbook_metadata_url_parts_path($parts));

    return handbook_g5_url() . ($short_path === '/' ? '' : $short_path);
}

function handbook_rewrite_structured_data_urls($value)
{
    if (is_array($value)) {
        foreach ($value as $key => $item) {
            if ($key === 'sameAs') {
                continue;
            }
            $value[$key] = handbook_rewrite_structured_data_urls($item);
        }

        return $value;
    }

    if (is_string($value)) {
        return handbook_rewrite_same_site_metadata_url($value);
    }

    return $value;
}

function handbook_rewrite_json_ld_metadata_urls($html)
{
    return preg_replace_callback(
        '#(<script\b(?=[^>]*\btype=["\']application/ld\+json["\'])[^>]*>)(.*?)(</script>)#is',
        function ($match) {
            $payload = trim($match[2]);
            if ($payload === '') {
                return $match[0];
            }

            $data = json_decode($payload, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $data = json_decode(html_entity_decode($payload, ENT_QUOTES | ENT_HTML5, 'UTF-8'), true);
            }

            if (json_last_error() !== JSON_ERROR_NONE) {
                return $match[0];
            }

            return $match[1] . handbook_json(handbook_rewrite_structured_data_urls($data)) . $match[3];
        },
        $html
    );
}

function handbook_sql_escape_value($value)
{
    if (function_exists('sql_real_escape_string')) {
        $escaped = sql_real_escape_string((string) $value);
        return is_string($escaped) ? $escaped : null;
    }

    if (function_exists('sql_escape_string')) {
        $escaped = sql_escape_string((string) $value);
        return is_string($escaped) ? $escaped : null;
    }

    return null;
}

function handbook_plain_metadata_text($value, $fallback = '', $limit = 160)
{
    $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags((string) $value), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    if ($text === '') {
        $text = trim((string) $fallback);
    }

    if ($limit > 0) {
        if (function_exists('mb_substr')) {
            $text = mb_substr($text, 0, $limit, 'UTF-8');
        } else {
            $text = substr($text, 0, $limit);
        }
    }

    return $text;
}

function handbook_static_route_relative_path()
{
    $path = handbook_normalize_static_route_path();
    if (substr($path, -4) === '.txt') {
        $path = substr($path, 0, -4);
        $path = $path !== '' ? $path : '/';
    }

    return trim($path, '/');
}

function handbook_should_apply_runtime_detail_metadata($html_path)
{
    $html_path = str_replace('\\', '/', (string) $html_path);

    return $html_path !== '' && strpos($html_path, '/__g5_static__') !== false;
}

function handbook_current_board_post_route_params()
{
    $relative = handbook_static_route_relative_path();
    $match = array();

    if (preg_match('#^boards/([0-9A-Za-z_]+)/([^/]+)$#', $relative, $match)) {
        return array($match[1], rawurldecode($match[2]));
    }

    if (
        preg_match('#^([0-9A-Za-z_]+)/([^/]+)$#', $relative, $match) &&
        $match[2] !== 'rss' &&
        $match[2] !== 'write' &&
        !preg_match('#^(admin|adm|api|bbs|content|css|data|img|install|js|lib|members|mobile|plugin|shop|theme)$#', $match[1])
    ) {
        return array($match[1], rawurldecode($match[2]));
    }

    return null;
}

function handbook_board_allows_public_runtime_metadata($bo_table)
{
    global $g5;

    if (!function_exists('sql_fetch')) {
        return false;
    }

    $table = isset($g5['board_table']) ? (string) $g5['board_table'] : '';
    if ($table === '') {
        return false;
    }

    $escaped = handbook_sql_escape_value($bo_table);
    if ($escaped === null) {
        return false;
    }

    $board = sql_fetch(
        " select bo_read_level, bo_use_secret from `{$table}` where bo_table = '{$escaped}' limit 1 ",
        false
    );

    if (!is_array($board)) {
        return false;
    }

    if ((int) ($board['bo_read_level'] ?? 1) > 1) {
        return false;
    }

    if ((int) ($board['bo_use_secret'] ?? 0) >= 2) {
        return false;
    }

    return true;
}

function handbook_current_product_route_param()
{
    $relative = handbook_static_route_relative_path();
    $match = array();

    if (preg_match('#^shop/products/([^/]+)$#', $relative, $match)) {
        return rawurldecode($match[1]);
    }

    if (preg_match('#^shop/([^/]+)$#', $relative, $match)) {
        $segment = rawurldecode($match[1]);
        if (preg_match('#^(list-|type-)#i', $segment) || handbook_is_reserved_shop_short_segment($segment)) {
            return null;
        }

        return $segment;
    }

    return null;
}

function handbook_current_content_route_param()
{
    $relative = handbook_static_route_relative_path();
    $match = array();

    if (preg_match('#^content/([^/]+)$#', $relative, $match)) {
        return rawurldecode($match[1]);
    }

    return null;
}

function handbook_product_image_url($image)
{
    $image = trim((string) $image);
    if ($image === '') {
        return '';
    }

    if (preg_match('#^https?://#i', $image)) {
        return $image;
    }

    if (defined('G5_DATA_URL')) {
        return rtrim(G5_DATA_URL, '/') . '/item/' . ltrim($image, '/');
    }

    return handbook_g5_url() . '/data/item/' . ltrim($image, '/');
}

function handbook_fetch_board_runtime_metadata()
{
    global $g5;

    if (!function_exists('sql_fetch')) {
        return null;
    }

    $params = handbook_current_board_post_route_params();
    if (!$params) {
        return null;
    }

    list($bo_table, $wr_id) = $params;
    if (!preg_match('/^[0-9A-Za-z_]+$/', $bo_table) || $wr_id === '') {
        return null;
    }

    if (!handbook_board_allows_public_runtime_metadata($bo_table)) {
        return null;
    }

    $write_prefix = isset($g5['write_prefix']) ? (string) $g5['write_prefix'] : '';
    if ($write_prefix === '') {
        return null;
    }

    $write_table = $write_prefix . $bo_table;
    $escaped_wr_id = handbook_sql_escape_value($wr_id);
    if ($escaped_wr_id === null) {
        return null;
    }

    $where = preg_match('/^[0-9]+$/', $wr_id)
        ? "wr_id = '{$escaped_wr_id}'"
        : "wr_seo_title = '{$escaped_wr_id}'";

    $post = sql_fetch(
        " select wr_id, wr_subject, wr_content, wr_option, wr_datetime from `{$write_table}` where wr_is_comment = 0 and {$where} limit 1 ",
        false
    );

    if (!is_array($post) || empty($post['wr_subject'])) {
        return null;
    }

    if (strpos((string) ($post['wr_option'] ?? ''), 'secret') !== false) {
        return null;
    }

    return array(
        'kind' => 'article',
        'title' => (string) $post['wr_subject'],
        'description' => handbook_plain_metadata_text($post['wr_content'] ?? '', $post['wr_subject']),
        'url' => handbook_current_short_url(),
        'publishedAt' => isset($post['wr_datetime']) ? (string) $post['wr_datetime'] : '',
    );
}

function handbook_fetch_product_runtime_metadata()
{
    global $g5;

    if (!function_exists('sql_fetch')) {
        return null;
    }

    $it_id = handbook_current_product_route_param();
    if ($it_id === null || $it_id === '') {
        return null;
    }

    $table = isset($g5['g5_shop_item_table']) ? (string) $g5['g5_shop_item_table'] : '';
    if ($table === '') {
        return null;
    }

    $escaped = handbook_sql_escape_value($it_id);
    $seo_candidate = function_exists('generate_seo_title') ? generate_seo_title($it_id) : $it_id;
    $escaped_seo = handbook_sql_escape_value($seo_candidate);
    if ($escaped === null || $escaped_seo === null) {
        return null;
    }

    $product = sql_fetch(
        " select it_id, it_name, it_basic, it_explan, it_img1, it_price, it_stock_qty from `{$table}` where it_use = '1' and (it_id = '{$escaped}' or it_seo_title = '{$escaped}' or it_seo_title = '{$escaped_seo}') order by it_id desc limit 1 ",
        false
    );

    if (!is_array($product) || empty($product['it_id']) || empty($product['it_name'])) {
        return null;
    }

    $description = handbook_plain_metadata_text($product['it_basic'] ?? '', $product['it_name']);
    if ($description === (string) $product['it_name']) {
        $description = handbook_plain_metadata_text($product['it_explan'] ?? '', $product['it_name']);
    }

    return array(
        'kind' => 'product',
        'title' => (string) $product['it_name'],
        'description' => $description,
        'url' => handbook_g5_url() . '/shop/' . rawurlencode((string) $product['it_id']),
        'image' => handbook_product_image_url($product['it_img1'] ?? ''),
        'price' => isset($product['it_price']) ? (int) $product['it_price'] : 0,
        'stock' => isset($product['it_stock_qty']) ? (int) $product['it_stock_qty'] : 0,
    );
}

function handbook_fetch_content_runtime_metadata()
{
    global $g5;

    if (!function_exists('sql_fetch')) {
        return null;
    }

    $co_id = handbook_current_content_route_param();
    if ($co_id === null || $co_id === '') {
        return null;
    }

    $table = isset($g5['content_table']) ? (string) $g5['content_table'] : '';
    if ($table === '') {
        return null;
    }

    $escaped = handbook_sql_escape_value($co_id);
    if ($escaped === null) {
        return null;
    }

    $content = sql_fetch(
        " select co_id, co_subject, co_content from `{$table}` where co_id = '{$escaped}' or co_seo_title = '{$escaped}' limit 1 ",
        false
    );

    if (!is_array($content) || empty($content['co_subject'])) {
        return null;
    }

    return array(
        'kind' => 'webpage',
        'title' => (string) $content['co_subject'],
        'description' => handbook_plain_metadata_text($content['co_content'] ?? '', $content['co_subject']),
        'url' => handbook_current_short_url(),
    );
}

function handbook_runtime_detail_metadata()
{
    $product = handbook_fetch_product_runtime_metadata();
    if ($product) {
        return $product;
    }

    $board = handbook_fetch_board_runtime_metadata();
    if ($board) {
        return $board;
    }

    return handbook_fetch_content_runtime_metadata();
}

function handbook_replace_title_tag($html, $title)
{
    $tag = '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>';

    if (preg_match('/<title>.*?<\/title>/is', $html)) {
        return preg_replace('/<title>.*?<\/title>/is', $tag, $html, 1);
    }

    return handbook_insert_before_head_end($html, $tag);
}

function handbook_upsert_meta_tag($html, $attribute, $name, $content)
{
    if ($content === '') {
        return $html;
    }

    $attribute = $attribute === 'property' ? 'property' : 'name';
    $name_pattern = preg_quote($name, '/');
    $escaped = htmlspecialchars((string) $content, ENT_QUOTES, 'UTF-8');
    $tag = '<meta ' . $attribute . '="' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . '" content="' . $escaped . '">';
    $pattern = '/<meta\b(?=[^>]*\b' . $attribute . '=["\']' . $name_pattern . '["\'])[^>]*>/i';

    if (preg_match($pattern, $html)) {
        return preg_replace($pattern, $tag, $html, 1);
    }

    return handbook_insert_before_head_end($html, $tag);
}

function handbook_runtime_metadata_json_ld($metadata)
{
    if (!is_array($metadata) || empty($metadata['kind'])) {
        return null;
    }

    if ($metadata['kind'] === 'article') {
        $payload = array(
            '@context' => 'https://schema.org',
            '@type' => 'Article',
            'headline' => $metadata['title'],
            'description' => $metadata['description'],
            'url' => $metadata['url'],
        );

        if (!empty($metadata['publishedAt'])) {
            $payload['datePublished'] = $metadata['publishedAt'];
        }

        return $payload;
    }

    if ($metadata['kind'] === 'product') {
        $payload = array(
            '@context' => 'https://schema.org',
            '@type' => 'Product',
            'name' => $metadata['title'],
            'description' => $metadata['description'],
            'url' => $metadata['url'],
            'offers' => array(
                '@type' => 'Offer',
                'priceCurrency' => 'KRW',
                'price' => (string) max(0, (int) ($metadata['price'] ?? 0)),
                'availability' => ((int) ($metadata['stock'] ?? 0)) > 0
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
            ),
        );

        if (!empty($metadata['image'])) {
            $payload['image'] = $metadata['image'];
        }

        return $payload;
    }

    if ($metadata['kind'] === 'webpage') {
        return array(
            '@context' => 'https://schema.org',
            '@type' => 'WebPage',
            'name' => $metadata['title'],
            'description' => $metadata['description'],
            'url' => $metadata['url'],
        );
    }

    return null;
}

function handbook_apply_runtime_detail_metadata($html, $metadata)
{
    if (!is_array($metadata) || empty($metadata['title'])) {
        return $html;
    }

    $title = (string) $metadata['title'];
    $description = (string) ($metadata['description'] ?? '');
    $url = (string) ($metadata['url'] ?? handbook_current_short_url());
    $image = (string) ($metadata['image'] ?? '');
    $type = ($metadata['kind'] ?? '') === 'article' ? 'article' : (($metadata['kind'] ?? '') === 'product' ? 'product' : 'website');

    $html = handbook_replace_title_tag($html, $title);
    $html = handbook_upsert_meta_tag($html, 'name', 'description', $description);
    $html = handbook_upsert_meta_tag($html, 'property', 'og:title', $title);
    $html = handbook_upsert_meta_tag($html, 'property', 'og:description', $description);
    $html = handbook_upsert_meta_tag($html, 'property', 'og:type', $type);
    $html = handbook_upsert_meta_tag($html, 'property', 'og:url', $url);
    $html = handbook_upsert_meta_tag($html, 'name', 'twitter:title', $title);
    $html = handbook_upsert_meta_tag($html, 'name', 'twitter:description', $description);
    $html = handbook_upsert_meta_tag($html, 'name', 'twitter:url', $url);

    if ($image !== '') {
        $html = handbook_upsert_meta_tag($html, 'property', 'og:image', $image);
        $html = handbook_upsert_meta_tag($html, 'name', 'twitter:image', $image);
    }

    $json_ld = handbook_runtime_metadata_json_ld($metadata);
    if (
        $json_ld &&
        strpos($html, '"@type":"Article"') === false &&
        strpos($html, '"@type":"Product"') === false &&
        strpos($html, '"@type":"WebPage"') === false
    ) {
        $html = handbook_insert_before_head_end(
            $html,
            '<script type="application/ld+json">' . handbook_json($json_ld) . '</script>'
        );
    }

    return $html;
}

function handbook_insert_before_head_end($html, $tag)
{
    if (stripos($html, '</head>') === false) {
        return $html . "\n" . $tag;
    }

    return preg_replace('/<\/head>/i', $tag . "\n</head>", $html, 1);
}

function handbook_ensure_runtime_metadata_url_tags($html, $url)
{
    if (!preg_match('/<link\b(?=[^>]*\brel=["\']canonical["\'])[^>]*>/i', $html)) {
        $html = handbook_insert_before_head_end($html, '<link rel="canonical" href="' . $url . '">');
    }

    if (!preg_match('/<meta\b(?=[^>]*\bproperty=["\']og:url["\'])[^>]*>/i', $html)) {
        $html = handbook_insert_before_head_end($html, '<meta property="og:url" content="' . $url . '">');
    }

    return $html;
}

function handbook_rewrite_metadata_text_urls($text)
{
    return preg_replace_callback(
        '#https?://[^"\'<>\s\\\\]+#i',
        function ($match) {
            return handbook_rewrite_same_site_metadata_url($match[0]);
        },
        $text
    );
}

function handbook_rewrite_static_payload_metadata_urls($payload)
{
    $payload = handbook_rewrite_metadata_text_urls($payload);
    $current_url = handbook_json_string(handbook_current_payload_public_url());

    $payload = preg_replace_callback(
        '/("rel":"canonical"(?:(?!"rel":).)*?"href":")([^"\\\\]*)(")/s',
        function ($match) use ($current_url) {
            return $match[1] . $current_url . $match[3];
        },
        $payload
    );

    return preg_replace_callback(
        '/("(?:property|name)":"(?:og:url|twitter:url)"(?:(?!"(?:property|name)":).)*?"content":")([^"\\\\]*)(")/s',
        function ($match) use ($current_url) {
            return $match[1] . $current_url . $match[3];
        },
        $payload
    );
}

function handbook_rewrite_runtime_metadata_urls($html, $html_path = '')
{
    $url = htmlspecialchars(handbook_current_short_url(), ENT_QUOTES, 'UTF-8');

    $html = preg_replace_callback(
        '/(<link\b(?=[^>]*\brel=["\']canonical["\'])[^>]*\bhref=["\'])([^"\']*)(["\'][^>]*>)/i',
        function ($match) use ($url) {
            return $match[1] . $url . $match[3];
        },
        $html
    );

    $html = preg_replace_callback(
        '/(<meta\b(?=[^>]*\b(?:property|name)=["\'](?:og:url|twitter:url)["\'])[^>]*\bcontent=["\'])([^"\']*)(["\'][^>]*>)/i',
        function ($match) use ($url) {
            return $match[1] . $url . $match[3];
        },
        $html
    );

    $html = preg_replace_callback(
        '/(<meta\b(?=[^>]*\b(?:property|name)=["\'](?:og:image|og:image:url|twitter:image|twitter:image:src)["\'])[^>]*\bcontent=["\'])([^"\']*)(["\'][^>]*>)/i',
        function ($match) {
            return $match[1]
                . htmlspecialchars(handbook_rewrite_same_site_metadata_url($match[2]), ENT_QUOTES, 'UTF-8')
                . $match[3];
        },
        $html
    );

    $html = handbook_ensure_runtime_metadata_url_tags($html, $url);
    if (handbook_should_apply_runtime_detail_metadata($html_path)) {
        $html = handbook_apply_runtime_detail_metadata($html, handbook_runtime_detail_metadata());
    }

    return handbook_rewrite_json_ld_metadata_urls($html);
}

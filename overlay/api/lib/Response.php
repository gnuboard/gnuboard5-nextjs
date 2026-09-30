<?php
/**
 * Gnuboard5 REST API - JSON Response Helper
 *
 * Standardises every API response into a consistent JSON envelope.
 */

class Response
{
    private static function sendJsonHeaders()
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
        header('Pragma: no-cache');
        header('Expires: 0');
    }

    /**
     * Send a success response and terminate.
     *
     * @param  mixed $data    Payload (array, object, scalar…)
     * @param  int   $status  HTTP status code (default 200)
     */
    public static function success($data = null, $status = 200)
    {
        http_response_code($status);
        self::sendJsonHeaders();

        $body = [
            'success' => true,
            'data'    => $data,
        ];

        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Send an error response and terminate.
     *
     * @param  string     $message  Human-readable error message
     * @param  int        $status   HTTP status code (default 400)
     * @param  array|null $errors   Optional field-level errors
     */
    public static function error($message, $status = 400, $errors = null)
    {
        http_response_code($status);
        self::sendJsonHeaders();

        $body = [
            'success' => false,
            'message' => $message,
        ];

        if ($errors !== null) {
            $body['errors'] = $errors;
        }

        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Send a paginated success response and terminate.
     *
     * @param  array $data      Array of items for the current page
     * @param  int   $total     Total number of items across all pages
     * @param  int   $page      Current page number (1-based)
     * @param  int   $perPage   Items per page
     * @param  int   $status    HTTP status code (default 200)
     */
    public static function paginated($data, $total, $page, $perPage, $status = 200, $paginationCount = null)
    {
        $total   = (int) $total;
        $page    = max(1, (int) $page);
        $perPage = max(1, (int) $perPage);

        // paginationCount: 페이징 계산용 (공지 제외 건수), 없으면 total 사용
        $countForPages = $paginationCount !== null ? (int) $paginationCount : $total;
        $lastPage = (int) ceil($countForPages / $perPage);

        http_response_code($status);
        self::sendJsonHeaders();

        $body = [
            'success' => true,
            'data'    => $data,
            'meta'    => [
                'total'        => $total,
                'per_page'     => $perPage,
                'current_page' => $page,
                'last_page'    => $lastPage,
                'from'         => $total > 0 ? ($page - 1) * $perPage + 1 : null,
                'to'           => $total > 0 ? min($page * $perPage, $total) : null,
            ],
        ];

        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Send a 204 No Content response (e.g. after a successful DELETE).
     */
    public static function noContent()
    {
        http_response_code(204);
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
        header('Pragma: no-cache');
        header('Expires: 0');
        exit;
    }
}

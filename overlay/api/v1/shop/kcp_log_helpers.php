<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('shop_api_kcp_log_dir')) {
    /**
     * KCP 라이브러리(pp_cli)에 넘기는 로그 폴더. 거래 로그에는 가맹점 코드 · 가상계좌 번호 · 사업자번호가 평문으로 남으므로
     * 결제 로그는 남기지 않는다 — 영카트 shop/settle_kcp.inc.php 처럼 없는 경로를 넘기면 pp_cli 가 로그 파일을 만들지 못한다.
     * 폴더는 만들지 않는다. 그 경로가 있는 서버라면 없는 하위 경로를 넘긴다.
     */
    function shop_api_kcp_log_dir(): string
    {
        $dir = '/home100/kcp';
        while (file_exists($dir)) {
            $dir .= '/no-log-' . bin2hex(random_bytes(4));
        }
        return $dir;
    }
}

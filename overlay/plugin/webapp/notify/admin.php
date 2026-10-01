<?php
/**
 * 관리자 → 디데이 알림 발송 현황.
 *
 * 코어를 고치지 않고 그누보드 관리자 훅으로만 붙인다.
 *   - add_replace('admin_menu', …)                        메뉴 등록
 *   - add_event('admin_request_handler_dday_notifications') 데이터 조회 (head 전)
 *   - add_event('admin_get_page_dday_notifications')        화면 출력 (head~tail 사이)
 *
 * 진입: /adm/view.php?call=dday_notifications
 * 권한: view.php 가 $is_admin 또는 g5_auth 등록 여부로 검사한다.
 *
 * 두 테이블을 함께 본다.
 *   - g5_push_queue       : 서버가 Expo 로 "보내려고 시도한" 기록 (성공/실패/재시도)
 *   - g5_notification_log : 사용자에게 알림으로 "남은" 기록 (앱 알림함 노출분)
 *
 * 왜 둘을 같이 보나: 큐만 보면 사용자가 알림함에서 무엇을 봤는지 모르고,
 * 로그만 보면 토큰 만료 등으로 아예 닿지 못한 발송을 영영 못 찾는다.
 *
 * 주의 — 두 테이블 건수를 나눠 "도달률"로 쓰면 안 된다. 큐는 (사용자 × 기기 토큰)
 * 마다 1행, 로그는 (사용자 × 디데이) 마다 1행이라 분모가 애초에 다르다.
 * 그래서 이 화면은 두 지표를 나란히 보여줄 뿐 비율을 만들지 않는다.
 */
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('dday_nt_admin_menu')) {

    add_replace('admin_menu', 'dday_nt_admin_menu', 1, 1);
    add_event('admin_request_handler_dday_notifications', 'dday_nt_request_handler', 1, 2);
    add_event('admin_get_page_dday_notifications', 'dday_nt_get_page', 1, 2);

    /** 회원관리(menu100) 아래에 항목 추가. 100950 은 admin.menu100.php 에서 미사용. */
    function dday_nt_admin_menu($admin_menu)
    {
        $admin_menu['menu100'][] = array(
            '100950',
            '알림 현황',
            G5_ADMIN_URL . '/view.php?call=dday_notifications',
            'dday_notifications'
        );

        return $admin_menu;
    }

    /** 핸들러가 담은 조회 결과를 렌더러로 넘기는 상자. 전역을 더럽히지 않는다. */
    function dday_nt_state($set = null)
    {
        static $state = array();
        if ($set !== null) {
            $state = $set;
        }
        return $state;
    }

    /** 현재 필터를 유지한 채 일부만 바꾼 링크. 검증된 값만 넣는다. */
    function dday_nt_url(array $override = array())
    {
        $s = dday_nt_state();
        $merged = array_merge(
            array(
                'call'   => 'dday_notifications',
                'tab'    => $s['tab'],
                'days'   => $s['days'],
                'status' => $s['status'],
                'read'   => $s['read'],
                'type'   => $s['type'],
                'mb_id'  => $s['mb_id'],
            ),
            $override
        );
        $merged = array_filter($merged, function ($v) {
            return $v !== '' && $v !== null;
        });
        return G5_ADMIN_URL . '/view.php?' . http_build_query($merged);
    }

    /** Expo 토큰과 device_id 는 자격증명/식별자라 통째로 노출하지 않는다. */
    function dday_nt_mask($value, $head = 12, $tail = 4)
    {
        $value = (string) $value;
        if ($value === '') return '';
        if (strlen($value) <= $head + $tail) return $value;
        return substr($value, 0, $head) . '…' . substr($value, -$tail);
    }

    /**
     * 조회 단계 — admin.head.php 보다 먼저 돈다.
     * 출력 전에 끝내야 오류가 나도 화면이 반쯤 그려지지 않는다.
     */
    function dday_nt_request_handler($arr_query, $token)
    {
        require_once G5_PATH . '/api/lib/DB.php';

        $queueTable = DB::table('push_queue_table');
        $logTable   = DB::table('notification_log_table');

        // ---------------------------------------------------------- 필터 입력
        $tab = isset($_GET['tab']) ? (string) $_GET['tab'] : 'queue';
        if (!in_array($tab, array('queue', 'log'), true)) $tab = 'queue';

        $days = isset($_GET['days']) ? (int) $_GET['days'] : 7;
        if (!in_array($days, array(1, 7, 30, 90), true)) $days = 7;
        $since = date('Y-m-d H:i:s', strtotime("-{$days} days"));

        $status = isset($_GET['status']) ? (string) $_GET['status'] : 'all';
        if (!in_array($status, array('all', 'pending', 'processing', 'sent', 'failed'), true)) $status = 'all';

        $read = isset($_GET['read']) ? (string) $_GET['read'] : 'all';
        if (!in_array($read, array('all', 'read', 'unread'), true)) $read = 'all';

        $type = isset($_GET['type']) ? trim((string) $_GET['type']) : '';
        $mbId = isset($_GET['mb_id']) ? trim((string) $_GET['mb_id']) : '';
        if (strlen($type) > 20) $type = substr($type, 0, 20);
        if (strlen($mbId) > 20) $mbId = substr($mbId, 0, 20);

        $page    = max(1, isset($_GET['page']) ? (int) $_GET['page'] : 1);
        $perPage = 30;
        $offset  = ($page - 1) * $perPage;

        // ------------------------------------------------------ 기간 요약 집계
        $queueSummary = array('pending' => 0, 'processing' => 0, 'sent' => 0, 'failed' => 0);
        foreach (DB::readFetchAll(
            "SELECT status, COUNT(*) AS c FROM `{$queueTable}` WHERE created_at >= ? GROUP BY status",
            array($since)
        ) as $r) {
            $queueSummary[$r['status']] = (int) $r['c'];
        }
        $queueTotal = array_sum($queueSummary);

        $logTotal = DB::readCount("SELECT COUNT(*) FROM `{$logTable}` WHERE nt_sent_at >= ?", array($since));
        $logRead  = DB::readCount(
            "SELECT COUNT(*) FROM `{$logTable}` WHERE nt_sent_at >= ? AND nt_read_at IS NOT NULL",
            array($since)
        );
        $readRate = $logTotal > 0 ? round($logRead * 100 / $logTotal, 1) : 0.0;

        // 일자별 추이 — 큐(성공/실패)와 로그를 같은 날짜 축에 올린다.
        $trend = array();
        foreach (DB::readFetchAll(
            "SELECT DATE(created_at) AS d,
                    SUM(status = 'sent')   AS sent,
                    SUM(status = 'failed') AS failed,
                    COUNT(*)               AS total
               FROM `{$queueTable}`
              WHERE created_at >= ?
              GROUP BY DATE(created_at)",
            array($since)
        ) as $r) {
            $trend[$r['d']] = array(
                'queue_total'  => (int) $r['total'],
                'queue_sent'   => (int) $r['sent'],
                'queue_failed' => (int) $r['failed'],
                'log'          => 0,
            );
        }
        foreach (DB::readFetchAll(
            "SELECT DATE(nt_sent_at) AS d, COUNT(*) AS c
               FROM `{$logTable}` WHERE nt_sent_at >= ? GROUP BY DATE(nt_sent_at)",
            array($since)
        ) as $r) {
            if (!isset($trend[$r['d']])) {
                $trend[$r['d']] = array('queue_total' => 0, 'queue_sent' => 0, 'queue_failed' => 0, 'log' => 0);
            }
            $trend[$r['d']]['log'] = (int) $r['c'];
        }
        krsort($trend);

        // 최근 실패 사유 — 운영에서 가장 먼저 확인하게 되는 값.
        $failReasons = DB::readFetchAll(
            "SELECT COALESCE(last_error, '(사유 없음)') AS reason, COUNT(*) AS c
               FROM `{$queueTable}`
              WHERE created_at >= ? AND status = 'failed'
              GROUP BY reason ORDER BY c DESC LIMIT 5",
            array($since)
        );

        // ---------------------------------------------------------- 목록 조회
        $where  = array();
        $params = array();

        if ($tab === 'queue') {
            $where[]  = 'created_at >= ?';
            $params[] = $since;
            if ($status !== 'all') { $where[] = 'status = ?';  $params[] = $status; }
            if ($type !== '')      { $where[] = 'nt_type = ?'; $params[] = $type; }
            if ($mbId !== '')      { $where[] = 'mb_id = ?';   $params[] = $mbId; }
            $whereSql = 'WHERE ' . implode(' AND ', $where);

            $totalCount = DB::readCount("SELECT COUNT(*) FROM `{$queueTable}` {$whereSql}", $params);
            $rows = DB::readFetchAll(
                "SELECT * FROM `{$queueTable}` {$whereSql} ORDER BY created_at DESC, queue_id DESC LIMIT ?, ?",
                array_merge($params, array($offset, $perPage))
            );
        } else {
            $where[]  = 'nt_sent_at >= ?';
            $params[] = $since;
            if ($read === 'read')   { $where[] = 'nt_read_at IS NOT NULL'; }
            if ($read === 'unread') { $where[] = 'nt_read_at IS NULL'; }
            if ($type !== '')       { $where[] = 'nt_type = ?'; $params[] = $type; }
            if ($mbId !== '')       { $where[] = 'mb_id = ?';   $params[] = $mbId; }
            $whereSql = 'WHERE ' . implode(' AND ', $where);

            $totalCount = DB::readCount("SELECT COUNT(*) FROM `{$logTable}` {$whereSql}", $params);
            $rows = DB::readFetchAll(
                "SELECT * FROM `{$logTable}` {$whereSql} ORDER BY nt_sent_at DESC, nt_id DESC LIMIT ?, ?",
                array_merge($params, array($offset, $perPage))
            );
        }

        dday_nt_state(array(
            'tab'          => $tab,
            'days'         => $days,
            'status'       => $status,
            'read'         => $read,
            'type'         => $type,
            'mb_id'        => $mbId,
            'page'         => $page,
            'perPage'      => $perPage,
            'queueSummary' => $queueSummary,
            'queueTotal'   => $queueTotal,
            'logTotal'     => $logTotal,
            'logRead'      => $logRead,
            'readRate'     => $readRate,
            'trend'        => $trend,
            'failReasons'  => $failReasons,
            'rows'         => $rows,
            'totalCount'   => $totalCount,
            'totalPages'   => max(1, (int) ceil($totalCount / $perPage)),
            // 기간 밖에 데이터가 있는데 "기록이 없습니다"만 보이면 오진을 부른다.
            // 빈 화면에서 전체 기간 건수를 같이 알려주려고 미리 세어 둔다.
            'allTimeQueue' => DB::readCount("SELECT COUNT(*) FROM `{$queueTable}`"),
            'allTimeLog'   => DB::readCount("SELECT COUNT(*) FROM `{$logTable}`"),
        ));
    }

    /** 출력 단계 — admin.head.php 와 admin.tail.php 사이. */
    function dday_nt_get_page($arr_query, $token)
    {
        $s = dday_nt_state();
        if (!$s) {
            echo '<p style="padding:16px;">조회 상태를 불러오지 못했습니다.</p>';
            return;
        }

        $statusLabels = array(
            'pending'    => '대기',
            'processing' => '처리중',
            'sent'       => '발송됨',
            'failed'     => '실패',
        );
        ?>

<style>
  .dday-nt { padding: 16px; }
  .dday-nt h2 { margin: 0 0 4px; }
  .dday-nt .lead { margin: 0 0 16px; color: #666; font-size: 13px; }
  .dday-nt .cards { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  .dday-nt .card { flex: 1 1 140px; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px 14px; background: #fafafa; }
  .dday-nt .card .k { font-size: 12px; color: #777; }
  .dday-nt .card .v { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .dday-nt .card.warn .v { color: #c4302b; }
  .dday-nt .card.ok .v { color: #1a7f37; }
  .dday-nt .note { background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 10px 12px; font-size: 12px; color: #6b5300; margin-bottom: 16px; line-height: 1.6; }
  .dday-nt .filters { margin-bottom: 12px; }
  .dday-nt .filters a { display: inline-block; padding: 5px 11px; margin: 0 4px 4px 0; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; font-size: 13px; }
  .dday-nt .filters a.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
  .dday-nt .filters .label { display: inline-block; min-width: 52px; color: #777; font-size: 12px; }
  .dday-nt form.search { margin-bottom: 14px; font-size: 13px; }
  .dday-nt form.search input[type=text] { padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; }
  .dday-nt table { border-collapse: collapse; width: 100%; font-size: 13px; }
  .dday-nt th, .dday-nt td { border: 1px solid #ddd; padding: 7px 8px; vertical-align: top; }
  .dday-nt th { background: #f5f5f5; font-weight: 600; text-align: left; white-space: nowrap; }
  .dday-nt td.num { text-align: right; }
  .dday-nt .mono { font-family: monospace; font-size: 12px; color: #555; word-break: break-all; }
  .dday-nt .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .dday-nt .badge.sent { background: #e6f4ea; color: #1a7f37; }
  .dday-nt .badge.failed { background: #fdecea; color: #c4302b; }
  .dday-nt .badge.pending { background: #eef2ff; color: #3730a3; }
  .dday-nt .badge.processing { background: #fff4e5; color: #a15c00; }
  .dday-nt .err { color: #c4302b; font-size: 12px; max-width: 260px; }
  .dday-nt .muted { color: #888; }
  .dday-nt .pager { margin-top: 16px; }
  .dday-nt .pager a { margin-right: 6px; }
  .dday-nt .empty { padding: 32px; text-align: center; color: #888; }
  .dday-nt .trend { margin-bottom: 18px; }
  .dday-nt .trend table { width: auto; min-width: 420px; }
</style>

<div class="dday-nt">
  <p class="lead">최근 <?php echo $s['days']; ?>일 · 발송 큐(서버가 보내려 한 것)와 알림 이력(사용자에게 남은 것)을 함께 봅니다.</p>

  <div class="cards">
    <div class="card"><div class="k">큐 전체</div><div class="v"><?php echo number_format($s['queueTotal']); ?></div></div>
    <div class="card ok"><div class="k">발송 성공</div><div class="v"><?php echo number_format($s['queueSummary']['sent']); ?></div></div>
    <div class="card warn"><div class="k">발송 실패</div><div class="v"><?php echo number_format($s['queueSummary']['failed']); ?></div></div>
    <div class="card"><div class="k">대기 / 처리중</div><div class="v"><?php echo number_format($s['queueSummary']['pending']); ?> / <?php echo number_format($s['queueSummary']['processing']); ?></div></div>
    <div class="card"><div class="k">알림 이력</div><div class="v"><?php echo number_format($s['logTotal']); ?></div></div>
    <div class="card"><div class="k">읽음</div><div class="v"><?php echo number_format($s['logRead']); ?> <small style="font-size:13px;color:#777">(<?php echo $s['readRate']; ?>%)</small></div></div>
  </div>

  <div class="note">
    <strong>큐 건수와 이력 건수를 나눠 도달률로 쓰지 마세요.</strong><br>
    큐는 <em>사용자 × 기기 토큰</em>마다 1행, 이력은 <em>사용자 × 디데이</em>마다 1행입니다.
    기기를 2대 쓰는 사용자는 큐 2행 / 이력 1행이 되므로 분모가 서로 다릅니다.
    운영 지표로는 <strong>실패 건수</strong>와 <strong>대기 적체</strong>, 그리고 이력의 <strong>읽음률</strong>을 각각 보세요.
  </div>

  <?php if ($s['failReasons']) { ?>
    <div class="trend">
      <strong style="font-size:13px;">최근 실패 사유 TOP <?php echo count($s['failReasons']); ?></strong>
      <table style="margin-top:6px;">
        <tr><th>사유</th><th style="text-align:right;">건수</th></tr>
        <?php foreach ($s['failReasons'] as $f) { ?>
          <tr>
            <td class="err"><?php echo htmlspecialchars((string) $f['reason']); ?></td>
            <td class="num"><?php echo number_format((int) $f['c']); ?></td>
          </tr>
        <?php } ?>
      </table>
    </div>
  <?php } ?>

  <?php if ($s['trend']) { ?>
    <div class="trend">
      <strong style="font-size:13px;">일자별 추이</strong>
      <table style="margin-top:6px;">
        <tr><th>날짜</th><th style="text-align:right;">큐 전체</th><th style="text-align:right;">성공</th><th style="text-align:right;">실패</th><th style="text-align:right;">이력</th></tr>
        <?php foreach ($s['trend'] as $d => $t) { ?>
          <tr>
            <td><?php echo htmlspecialchars((string) $d); ?></td>
            <td class="num"><?php echo number_format($t['queue_total']); ?></td>
            <td class="num"><?php echo number_format($t['queue_sent']); ?></td>
            <td class="num"><?php echo $t['queue_failed'] > 0 ? '<strong style="color:#c4302b">' . number_format($t['queue_failed']) . '</strong>' : '0'; ?></td>
            <td class="num"><?php echo number_format($t['log']); ?></td>
          </tr>
        <?php } ?>
      </table>
    </div>
  <?php } ?>

  <div class="filters">
    <div>
      <span class="label">보기</span>
      <a href="<?php echo htmlspecialchars(dday_nt_url(array('tab' => 'queue', 'page' => 1))); ?>" class="<?php echo $s['tab'] === 'queue' ? 'active' : ''; ?>">발송 큐</a>
      <a href="<?php echo htmlspecialchars(dday_nt_url(array('tab' => 'log', 'page' => 1))); ?>" class="<?php echo $s['tab'] === 'log' ? 'active' : ''; ?>">알림 이력</a>
    </div>
    <div>
      <span class="label">기간</span>
      <?php foreach (array(1 => '1일', 7 => '7일', 30 => '30일', 90 => '90일') as $d => $label) { ?>
        <a href="<?php echo htmlspecialchars(dday_nt_url(array('days' => $d, 'page' => 1))); ?>" class="<?php echo $s['days'] === $d ? 'active' : ''; ?>"><?php echo $label; ?></a>
      <?php } ?>
    </div>
    <?php if ($s['tab'] === 'queue') { ?>
      <div>
        <span class="label">상태</span>
        <?php foreach (array('all' => '전체', 'sent' => '발송됨', 'failed' => '실패', 'pending' => '대기', 'processing' => '처리중') as $k => $label) { ?>
          <a href="<?php echo htmlspecialchars(dday_nt_url(array('status' => $k, 'page' => 1))); ?>" class="<?php echo $s['status'] === $k ? 'active' : ''; ?>"><?php echo $label; ?></a>
        <?php } ?>
      </div>
    <?php } else { ?>
      <div>
        <span class="label">읽음</span>
        <?php foreach (array('all' => '전체', 'unread' => '안 읽음', 'read' => '읽음') as $k => $label) { ?>
          <a href="<?php echo htmlspecialchars(dday_nt_url(array('read' => $k, 'page' => 1))); ?>" class="<?php echo $s['read'] === $k ? 'active' : ''; ?>"><?php echo $label; ?></a>
        <?php } ?>
      </div>
    <?php } ?>
  </div>

  <form class="search" method="get" action="<?php echo G5_ADMIN_URL; ?>/view.php">
    <input type="hidden" name="call" value="dday_notifications">
    <input type="hidden" name="tab" value="<?php echo htmlspecialchars($s['tab']); ?>">
    <input type="hidden" name="days" value="<?php echo (int) $s['days']; ?>">
    <input type="hidden" name="status" value="<?php echo htmlspecialchars($s['status']); ?>">
    <input type="hidden" name="read" value="<?php echo htmlspecialchars($s['read']); ?>">
    회원ID <input type="text" name="mb_id" value="<?php echo htmlspecialchars($s['mb_id']); ?>" size="14" placeholder="예: member01" maxlength="20">
    종류 <input type="text" name="type" value="<?php echo htmlspecialchars($s['type']); ?>" size="10" placeholder="예: dday" maxlength="20">
    <button type="submit">검색</button>
    <?php if ($s['mb_id'] !== '' || $s['type'] !== '') { ?>
      <a href="<?php echo htmlspecialchars(dday_nt_url(array('mb_id' => '', 'type' => '', 'page' => 1))); ?>">초기화</a>
    <?php } ?>
  </form>

  <p class="lead"><?php echo number_format($s['totalCount']); ?>건 · <?php echo $s['page']; ?>/<?php echo $s['totalPages']; ?> 페이지</p>

  <?php if (!$s['rows']) { ?>
    <?php
    // 이 탭이 보는 테이블의 전체 기간 건수. 0 이면 정말 데이터가 없는 것이고,
    // 0 이 아니면 조회 기간 때문에 안 보이는 것이라 서로 구분해서 안내한다.
    $allTime = $s['tab'] === 'queue' ? $s['allTimeQueue'] : $s['allTimeLog'];
    ?>
    <div class="empty">
      최근 <?php echo $s['days']; ?>일에는 해당 조건의 기록이 없습니다.
      <?php if ($allTime > 0) { ?>
        <br><br>
        <strong>전체 기간에는 <?php echo number_format($allTime); ?>건이 있습니다.</strong>
        기간을 넓혀 보세요 —
        <a href="<?php echo htmlspecialchars(dday_nt_url(array('days' => 90, 'page' => 1))); ?>">90일로 보기</a>
      <?php } else { ?>
        <br><br>
        <span class="muted">
          <?php echo $s['tab'] === 'queue'
              ? '발송 큐가 비어 있습니다. cron(send_dday_push.php)이 등록돼 실행되는지 확인하세요.'
              : '알림 이력이 비어 있습니다. 아직 발송된 알림이 없습니다.'; ?>
        </span>
      <?php } ?>
    </div>
  <?php } elseif ($s['tab'] === 'queue') { ?>
    <table>
      <thead>
        <tr>
          <th>#</th><th>등록</th><th>발송</th><th>회원</th><th>종류</th>
          <th>제목 / 본문</th><th>기기 토큰</th><th>상태</th><th>시도</th><th>오류</th>
        </tr>
      </thead>
      <tbody>
      <?php foreach ($s['rows'] as $r) { ?>
        <tr>
          <td class="num"><?php echo (int) $r['queue_id']; ?></td>
          <td class="mono"><?php echo htmlspecialchars((string) $r['created_at']); ?></td>
          <td class="mono"><?php echo $r['processed_at'] ? htmlspecialchars((string) $r['processed_at']) : '<span class="muted">—</span>'; ?></td>
          <td>
            <?php if ($r['mb_id']) { ?>
              <a href="<?php echo htmlspecialchars(dday_nt_url(array('mb_id' => (string) $r['mb_id'], 'page' => 1))); ?>"><?php echo htmlspecialchars((string) $r['mb_id']); ?></a>
            <?php } else { ?>
              <span class="muted">—</span>
            <?php } ?>
          </td>
          <td><?php echo htmlspecialchars((string) $r['nt_type']); ?></td>
          <td>
            <strong><?php echo htmlspecialchars((string) $r['nt_title']); ?></strong>
            <?php if ((string) $r['nt_body'] !== '') { ?><br><span class="muted"><?php echo htmlspecialchars((string) $r['nt_body']); ?></span><?php } ?>
            <?php if (!empty($r['nt_id'])) { ?><br><span class="mono">알림#<?php echo (int) $r['nt_id']; ?></span><?php } ?>
          </td>
          <td class="mono"><?php echo htmlspecialchars(dday_nt_mask($r['expo_token'])); ?></td>
          <td><span class="badge <?php echo htmlspecialchars((string) $r['status']); ?>"><?php echo htmlspecialchars(isset($statusLabels[$r['status']]) ? $statusLabels[$r['status']] : (string) $r['status']); ?></span></td>
          <td class="num"><?php echo (int) $r['attempts']; ?></td>
          <td class="err"><?php echo $r['last_error'] ? htmlspecialchars((string) $r['last_error']) : ''; ?></td>
        </tr>
      <?php } ?>
      </tbody>
    </table>
  <?php } else { ?>
    <table>
      <thead>
        <tr>
          <th>#</th><th>발송 시각</th><th>대상</th><th>종류</th>
          <th>제목 / 본문</th><th>이벤트</th><th>읽음</th><th>중복키</th>
        </tr>
      </thead>
      <tbody>
      <?php foreach ($s['rows'] as $r) { ?>
        <tr>
          <td class="num"><?php echo (int) $r['nt_id']; ?></td>
          <td class="mono"><?php echo htmlspecialchars((string) $r['nt_sent_at']); ?></td>
          <td>
            <?php if ($r['mb_id']) { ?>
              <a href="<?php echo htmlspecialchars(dday_nt_url(array('mb_id' => (string) $r['mb_id'], 'page' => 1))); ?>"><?php echo htmlspecialchars((string) $r['mb_id']); ?></a>
            <?php } elseif ($r['device_id']) { ?>
              <span class="mono muted">비회원 <?php echo htmlspecialchars(dday_nt_mask((string) $r['device_id'], 8, 4)); ?></span>
            <?php } else { ?>
              <span class="muted">—</span>
            <?php } ?>
          </td>
          <td><?php echo htmlspecialchars((string) $r['nt_type']); ?></td>
          <td>
            <strong><?php echo htmlspecialchars((string) $r['nt_title']); ?></strong>
            <?php if ((string) $r['nt_body'] !== '') { ?><br><span class="muted"><?php echo htmlspecialchars((string) $r['nt_body']); ?></span><?php } ?>
          </td>
          <td class="mono"><?php echo !empty($r['nt_event']) ? htmlspecialchars((string) $r['nt_event']) : '<span class="muted">—</span>'; ?></td>
          <td>
            <?php if ($r['nt_read_at']) { ?>
              <span class="badge sent">읽음</span><br><span class="mono"><?php echo htmlspecialchars((string) $r['nt_read_at']); ?></span>
            <?php } else { ?>
              <span class="badge pending">안 읽음</span>
            <?php } ?>
          </td>
          <td class="mono muted"><?php echo htmlspecialchars((string) (isset($r['nt_dedup_key']) ? $r['nt_dedup_key'] : '')); ?></td>
        </tr>
      <?php } ?>
      </tbody>
    </table>
  <?php } ?>

  <?php if ($s['totalPages'] > 1) { ?>
    <div class="pager">
      <?php
      $from = max(1, $s['page'] - 5);
      $to   = min($s['totalPages'], $from + 19);
      for ($p = $from; $p <= $to; $p++) {
      ?>
        <a href="<?php echo htmlspecialchars(dday_nt_url(array('page' => $p))); ?>" style="<?php echo $p === $s['page'] ? 'font-weight:bold;' : ''; ?>"><?php echo $p; ?></a>
      <?php } ?>
    </div>
  <?php } ?>
</div>

        <?php
    }
}

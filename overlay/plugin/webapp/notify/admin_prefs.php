<?php
/**
 * 관리자 → 환경설정(menu100) → 알림 설정 현황 (알림 현황 바로 아래).
 *
 * 회원이 앱 · 웹의 "알림 설정"에서 항목별 푸시를 어떻게 켜고 껐는지 본다. 읽기만 한다.
 *   - 항목은 NotifyPrefs::items() 를 그대로 쓴다(core 다섯 개 + 플러그인이 더한 디데이 · 예방접종 등).
 *   - g5_member_pref 행이 없는 회원은 전부 "받음"이다 — 기본값이라 따로 저장하지 않는다.
 *   - 끈 항목은 푸시만 막고 알림함에는 남는다(Prefs.php 정책). 기기의 알림 권한(OS 설정)은 서버가 알 수 없다 —
 *     푸시 기기가 있다는 것은 "알림을 허용하고 토큰을 등록한 적이 있다"는 뜻까지만이다.
 *
 * 진입: /adm/view.php?call=notify_prefs · 권한: 최고관리자만(알림 현황과 같은 기준).
 * 그누보드 훅만 쓴다 — add_replace('admin_menu') · admin_request_handler_* · admin_get_page_*.
 */
if (!defined('_GNUBOARD_')) {
    exit;
}

if (!function_exists('webapp_np_admin_menu')) {

    add_replace('admin_menu', 'webapp_np_admin_menu', 2, 1);
    add_event('admin_request_handler_notify_prefs', 'webapp_np_request_handler', 1, 2);
    add_event('admin_get_page_notify_prefs', 'webapp_np_get_page', 1, 2);

    /** 환경설정(menu100)의 알림 현황(100950) 바로 다음. */
    function webapp_np_admin_menu($admin_menu)
    {
        $admin_menu['menu100'][] = array(
            '100951',
            '알림 설정 현황',
            G5_ADMIN_URL . '/view.php?call=notify_prefs',
            'notify_prefs'
        );

        return $admin_menu;
    }

    /** 핸들러가 담은 조회 결과를 렌더러로 넘기는 상자. */
    function webapp_np_state($set = null)
    {
        static $state = array();
        if ($set !== null) {
            $state = $set;
        }
        return $state;
    }

    /** 현재 필터를 유지한 채 일부만 바꾼 링크. 검증된 값만 넣는다. */
    function webapp_np_url(array $override = array())
    {
        $s = webapp_np_state();
        $merged = array_merge(
            array('call' => 'notify_prefs', 'view' => $s['view'], 'off' => $s['off'], 'q' => $s['q']),
            $override
        );
        $merged = array_filter($merged, function ($v) {
            return $v !== '' && $v !== null;
        });
        return G5_ADMIN_URL . '/view.php?' . http_build_query($merged);
    }

    /** member_pref 표에 실제로 있는 항목 칸만 — 플러그인이 칸을 아직 안 만들었으면 모두 "받음"으로 본다. */
    function webapp_np_columns($prefTable, array $items)
    {
        $existing = array();
        foreach (DB::readFetchAll("SHOW COLUMNS FROM `{$prefTable}`") as $col) {
            $existing[(string) $col['Field']] = true;
        }
        $out = array();
        foreach ($items as $key => $item) {
            // 키는 Prefs::items() 가 notify_[a-z0-9_] 꼴만 남긴다 — 그래도 SQL 에 넣기 전에 한 번 더 본다.
            if (isset($existing[$key]) && preg_match('/^notify_[a-z0-9_]+$/', $key)) {
                $out[$key] = $item;
            }
        }
        return $out;
    }

    /** 목록의 WHERE — 보기(view) · 끈 항목(off) · 검색(q). 칸 이름은 webapp_np_columns() 를 거친 것만. */
    function webapp_np_where(array $s, array $columns)
    {
        $where = array("m.mb_leave_date = ''");
        $params = array();

        if ($s['q'] !== '') {
            // 검색하면 설정을 안 바꾼 회원(행 없음 = 전부 받음)도 보여 준다.
            $where[] = '(m.mb_id = ? OR m.mb_nick LIKE ?)';
            $params[] = $s['q'];
            $params[] = '%' . $s['q'] . '%';
        } else {
            $where[] = '(p.mb_id IS NOT NULL OR t.mb_id IS NOT NULL)';
        }

        if ($s['view'] === 'changed') {
            $where[] = 'p.mb_id IS NOT NULL';
        } elseif ($s['view'] === 'push') {
            $where[] = 't.mb_id IS NOT NULL';
        } elseif ($s['view'] === 'nopush') {
            $where[] = 't.mb_id IS NULL';
        }

        if ($s['off'] === 'any' && $columns) {
            $ors = array();
            foreach (array_keys($columns) as $key) {
                $ors[] = "p.`{$key}` = 0";
            }
            $where[] = '(' . implode(' OR ', $ors) . ')';
        } elseif ($s['off'] !== '' && isset($columns[$s['off']])) {
            $where[] = "p.`{$s['off']}` = 0";
        }

        return array('WHERE ' . implode(' AND ', $where), $params);
    }

    /** 요약 — 회원 수 · 설정을 바꾼 회원 · 항목별 끈 회원 · 푸시 기기. */
    function webapp_np_summary($memberTable, $prefTable, $tokenTable, array $columns)
    {
        $offCounts = array();
        if ($columns) {
            $sums = array();
            foreach (array_keys($columns) as $key) {
                $sums[] = "SUM(p.`{$key}` = 0) AS `{$key}`";
            }
            $row = DB::readFetch(
                'SELECT ' . implode(', ', $sums) . " FROM `{$prefTable}` p
                   JOIN `{$memberTable}` m ON m.mb_id = p.mb_id
                  WHERE m.mb_leave_date = ''"
            );
            foreach (array_keys($columns) as $key) {
                $offCounts[$key] = $row ? (int) $row[$key] : 0;
            }
        }

        $platforms = array();
        foreach (DB::readFetchAll(
            "SELECT platform, SUM(mb_id <> '') AS member_devices, SUM(mb_id = '') AS guest_devices
               FROM `{$tokenTable}` GROUP BY platform ORDER BY platform"
        ) as $r) {
            $platforms[] = array(
                'platform' => (string) $r['platform'],
                'member'   => (int) $r['member_devices'],
                'guest'    => (int) $r['guest_devices'],
            );
        }

        return array(
            'memberCount'  => DB::readCount("SELECT COUNT(*) FROM `{$memberTable}` WHERE mb_leave_date = ''"),
            'changedCount' => DB::readCount(
                "SELECT COUNT(*) FROM `{$prefTable}` p JOIN `{$memberTable}` m ON m.mb_id = p.mb_id
                  WHERE m.mb_leave_date = ''"
            ),
            'offCounts'    => $offCounts,
            'pushMembers'  => DB::readCount(
                "SELECT COUNT(DISTINCT t.mb_id) FROM `{$tokenTable}` t
                   JOIN `{$memberTable}` m ON m.mb_id = t.mb_id
                  WHERE t.mb_id <> '' AND m.mb_leave_date = ''"
            ),
            'platforms'    => $platforms,
        );
    }

    /**
     * 조회 단계 — admin.head.php 보다 먼저 돈다.
     */
    function webapp_np_request_handler($arr_query, $token)
    {
        global $is_admin;

        // 회원마다 무엇을 받는지 · 어떤 기기를 쓰는지 보여 주므로 최고관리자만.
        if ($is_admin !== 'super') {
            alert('최고관리자만 접근 가능합니다.');
        }

        require_once G5_PATH . '/api/lib/DB.php';
        require_once G5_PATH . '/plugin/webapp/notify/Prefs.php';

        $memberTable = DB::table('member_table');
        $prefTable   = DB::table('member_pref_table');
        $tokenTable  = DB::table('push_token_table');

        $items   = NotifyPrefs::items();
        $columns = webapp_np_columns($prefTable, $items);

        // ---------------------------------------------------------- 필터 입력
        $view = isset($_GET['view']) ? (string) $_GET['view'] : 'all';
        if (!in_array($view, array('all', 'changed', 'push', 'nopush'), true)) $view = 'all';

        $off = isset($_GET['off']) ? (string) $_GET['off'] : '';
        if ($off !== 'any' && !isset($columns[$off])) $off = '';

        $q = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
        if (mb_strlen($q) > 30) $q = mb_substr($q, 0, 30);

        $page    = max(1, isset($_GET['page']) ? (int) $_GET['page'] : 1);
        $perPage = 50;

        // ------------------------------------------------------------- 목록
        // p.* 를 쓰지 않는다 — 행이 없는 회원은 p.mb_id 가 NULL 이라 m.mb_id 를 덮는다.
        $flagSelect = '';
        foreach (array_keys($columns) as $key) {
            $flagSelect .= ", p.`{$key}`";
        }
        $state = array('view' => $view, 'off' => $off, 'q' => $q);
        list($whereSql, $params) = webapp_np_where($state, $columns);
        $from = "FROM `{$memberTable}` m
                 LEFT JOIN `{$prefTable}` p ON p.mb_id = m.mb_id
                 LEFT JOIN (
                     SELECT mb_id, COUNT(*) AS devices, GROUP_CONCAT(DISTINCT platform ORDER BY platform) AS platforms,
                            MAX(last_used_at) AS last_used
                       FROM `{$tokenTable}` WHERE mb_id <> '' GROUP BY mb_id
                 ) t ON t.mb_id = m.mb_id
                 {$whereSql}";

        $totalCount = DB::readCount("SELECT COUNT(*) {$from}", $params);
        // 결과보다 큰 page 로 열어도 마지막 페이지를 보여 준다("2/1 페이지" 방지).
        $totalPages = max(1, (int) ceil($totalCount / $perPage));
        $page       = min($page, $totalPages);
        $offset     = ($page - 1) * $perPage;
        $rows = DB::readFetchAll(
            "SELECT m.mb_id, m.mb_nick, p.mb_id AS pref_mb_id, p.locale, p.tz, p.updated_at{$flagSelect},
                    t.devices, t.platforms, t.last_used
               {$from}
              ORDER BY COALESCE(p.updated_at, t.last_used) DESC, m.mb_no DESC
              LIMIT ?, ?",
            array_merge($params, array($offset, $perPage))
        );

        webapp_np_state(array_merge(
            $state,
            webapp_np_summary($memberTable, $prefTable, $tokenTable, $columns),
            array(
                'items'      => $items,
                'columns'    => $columns,
                'rows'       => $rows,
                'totalCount' => $totalCount,
                'page'       => $page,
                'totalPages' => $totalPages,
            )
        ));
    }

    /** 받음 비율(%) — 행이 없는 회원은 받음이다. */
    function webapp_np_rate($memberCount, $offCount)
    {
        if ($memberCount <= 0) return 100;
        return round(($memberCount - $offCount) * 100 / $memberCount, 1);
    }

    function webapp_np_get_page($arr_query, $token)
    {
        $s = webapp_np_state();
        if (!$s) {
            echo '<p style="padding:16px;">조회 상태를 불러오지 못했습니다.</p>';
            return;
        }
        $viewLabels = array('all' => '설정을 바꿨거나 푸시 기기가 있는 회원', 'changed' => '설정을 바꾼 회원', 'push' => '푸시 기기가 있는 회원', 'nopush' => '푸시 기기 없음');
        ?>

<style>
  .webapp-np { padding: 16px; }
  .webapp-np .lead { margin: 0 0 16px; color: #666; font-size: 13px; line-height: 1.6; }
  .webapp-np .cards { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  .webapp-np .card { flex: 1 1 150px; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px 14px; background: #fafafa; }
  .webapp-np .card .k { font-size: 12px; color: #777; }
  .webapp-np .card .v { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .webapp-np .card .v small { font-size: 13px; color: #777; font-weight: 400; }
  .webapp-np .filters { margin-bottom: 10px; }
  .webapp-np .filters a { display: inline-block; padding: 5px 11px; margin: 0 4px 4px 0; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; font-size: 13px; }
  .webapp-np .filters a.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
  .webapp-np .filters .label { display: inline-block; min-width: 64px; color: #777; font-size: 12px; }
  .webapp-np form.search { margin: 6px 0 14px; font-size: 13px; }
  .webapp-np form.search input[type=text] { padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; }
  .webapp-np table { border-collapse: collapse; width: 100%; font-size: 13px; }
  .webapp-np th, .webapp-np td { border: 1px solid #ddd; padding: 7px 8px; vertical-align: top; }
  .webapp-np th { background: #f5f5f5; font-weight: 600; text-align: left; white-space: nowrap; }
  .webapp-np td.num { text-align: right; }
  .webapp-np td.flag { text-align: center; white-space: nowrap; }
  .webapp-np .on { color: #1a7f37; font-weight: 700; }
  .webapp-np .off { color: #c4302b; font-weight: 700; }
  .webapp-np .mono { font-family: monospace; font-size: 12px; color: #555; }
  .webapp-np .muted { color: #888; }
  .webapp-np .items { width: auto; min-width: 520px; margin-bottom: 18px; }
  .webapp-np .pager { margin-top: 16px; }
  .webapp-np .pager a { margin-right: 6px; }
  .webapp-np .empty { padding: 32px; text-align: center; color: #888; }
</style>

<div class="webapp-np">
  <p class="lead">
    회원이 앱 · 웹의 알림 설정에서 항목별 푸시를 어떻게 켜고 껐는지 봅니다. 설정을 한 번도 바꾸지 않은 회원은 모든 항목을 받습니다.<br>
    끈 항목은 <strong>푸시만</strong> 오지 않고 알림함에는 그대로 남습니다. 기기의 알림 권한(휴대폰 설정)은 서버가 알 수 없습니다.
  </p>

  <div class="cards">
    <div class="card"><div class="k">회원(탈퇴 제외)</div><div class="v"><?php echo number_format($s['memberCount']); ?></div></div>
    <div class="card"><div class="k">설정을 바꾼 회원</div><div class="v"><?php echo number_format($s['changedCount']); ?></div></div>
    <div class="card"><div class="k">푸시 기기가 있는 회원</div><div class="v"><?php echo number_format($s['pushMembers']); ?></div></div>
    <?php foreach ($s['platforms'] as $p) { ?>
      <div class="card">
        <div class="k">기기 · <?php echo htmlspecialchars($p['platform'] !== '' ? $p['platform'] : '알 수 없음'); ?></div>
        <div class="v"><?php echo number_format($p['member']); ?> <small>회원<?php if ($p['guest'] > 0) { ?> · 비회원 <?php echo number_format($p['guest']); ?><?php } ?></small></div>
      </div>
    <?php } ?>
  </div>

  <table class="items">
    <thead><tr><th>알림 항목</th><th>설명</th><th style="text-align:right;">끈 회원</th><th style="text-align:right;">받는 비율</th></tr></thead>
    <tbody>
    <?php foreach ($s['items'] as $key => $item) { ?>
      <tr>
        <td>
          <?php if (isset($s['columns'][$key])) { ?>
            <a href="<?php echo htmlspecialchars(webapp_np_url(array('off' => $key, 'page' => 1))); ?>"><?php echo htmlspecialchars($item['label']); ?></a>
          <?php } else { ?>
            <?php echo htmlspecialchars($item['label']); ?>
          <?php } ?>
        </td>
        <td class="muted"><?php echo htmlspecialchars($item['hint']); ?></td>
        <?php if (isset($s['columns'][$key])) { ?>
          <td class="num"><?php echo number_format($s['offCounts'][$key]); ?></td>
          <td class="num"><?php echo webapp_np_rate($s['memberCount'], $s['offCounts'][$key]); ?>%</td>
        <?php } else { ?>
          <td class="num muted" colspan="2">표 칸 없음 — 모두 받음</td>
        <?php } ?>
      </tr>
    <?php } ?>
    </tbody>
  </table>

  <div class="filters">
    <span class="label">보기</span>
    <?php foreach ($viewLabels as $k => $label) { ?>
      <a href="<?php echo htmlspecialchars(webapp_np_url(array('view' => $k, 'page' => 1))); ?>" class="<?php echo $s['view'] === $k ? 'active' : ''; ?>"><?php echo $label; ?></a>
    <?php } ?>
  </div>
  <div class="filters">
    <span class="label">끈 항목</span>
    <a href="<?php echo htmlspecialchars(webapp_np_url(array('off' => '', 'page' => 1))); ?>" class="<?php echo $s['off'] === '' ? 'active' : ''; ?>">상관없음</a>
    <a href="<?php echo htmlspecialchars(webapp_np_url(array('off' => 'any', 'page' => 1))); ?>" class="<?php echo $s['off'] === 'any' ? 'active' : ''; ?>">하나라도 끔</a>
    <?php foreach ($s['columns'] as $key => $item) { ?>
      <a href="<?php echo htmlspecialchars(webapp_np_url(array('off' => $key, 'page' => 1))); ?>" class="<?php echo $s['off'] === $key ? 'active' : ''; ?>"><?php echo htmlspecialchars($item['label']); ?></a>
    <?php } ?>
  </div>

  <form class="search" method="get" action="<?php echo G5_ADMIN_URL; ?>/view.php">
    <input type="hidden" name="call" value="notify_prefs">
    <input type="hidden" name="view" value="<?php echo htmlspecialchars($s['view']); ?>">
    <input type="hidden" name="off" value="<?php echo htmlspecialchars($s['off']); ?>">
    회원 <input type="text" name="q" value="<?php echo htmlspecialchars($s['q']); ?>" size="16" placeholder="아이디 또는 닉네임" maxlength="30">
    <button type="submit">검색</button>
    <?php if ($s['q'] !== '') { ?>
      <a href="<?php echo htmlspecialchars(webapp_np_url(array('q' => '', 'page' => 1))); ?>">초기화</a>
    <?php } ?>
  </form>

  <p class="lead"><?php echo number_format($s['totalCount']); ?>명 · <?php echo $s['page']; ?>/<?php echo $s['totalPages']; ?> 페이지</p>

  <?php if (!$s['rows']) { ?>
    <div class="empty">조건에 맞는 회원이 없습니다.</div>
  <?php } else { ?>
    <table>
      <thead>
        <tr>
          <th>회원</th><th>푸시 기기</th>
          <?php foreach ($s['items'] as $key => $item) { ?><th style="text-align:center;"><?php echo htmlspecialchars($item['label']); ?></th><?php } ?>
          <th>언어 · 시간대</th><th>설정 바꾼 때</th>
        </tr>
      </thead>
      <tbody>
      <?php foreach ($s['rows'] as $r) { ?>
        <?php $hasPref = !empty($r['pref_mb_id']); ?>
        <tr>
          <td>
            <a href="<?php echo G5_ADMIN_URL; ?>/member_form.php?w=u&amp;mb_id=<?php echo urlencode((string) $r['mb_id']); ?>"><?php echo htmlspecialchars((string) $r['mb_id']); ?></a>
            <?php if ((string) $r['mb_nick'] !== '') { ?><br><span class="muted"><?php echo htmlspecialchars((string) $r['mb_nick']); ?></span><?php } ?>
          </td>
          <td>
            <?php if (!empty($r['devices'])) { ?>
              <?php echo (int) $r['devices']; ?>대 <span class="muted"><?php echo htmlspecialchars((string) $r['platforms']); ?></span>
              <?php if (!empty($r['last_used'])) { ?><br><span class="mono">마지막 <?php echo htmlspecialchars((string) $r['last_used']); ?></span><?php } ?>
            <?php } else { ?>
              <span class="muted">없음</span>
            <?php } ?>
          </td>
          <?php foreach ($s['items'] as $key => $item) { ?>
            <?php $on = !$hasPref || !isset($s['columns'][$key]) || !isset($r[$key]) || (int) $r[$key] !== 0; ?>
            <td class="flag"><?php echo $on ? '<span class="on">받음</span>' : '<span class="off">끔</span>'; ?></td>
          <?php } ?>
          <td><?php echo $hasPref ? htmlspecialchars((string) $r['locale'] . ' · ' . (string) $r['tz']) : '<span class="muted">기본</span>'; ?></td>
          <td class="mono"><?php echo $hasPref && !empty($r['updated_at']) ? htmlspecialchars((string) $r['updated_at']) : '<span class="muted">바꾼 적 없음</span>'; ?></td>
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
        <a href="<?php echo htmlspecialchars(webapp_np_url(array('page' => $p))); ?>" style="<?php echo $p === $s['page'] ? 'font-weight:bold;' : ''; ?>"><?php echo $p; ?></a>
      <?php } ?>
    </div>
  <?php } ?>
</div>

        <?php
    }
}

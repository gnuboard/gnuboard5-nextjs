<?php
if (!defined('_GNUBOARD_')) {
    exit;
}

/**
 * 삭제·이동된 매뉴얼 글의 이력은 원래 게시판 권한 범위에서만 조회한다.
 * 진입: /adm/view.php?call=post_history_archives
 */
if (!function_exists('webapp_post_history_archives_admin_menu')) {
    add_replace('admin_menu', 'webapp_post_history_archives_admin_menu', 1, 1);
    add_event('admin_request_handler_post_history_archives', 'webapp_post_history_archives_request', 1, 2);
    add_event('admin_get_page_post_history_archives', 'webapp_post_history_archives_page', 1, 2);

    function webapp_post_history_archives_admin_menu($adminMenu)
    {
        $adminMenu['menu300'][] = array(
            '300900',
            '게시글 이력 보관함',
            G5_ADMIN_URL . '/view.php?call=post_history_archives',
            'post_history_archives'
        );
        return $adminMenu;
    }

    function webapp_post_history_archives_state($set = null)
    {
        static $state = array();
        if ($set !== null) $state = $set;
        return $state;
    }

    function webapp_post_history_archives_escape($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    function webapp_post_history_archives_boards($viewer): array
    {
        global $g5;
        $groupId = webapp_post_history_group_id();
        if ($groupId === '' || empty($g5['board_table'])) return array();
        $group = sql_real_escape_string($groupId);
        $result = sql_query("SELECT bo_table, gr_id, bo_admin FROM `{$g5['board_table']}` WHERE gr_id = '{$group}'", false);
        $boards = array();
        while ($result && ($board = sql_fetch_array($result))) {
            $boTable = (string) ($board['bo_table'] ?? '');
            if ($boTable !== '' && webapp_post_history_can_view($viewer, $boTable, $board)) {
                $boards[] = $boTable;
            }
        }
        return $boards;
    }

    function webapp_post_history_archives_request($arrQuery, $token)
    {
        global $member;
        header('Cache-Control: private, no-store');
        if (!webapp_post_history_table_ready()) {
            alert('게시글 이력 표가 준비되지 않았습니다. 관리자 DB 업그레이드를 실행해 주세요.');
        }
        $boards = webapp_post_history_archives_boards($member ?? null);
        if (!$boards) {
            alert('조회할 수 있는 매뉴얼 게시판 이력이 없습니다.');
        }

        $archiveUuid = trim((string) ($_GET['archive'] ?? ''));
        if ($archiveUuid !== '' && !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i', $archiveUuid)) {
            alert('보관 이력 주소가 올바르지 않습니다.');
        }
        $revisions = $archiveUuid !== '' ? webapp_post_history_archived_revisions($archiveUuid, $boards) : array();
        if ($archiveUuid !== '' && !$revisions) {
            alert('보관 이력이 없거나 조회 권한이 없습니다.');
        }

        $compareFrom = max(0, (int) ($_GET['from'] ?? 0));
        $compareTo = max(0, (int) ($_GET['to'] ?? 0));
        $comparison = null;
        if ($compareFrom > 0 || $compareTo > 0) {
            $byId = array();
            foreach ($revisions as $revision) $byId[(int) $revision['rev_id']] = $revision;
            if ($compareFrom <= 0 || $compareTo <= 0 || $compareFrom === $compareTo
                || !isset($byId[$compareFrom], $byId[$compareTo])) {
                alert('같은 보관 이력에 속한 서로 다른 두 버전을 선택해 주세요.');
            }
            $comparison = array('from' => $byId[$compareFrom], 'to' => $byId[$compareTo]);
        }

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = 30;
        $total = webapp_post_history_archives_count($boards);
        $totalPages = max(1, (int) ceil($total / $perPage));
        if ($page > $totalPages) $page = $totalPages;
        $items = webapp_post_history_archives_list($boards, ($page - 1) * $perPage, $perPage);

        webapp_post_history_archives_state(array(
            'boards' => $boards,
            'archive_uuid' => $archiveUuid,
            'revisions' => $revisions,
            'comparison' => $comparison,
            'default_from_id' => count($revisions) > 1 ? (int) $revisions[count($revisions) - 2]['rev_id'] : 0,
            'default_to_id' => count($revisions) > 1 ? (int) $revisions[count($revisions) - 1]['rev_id'] : 0,
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $totalPages,
            'items' => $items,
        ));
    }

    function webapp_post_history_archives_url(array $override = array()): string
    {
        $state = webapp_post_history_archives_state();
        $query = array_merge(array(
            'call' => 'post_history_archives',
            'page' => $state['page'] ?? 1,
        ), $override);
        return G5_ADMIN_URL . '/view.php?' . http_build_query($query);
    }

    function webapp_post_history_archives_reason_label($reason): string
    {
        if ((string) $reason === 'moved') return '게시판 이동';
        if ((string) $reason === 'reused') return '글 번호 재사용';
        return '게시글 삭제';
    }

    function webapp_post_history_archives_diff_html(string $before, string $after): string
    {
        if (strlen($before) + strlen($after) > 1000000
            || substr_count($before, "\n") > 5000 || substr_count($after, "\n") > 5000) {
            return '<p class="pha-muted">본문이 커서 이 화면에서 diff를 만들지 않았습니다. 아래 버전 원문을 각각 확인해 주세요.</p>';
        }
        $beforeLines = explode("\n", str_replace("\r\n", "\n", $before));
        $afterLines = explode("\n", str_replace("\r\n", "\n", $after));
        $prefix = 0;
        while ($prefix < count($beforeLines) && $prefix < count($afterLines)
            && $beforeLines[$prefix] === $afterLines[$prefix]) $prefix++;
        $suffix = 0;
        while ($suffix < count($beforeLines) - $prefix && $suffix < count($afterLines) - $prefix
            && $beforeLines[count($beforeLines) - $suffix - 1] === $afterLines[count($afterLines) - $suffix - 1]) $suffix++;

        $out = '<div class="pha-diff" role="region" aria-label="본문 변경 내용">';
        for ($i = 0; $i < $prefix; $i++) {
            $out .= '<div class="same"><span> </span><code>' . webapp_post_history_archives_escape($beforeLines[$i] ?: ' ') . '</code></div>';
        }
        for ($i = $prefix; $i < count($beforeLines) - $suffix; $i++) {
            $out .= '<div class="removed"><span>−</span><code>' . webapp_post_history_archives_escape($beforeLines[$i] ?: ' ') . '</code></div>';
        }
        for ($i = $prefix; $i < count($afterLines) - $suffix; $i++) {
            $out .= '<div class="added"><span>+</span><code>' . webapp_post_history_archives_escape($afterLines[$i] ?: ' ') . '</code></div>';
        }
        for ($i = $suffix; $i > 0; $i--) {
            $line = $beforeLines[count($beforeLines) - $i];
            $out .= '<div class="same"><span> </span><code>' . webapp_post_history_archives_escape($line ?: ' ') . '</code></div>';
        }
        return $out . '</div>';
    }

    function webapp_post_history_archives_page($arrQuery, $token)
    {
        $state = webapp_post_history_archives_state();
        if (!$state) {
            echo '<p style="padding:16px">보관함 정보를 불러오지 못했습니다.</p>';
            return;
        }
        $e = 'webapp_post_history_archives_escape';
        ?>
<style>
  .pha { padding:16px; }
  .pha .lead { color:#666; margin:0 0 14px; }
  .pha .notice { padding:10px 12px; margin-bottom:14px; background:#fff8e1; border:1px solid #ffe082; border-radius:5px; line-height:1.6; }
  .pha table { width:100%; border-collapse:collapse; font-size:13px; }
  .pha th,.pha td { border:1px solid #ddd; padding:8px; vertical-align:top; }
  .pha th { background:#f5f5f5; text-align:left; white-space:nowrap; }
  .pha .muted { color:#888; }
  .pha .pager { margin:14px 0; }
  .pha .pager a { display:inline-block; padding:4px 8px; margin-right:4px; border:1px solid #ddd; }
  .pha .history { margin:18px 0; padding:14px; border:1px solid #ddd; border-radius:5px; }
  .pha .versions { display:grid; gap:8px; margin:12px 0; }
  .pha details { border:1px solid #ddd; border-radius:4px; padding:9px 12px; }
  .pha summary { cursor:pointer; font-weight:600; }
  .pha pre { overflow:auto; max-height:55vh; padding:12px; background:#f7f7f7; white-space:pre-wrap; word-break:break-word; }
  .pha .compare { display:flex; flex-wrap:wrap; gap:8px; align-items:end; margin:12px 0; }
  .pha .compare label { display:grid; gap:4px; }
  .pha .compare select { min-width:180px; }
  .pha .panes { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .pha-diff { max-height:65vh; overflow:auto; border:1px solid #ddd; font:12px/1.6 monospace; }
  .pha-diff div { display:flex; min-width:max-content; padding:0 8px; }
  .pha-diff span { flex:0 0 18px; user-select:none; }
  .pha-diff code { white-space:pre; }
  .pha-diff .removed { background:#fdecec; color:#a11; }
  .pha-diff .added { background:#e8f5e9; color:#176b2c; }
  @media (max-width:760px) { .pha .panes { grid-template-columns:1fr; } .pha { padding:10px; overflow:auto; } }
</style>
<div class="pha">
  <p class="lead">삭제·이동된 매뉴얼 게시글 이력 보관함 · 현재 로그인한 계정이 관리할 수 있는 게시판의 이력만 표시합니다.</p>
  <div class="notice">보관된 본문에는 삭제된 내용이 포함될 수 있습니다. 보관함 접근은 게시판·그룹·최고관리자 권한으로 제한되며, 일반 게시글 이력 API에는 보관본을 반환하지 않습니다.</div>

  <?php if ($state['archive_uuid'] !== '') { ?>
    <section class="history">
      <p><a href="<?php echo $e(webapp_post_history_archives_url(array('archive' => null, 'page' => 1))); ?>">← 보관함 목록</a></p>
      <?php $first = $state['revisions'][0]; $last = end($state['revisions']); ?>
      <h2><?php echo $e($last['wr_subject']); ?></h2>
      <p class="muted"><?php echo $e($first['bo_table']); ?>/<?php echo (int) $first['wr_id']; ?> · <?php echo $e(webapp_post_history_archives_reason_label($last['archive_reason'])); ?> · 보관 <?php echo $e($last['archived_at']); ?>
        <?php if ($last['archive_target_bo_table'] !== '') { ?> · 이동 대상 <?php echo $e($last['archive_target_bo_table']); ?><?php } ?>
      </p>

      <?php if (count($state['revisions']) > 1) { ?>
      <form class="compare" method="get" action="<?php echo $e(G5_ADMIN_URL . '/view.php'); ?>">
        <input type="hidden" name="call" value="post_history_archives">
        <input type="hidden" name="archive" value="<?php echo $e($state['archive_uuid']); ?>">
        <label>이전 버전<select name="from">
          <?php foreach ($state['revisions'] as $revision) { ?>
            <option value="<?php echo (int) $revision['rev_id']; ?>" <?php echo (int) ($state['comparison']['from']['rev_id'] ?? $state['default_from_id']) === (int) $revision['rev_id'] ? 'selected' : ''; ?>>v<?php echo (int) $revision['rev_no']; ?> · <?php echo $e($revision['event']); ?> · <?php echo $e($revision['created_at']); ?></option>
          <?php } ?>
        </select></label>
        <label>이후 버전<select name="to">
          <?php foreach ($state['revisions'] as $revision) { ?>
            <option value="<?php echo (int) $revision['rev_id']; ?>" <?php echo (int) ($state['comparison']['to']['rev_id'] ?? $state['default_to_id']) === (int) $revision['rev_id'] ? 'selected' : ''; ?>>v<?php echo (int) $revision['rev_no']; ?> · <?php echo $e($revision['event']); ?> · <?php echo $e($revision['created_at']); ?></option>
          <?php } ?>
        </select></label>
        <button type="submit" class="btn btn_03">본문 diff 보기</button>
      </form>
      <?php } ?>

      <?php if ($state['comparison']) { ?>
        <h3>본문 변경 내용</h3>
        <?php echo webapp_post_history_archives_diff_html($state['comparison']['from']['wr_content'], $state['comparison']['to']['wr_content']); ?>
      <?php } ?>

      <div class="versions">
        <?php foreach (array_reverse($state['revisions']) as $revision) { ?>
          <details>
            <summary>v<?php echo (int) $revision['rev_no']; ?> · <?php echo $e($revision['event']); ?> · <?php echo $e($revision['actor_name'] !== '' ? $revision['actor_name'] : '작업자 미상'); ?> (<?php echo $e($revision['actor_role']); ?>) · <?php echo $e($revision['source']); ?> · <?php echo $e($revision['created_at']); ?><?php echo $revision['capture_status'] === 'pending' ? ' · 미확정 저장' : ''; ?></summary>
            <?php if ($revision['note'] !== '') { ?><p><?php echo $e($revision['note']); ?></p><?php } ?>
            <p><strong><?php echo $e($revision['wr_subject']); ?></strong></p>
            <pre><?php echo $e($revision['wr_content']); ?></pre>
          </details>
        <?php } ?>
      </div>
    </section>
  <?php } ?>

  <?php if (!$state['items']) { ?>
    <p class="empty_table">보관된 게시글 이력이 없습니다.</p>
  <?php } else { ?>
    <table>
      <thead><tr><th>게시글</th><th>원본 게시판</th><th>버전</th><th>보관 사유</th><th>보관 시각</th><th>이동 대상</th></tr></thead>
      <tbody>
      <?php foreach ($state['items'] as $item) { ?>
        <tr>
          <td><a href="<?php echo $e(webapp_post_history_archives_url(array('archive' => $item['history_uuid']))); ?>"><?php echo $e($item['wr_subject'] !== '' ? $item['wr_subject'] : '(제목 없음)'); ?></a><br><span class="muted">wr_id <?php echo (int) $item['wr_id']; ?></span></td>
          <td><?php echo $e($item['bo_table']); ?></td>
          <td><?php echo (int) $item['version_count']; ?>개</td>
          <td><?php echo $e(webapp_post_history_archives_reason_label($item['archive_reason'])); ?></td>
          <td><?php echo $e($item['archived_at']); ?></td>
          <td><?php echo $e($item['archive_target_bo_table'] !== '' ? $item['archive_target_bo_table'] : '—'); ?></td>
        </tr>
      <?php } ?>
      </tbody>
    </table>
  <?php } ?>

  <?php if ($state['total_pages'] > 1) { ?>
    <div class="pager">
      <?php for ($page = max(1, $state['page'] - 5), $end = min($state['total_pages'], $page + 9); $page <= $end; $page++) { ?>
        <a href="<?php echo $e(webapp_post_history_archives_url(array('page' => $page, 'archive' => null))); ?>" <?php echo $page === $state['page'] ? 'aria-current="page"' : ''; ?>><?php echo $page; ?></a>
      <?php } ?>
    </div>
  <?php } ?>
</div>
        <?php
    }
}

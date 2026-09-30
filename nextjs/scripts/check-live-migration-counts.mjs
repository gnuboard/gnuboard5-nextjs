import { spawnSync } from 'node:child_process';
import {
  liveAppUrl,
  liveDeployWebRoot as requireLiveDeployWebRoot,
  liveExpectedApiUrl,
} from './lib/live-env.mjs';

const appUrl = liveAppUrl('check-live-migration-counts');
const apiUrl = liveExpectedApiUrl(appUrl);
const sshHost = process.env.LIVE_DEPLOY_HOST || '';
const sshUser = process.env.LIVE_DEPLOY_USER || '';
const sshPort = process.env.LIVE_DEPLOY_PORT || '22';
const sshKey = process.env.LIVE_DEPLOY_SSH_KEY || '';
const sshConnectTimeout = process.env.LIVE_DEPLOY_SSH_CONNECT_TIMEOUT || '10';
const liveWebRoot = requireLiveDeployWebRoot('check-live-migration-counts');
const phpBin = process.env.LIVE_DEPLOY_PHP_BIN || 'php';

const checks = [];

function fail(message, details = undefined) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function record(area, name, ok, detail, hint = '') {
  checks.push({
    area,
    name,
    status: ok ? 'ok' : 'fail',
    detail: detail || '',
    hint: ok ? '' : hint,
  });
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function sshTarget() {
  if (!sshHost) return '';
  return sshUser && !sshHost.includes('@') ? `${sshUser}@${sshHost}` : sshHost;
}

function sshArgs() {
  const args = ['-o', 'BatchMode=yes', '-o', `ConnectTimeout=${sshConnectTimeout}`];
  if (sshKey) {
    args.push('-i', sshKey);
  }
  args.push('-p', sshPort, sshTarget());
  return args;
}

function apiAbsoluteUrl(path) {
  return `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(apiAbsoluteUrl(path), {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    redirect: 'manual',
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    fail(`API request failed: ${path}`, {
      status: response.status,
      message: payload?.message || text.slice(0, 160) || response.statusText,
      payload,
    });
  }

  return payload;
}

function listData(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

function metaTotal(payload) {
  const value = payload?.meta?.total ?? payload?.data?.meta?.total;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function flattenCategories(categories) {
  const flat = [];
  const stack = Array.isArray(categories) ? [...categories] : [];
  while (stack.length > 0) {
    const category = stack.shift();
    if (!category) continue;
    flat.push(category);
    if (Array.isArray(category.children)) {
      stack.push(...category.children);
    }
  }
  return flat;
}

async function publicApiCounts() {
  const boardsPayload = await fetchJson('/boards');
  const boards = listData(boardsPayload);
  let boardPosts = 0;

  for (const board of boards) {
    const boTable = String(board.bo_table || '');
    if (!boTable) continue;
    const postsPayload = await fetchJson(`/boards/${encodeURIComponent(boTable)}/posts?per_page=1`);
    boardPosts += metaTotal(postsPayload) ?? 0;
  }

  const contentPayload = await fetchJson('/content');
  const faqPayload = await fetchJson('/faqs?per_page=1');
  const faqMasters = Array.isArray(faqPayload.data?.masters) ? faqPayload.data.masters : [];
  let faqItems = 0;
  for (const master of faqMasters) {
    const fmId = String(master.fm_id || '');
    if (!fmId) continue;
    const masterPayload = await fetchJson(`/faqs?fm_id=${encodeURIComponent(fmId)}&per_page=1`);
    faqItems += Number(masterPayload.data?.meta?.total ?? 0);
  }

  const pollsPayload = await fetchJson('/polls?per_page=1');
  const productsPayload = await fetchJson('/shop/products?per_page=1');
  const categoriesPayload = await fetchJson('/shop/categories');
  const reviewsPayload = await fetchJson('/shop/reviews?per_page=1');
  const qnaPayload = await fetchJson('/shop/reviews/qna?per_page=1');
  const eventsPayload = await fetchJson('/shop/events');

  return {
    boards: boards.length,
    board_posts: boardPosts,
    content_pages: listData(contentPayload).length,
    faq_masters: faqMasters.length,
    faq_items: faqItems,
    polls: metaTotal(pollsPayload) ?? listData(pollsPayload).length,
    products_public: metaTotal(productsPayload) ?? listData(productsPayload).length,
    categories_public: flattenCategories(listData(categoriesPayload)).length,
    reviews_public: metaTotal(reviewsPayload) ?? listData(reviewsPayload).length,
    qna_public: metaTotal(qnaPayload) ?? listData(qnaPayload).length,
    events_public: listData(eventsPayload).length,
  };
}

function remoteDbSnapshot() {
  const target = sshTarget();
  if (!target) {
    fail('LIVE_DEPLOY_HOST is required for DB migration count checks');
  }
  if (!liveWebRoot) {
    fail('LIVE_DEPLOY_WEB_ROOT is required for DB migration count checks');
  }

  const php = `<?php
error_reporting(E_ALL & ~E_NOTICE & ~E_WARNING);
$webRoot = getenv('WEB_ROOT') ?: getcwd();
chdir($webRoot);
require_once $webRoot . '/common.php';
require_once $webRoot . '/api/lib/DB.php';

function count_query($sql, $params = array()) {
    return DB::count($sql, $params);
}

function table_name($key) {
    return DB::table($key);
}

function table_exists($table) {
    return count_query(
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        array($table)
    ) > 0;
}

function write_count($boTable, $isComment) {
    $table = DB::writeTable($boTable);
    if (!table_exists($table)) {
        return 0;
    }
    return count_query(
        "SELECT COUNT(*) FROM {$table} WHERE wr_is_comment = ? AND (wr_10 IS NULL OR wr_10 <> 'report_hidden')",
        array($isComment ? 1 : 0)
    );
}

$boardTable = table_name('board_table');
$boards = DB::fetchAll("SELECT bo_table FROM {$boardTable} ORDER BY bo_table ASC");
$boardPosts = 0;
$boardComments = 0;
foreach ($boards as $board) {
    $boTable = (string) ($board['bo_table'] ?? '');
    if ($boTable === '') {
        continue;
    }
    $boardPosts += write_count($boTable, false);
    $boardComments += write_count($boTable, true);
}

$itemTable = table_name('g5_shop_item_table');
$categoryTable = table_name('g5_shop_category_table');
$reviewTable = table_name('g5_shop_item_use_table');
$qnaTable = table_name('g5_shop_item_qa_table');
$eventTable = table_name('g5_shop_event_table');
$memberTable = table_name('member_table');
$orderTable = table_name('g5_shop_order_table');

$snapshot = array(
    'boards' => count($boards),
    'board_posts' => $boardPosts,
    'board_comments' => $boardComments,
    'content_pages' => count_query('SELECT COUNT(*) FROM ' . table_name('content_table')),
    'faq_masters' => count_query('SELECT COUNT(*) FROM ' . table_name('faq_master_table')),
    'faq_items' => count_query('SELECT COUNT(*) FROM ' . table_name('faq_table')),
    'polls' => count_query('SELECT COUNT(*) FROM ' . table_name('poll_table')),
    'products_public' => count_query("SELECT COUNT(*) FROM {$itemTable} WHERE it_use = '1' AND it_soldout != '1'"),
    'categories_public' => count_query("SELECT COUNT(*) FROM {$categoryTable} WHERE ca_use = '1'"),
    'reviews_public' => count_query("SELECT COUNT(*) FROM {$reviewTable} WHERE is_confirm = '1'"),
    'qna_public' => count_query("SELECT COUNT(*) FROM {$qnaTable}"),
    'events_public' => count_query("SELECT COUNT(*) FROM {$eventTable} WHERE ev_use = '1'"),
    'members_total' => count_query("SELECT COUNT(*) FROM {$memberTable}"),
    'orders_total' => count_query("SELECT COUNT(*) FROM {$orderTable}"),
);

echo json_encode(array('success' => true, 'data' => $snapshot), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
`;

  const command = `cd ${quote(liveWebRoot)} && WEB_ROOT=${quote(liveWebRoot)} ${phpBin}`;
  const result = spawnSync('ssh', [...sshArgs(), `bash -lc ${quote(command)}`], {
    input: php,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) {
    fail(`ssh failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail('remote DB snapshot command failed', {
      status: result.status,
      stderr: result.stderr.trim(),
      stdout: result.stdout.trim().slice(0, 500),
    });
  }

  const raw = result.stdout.trim();
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    fail('remote DB snapshot did not return JSON', {
      stdout: raw.slice(0, 500),
      stderr: result.stderr.trim(),
    });
  }
  if (!payload?.success || !payload.data) {
    fail('remote DB snapshot returned an unsuccessful payload', payload);
  }
  return payload.data;
}

function compareCounts(dbCounts, apiCounts) {
  const comparable = [
    ['boards', 'boards'],
    ['board_posts', 'board posts'],
    ['content_pages', 'content pages'],
    ['faq_masters', 'FAQ groups'],
    ['faq_items', 'FAQ items'],
    ['polls', 'polls'],
    ['products_public', 'public products'],
    ['categories_public', 'public categories'],
    ['reviews_public', 'public product reviews'],
    ['qna_public', 'product Q&A'],
    ['events_public', 'public shop events'],
  ];

  for (const [key, label] of comparable) {
    const dbValue = Number(dbCounts[key] ?? 0);
    const apiValue = Number(apiCounts[key] ?? 0);
    record(
      'migration counts',
      label,
      dbValue === apiValue,
      `db=${dbValue} api=${apiValue}`,
      `${key} count differs between live DB and API`
    );
  }

  record(
    'migration counts',
    'board comments DB-only',
    Number(dbCounts.board_comments ?? 0) >= 0,
    `db=${Number(dbCounts.board_comments ?? 0)}`,
    'comments are reported DB-only because there is no aggregate public comments endpoint'
  );
  for (const [key, label] of [
    ['members_total', 'members DB-only'],
    ['orders_total', 'orders DB-only'],
  ]) {
    record(
      'migration counts',
      label,
      Number(dbCounts[key] ?? 0) >= 0,
      `db=${Number(dbCounts[key] ?? 0)}`,
      'administrator aggregate APIs are disabled in the user-only Next.js project'
    );
  }
}

try {
  const [dbCounts, publicCounts] = await Promise.all([
    Promise.resolve().then(remoteDbSnapshot),
    publicApiCounts(),
  ]);
  compareCounts(dbCounts, publicCounts);
} catch (error) {
  record(
    'migration counts',
    'unexpected error',
    false,
    error.message,
    error.details ? JSON.stringify(error.details) : ''
  );
}

console.table(
  checks.map(({ area, name, status, detail }) => ({
    area,
    check: name,
    status,
    detail,
  }))
);

const failures = checks.filter((check) => check.status === 'fail');
if (failures.length > 0) {
  console.error(`[check-live-migration-counts] ${failures.length} issue(s) found for ${appUrl}`);
  for (const failure of failures) {
    console.error(`- [${failure.area}] ${failure.name}: ${failure.detail}`);
    if (failure.hint) {
      console.error(`  hint: ${failure.hint}`);
    }
  }
  process.exit(1);
}

console.log(`[check-live-migration-counts] live DB/API migration counts passed for ${appUrl}`);

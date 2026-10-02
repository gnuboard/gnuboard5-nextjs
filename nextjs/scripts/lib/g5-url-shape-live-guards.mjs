import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function checkLiveAndApiGuards({
  repoRoot,
  themeName,
  isDefaultTheme,
  fail,
  sources,
}) {
  const THEME_NAME = themeName;
  const IS_DEFAULT_THEME = isDefaultTheme;
  const isPublicPackage = existsSync(join(repoRoot, '..', 'overlay')) && !existsSync(join(repoRoot, '..', 'api'));
  if (isPublicPackage) {
    return;
  }

  const localRuntimeCheckPath = join(repoRoot, 'scripts/check-local-runtime.mjs');
  const liveDeploymentCheckPath = join(repoRoot, 'scripts/check-live-deployment.mjs');
  const liveLegacyAdminCheckPath = join(repoRoot, 'scripts/check-live-legacy-admin.mjs');
  const liveYoungcartOrderCheckPath = join(repoRoot, 'scripts/check-live-youngcart-order-flow.mjs');
  const liveMigrationSampleCheckPath = join(repoRoot, 'scripts/check-live-migration-sample.mjs');
  const liveMigrationCountsCheckPath = join(repoRoot, 'scripts/check-live-migration-counts.mjs');
  const liveOpsCheckPath = join(repoRoot, 'scripts/check-live-ops.mjs');
  const liveRootHandoffCheckPath = join(repoRoot, 'scripts/check-live-root-handoff.mjs');
  const releaseLiveCheckPath = join(repoRoot, 'scripts/check-release-live.mjs');
  const deployLiveSshPath = join(repoRoot, 'scripts/deploy-live-ssh.mjs');
  const packageLiveDeployPath = join(repoRoot, 'scripts/package-live-deploy.mjs');
  const packageLiveDeployServerScriptsPath = join(
    repoRoot,
    'scripts/lib/live-deploy-server-scripts.mjs'
  );
  const packageLiveDeployServerScriptPartPaths = [
    'scripts/lib/live-deploy-install-script.mjs',
    'scripts/lib/live-deploy-rollback-script.mjs',
    'scripts/lib/live-deploy-activate-theme-script.mjs',
    'scripts/lib/live-deploy-nginx-plan-script.mjs',
    'scripts/lib/live-deploy-root-apply-script.mjs',
    'scripts/lib/live-deploy-root-commands-script.mjs',
    'scripts/lib/live-deploy-verify-script.mjs',
  ].map((file) => join(repoRoot, file));
  // 워크플로 파일 이름은 테마 이름(nextjs_default)이 아니라 브랜드 이름 nextjs25 그대로다(check-deploy-config 과 같은 파일).
  const liveOpsWorkflowPath = join(repoRoot, '..', '.github/workflows/nextjs25-live-ops.yml');
  const packageJsonPath = join(repoRoot, 'package.json');
  const memberProfilePagePath = join(repoRoot, 'src/app/members/[mb_id]/page.tsx');
  const memberProfileClientPath = join(repoRoot, 'src/app/members/[mb_id]/ClientPage.tsx');
  const boardPostPagePath = join(repoRoot, 'src/app/boards/[bo_table]/[wr_id]/page.tsx');
  const memberServicePath = join(repoRoot, 'src/services/member.ts');
  const memberApiPath = join(repoRoot, '..', 'api/v1/members.php');
  const apiHelpersPath = join(repoRoot, '..', 'api/lib/helpers.php');
  const boardsApiPath = join(repoRoot, '..', 'api/v1/boards.php');
  const postsApiPath = join(repoRoot, '..', 'api/v1/posts.php');
  const commentsApiPath = join(repoRoot, '..', 'api/v1/comments.php');
  const searchApiPath = join(repoRoot, '..', 'api/v1/search.php');
  const recentApiPath = join(repoRoot, '..', 'api/v1/recent.php');
  const scrapsApiPath = join(repoRoot, '..', 'api/v1/scraps.php');
  const postFilesApiPath = join(repoRoot, '..', 'api/v1/post-files.php');
  const {
    legacyRouteBridgeSource,
    mypageWishlistPageSource,
    orderDataFlowSource,
    productDetailBridgeSource,
    runtimeConfigSource,
    shopContentPageSource,
    shopWishlistPageSource,
    sitemapSource,
    themeLegacyRoutesSource,
    themeRouteSource,
    themeStaticRoutingSource,
  } = sources;

  function read(path) {
    return readFileSync(path, 'utf8');
  }

// 쇼핑 홈 배너는 ShopHomeBanners.tsx 에 있다(ShopHomeMarketing.tsx 에서 떼어 냄). 클릭 수 집계를 위해 bannerhit.php 로 건다.
const shopHomeBannersSource = read(join(repoRoot, 'src/app/shop/ShopHomeBanners.tsx'));
if (!shopHomeBannersSource.includes('/shop/bannerhit.php?bn_id=')) {
  fail('ShopHomeBanners.tsx must link banners through /shop/bannerhit.php');
}

for (const token of [
  'const directCheckout',
  'directCheckout ? { direct: 1 }',
]) {
  if (!orderDataFlowSource.includes(token)) {
    fail(`shop/order data flow is missing direct checkout guard ${token}`);
  }
}

for (const token of [
  'productDetailTabFromSearch',
  'productDetailFormFromSearch',
  'modal === "recommend"',
  'modal === "restock"',
  'if (!requireLogin()) return;',
  'notifyCartChanged()',
  'initialOpen={legacyProductForm === "review"}',
  'initialOpen={legacyProductForm === "qa"}',
]) {
  if (!productDetailBridgeSource.includes(token)) {
    fail(`product detail components are missing legacy YoungCart query bridge ${token}`);
  }
}

const localRuntimeCheck = `${read(localRuntimeCheckPath)}\n${read(join(repoRoot, 'scripts/lib/local-runtime-defaults.mjs'))}`;
const liveDeploymentCheck = read(liveDeploymentCheckPath);
const liveLegacyAdminCheck = read(liveLegacyAdminCheckPath);
const liveYoungcartOrderCheck = read(liveYoungcartOrderCheckPath);
const liveMigrationSampleCheck = read(liveMigrationSampleCheckPath);
const liveMigrationCountsCheck = read(liveMigrationCountsCheckPath);
const liveOpsCheck = read(liveOpsCheckPath);
const liveRootHandoffCheck = read(liveRootHandoffCheckPath);
const releaseLiveCheck = read(releaseLiveCheckPath);
const deployLiveSshSource = read(deployLiveSshPath);
const packageLiveDeploySource = [
  packageLiveDeployPath,
  packageLiveDeployServerScriptsPath,
  ...packageLiveDeployServerScriptPartPaths,
]
  .map((path) => read(path))
  .join('\n');
const liveOpsWorkflowSource = existsSync(liveOpsWorkflowPath) ? read(liveOpsWorkflowPath) : '';
const packageJsonSource = read(packageJsonPath);
const memberProfilePageSource = read(memberProfilePagePath);
  const memberProfileClientSource = read(memberProfileClientPath);
  const boardPostPageSource = read(boardPostPagePath);
  const memberServiceSource = read(memberServicePath);
  // 자기소개 · 회원 공개 키 라우트는 members.php 가 불러 쓰는 members_profile_routes.php 에 있다.
  const memberApiSource = `${read(memberApiPath)}
${read(join(repoRoot, '..', 'api/v1/members_profile_routes.php'))}`;
  const apiBoardHelpersSource = `${read(apiHelpersPath)}\n${read(join(repoRoot, '..', 'api/lib/board_access_helpers.php'))}`;
  const boardsApiSource = read(boardsApiPath);
// 댓글 응답 모양(비밀댓글 가림 · 세션 열람)은 posts.php 가 불러 쓰는 post_comments_helpers.php 에 있다.
const postsApiSource = `${read(postsApiPath)}
${read(join(repoRoot, '..', 'api/v1/post_comments_helpers.php'))}`;
const commentsApiSource = read(commentsApiPath);
const searchApiSource = read(searchApiPath);
const recentApiSource = read(recentApiPath);
const scrapsApiSource = read(scrapsApiPath);
const postFilesApiSource = read(postFilesApiPath);

if (!packageJsonSource.includes('"check:static-export-guards": "node scripts/check-static-export-guards.mjs"')) {
  fail('package.json is missing check:static-export-guards script');
}

for (const token of [
  'return [{ mb_id: "__g5_static__" }]',
  '<ClientPage mbId={mb_id} />',
]) {
  if (!memberProfilePageSource.includes(token)) {
    fail(`members/[mb_id]/page.tsx is missing static export token ${token}`);
  }
}

for (const token of [
  'function positiveIntEnv',
  'G5_STATIC_POST_PARAM_LIMIT',
  'G5_STATIC_POST_BOARD_LIMIT',
  'G5_STATIC_POST_TOTAL_LIMIT',
  'if (params.length > totalLimit) break;',
]) {
  if (!boardPostPageSource.includes(token)) {
    fail(`boards/[bo_table]/[wr_id]/page.tsx is missing static export budget token ${token}`);
  }
}

for (const token of [
  'useRuntimeRouteParam("mb_id", "/members/:mb_id"',
  'getMemberProfile(profileRef)',
  'getMemberKey(mbId)',
  'ApiError',
  'SafeHtml',
]) {
  if (!memberProfileClientSource.includes(token)) {
    fail(`members/[mb_id]/ClientPage.tsx is missing profile UI token ${token}`);
  }
}

for (const token of [
  '/members/${encodeURIComponent(mbId)}/profile',
  'memberProfileSchema',
]) {
  if (!memberServiceSource.includes(token)) {
    fail(`services/member.ts is missing profile service token ${token}`);
  }
}

for (const token of [
  'GET /v1/members/{key}/profile',
  'Auth::requireAuth()',
  'mb_open',
  'api_member_profile_payload',
]) {
  if (!memberApiSource.includes(token)) {
    fail(`api/v1/members.php is missing profile parity token ${token}`);
  }
}

for (const token of [
  'function api_can_read_board_post',
  'function api_board_group_access_allowed',
  'function api_board_cert_restriction',
  'function api_can_access_board_list',
  'function api_can_write_board_post',
  'function api_board_file_download_url',
  'function api_is_board_read_point_exempt',
  'group_member_table',
  'bo_list_level',
  'bo_read_level',
  'bo_write_level',
  'bo_use_cert',
  "'secret'",
  'download_file_nonce_key',
  'download.php?',
  'wr_ip',
]) {
  if (!apiBoardHelpersSource.includes(token)) {
    fail(`api/lib/helpers.php or board_access_helpers.php is missing board post read-access guard token ${token}`);
  }
}

for (const token of [
  'api_can_read_board_post($viewer, $bo_table, $board, $post)',
  'You do not have permission to read this post.',
  'bf_download_url',
]) {
  if (!postsApiSource.includes(token)) {
    fail(`api/v1/posts.php is missing board post read-access guard token ${token}`);
  }
  if (!postFilesApiSource.includes(token)) {
    fail(`api/v1/post-files.php is missing attachment read-access guard token ${token}`);
  }
}

for (const token of [
  'api_can_access_board_list($viewer, $bt, $board)',
  "if (!$post['is_secret'])",
]) {
  if (!postsApiSource.includes(token)) {
    fail(`api/v1/posts.php is missing latest-posts visibility token ${token}`);
  }
}

for (const token of [
  'set_session($viewSessionName, true)',
  "ss_view_' . $bo_table . '_' . $wr_id",
  'bo_read_point',
  'insert_point(',
  "'읽기'",
  'Not enough points to read this post.',
]) {
  if (!postsApiSource.includes(token)) {
    fail(`api/v1/posts.php is missing Gnuboard download session parity token ${token}`);
  }
}

for (const token of [
  "SELECT * FROM {$write_table}",
  "api_can_read_board_post($member, $bo_table, $board, $post)",
  "api_is_blocked_author(",
  "ss_view_' . $bo_table . '_' . $wr_id",
  'You can recommend this post only after reading it.',
  "ss_secret_comment_' . $bo_table . '_' . $comment['wr_id']",
  "$comment['can_read_secret'] = $canRead;",
]) {
  if (!postsApiSource.includes(token)) {
    fail(`api/v1/posts.php is missing Gnuboard good/nogood visibility token ${token}`);
  }
}

for (const token of [
  'api_can_access_board_list($viewer, $bo_table, $board)',
  'api_can_write_board_post($member, $bo_table, $board)',
  'Secret posts are not enabled in this board.',
  'bo_use_secret',
  'board_new_table',
  'insert_point(',
  "set_session('ss_secret_' . $bo_table . '_' . $wrNum, true)",
  "$post['thumbnail'] = $post['is_secret'] ? ''",
  'Not enough points to write in this board.',
]) {
  if (!boardsApiSource.includes(token)) {
    fail(`api/v1/boards.php is missing Gnuboard board-list/write parity token ${token}`);
  }
}

for (const token of [
  'SELECT * FROM {$write_table}',
  'api_can_read_board_post($member, $bo_table, $board, $parentPost)',
  'api_is_blocked_author(',
  "isset($input['comment_id'])",
  'board_new_table',
  'insert_point(',
  'Not enough points to comment in this board.',
]) {
  if (!commentsApiSource.includes(token)) {
    fail(`api/v1/comments.php is missing Gnuboard comment parity token ${token}`);
  }
}

for (const token of [
  '$canSearchBoard = function',
  'bo_use_search',
  'bo_list_level',
  'api_board_group_access_allowed($viewer',
  "(wr_10 IS NULL OR wr_10 <> 'report_hidden')",
  'api_add_blocked_author_condition($conditions, $params, $viewer)',
  '$post[\'is_secret\'] = $isSecret',
  'wr_content_preview',
]) {
  if (!searchApiSource.includes(token)) {
    fail(`api/v1/search.php is missing Gnuboard search visibility token ${token}`);
  }
}

for (const token of [
  "(w.wr_10 IS NULL OR w.wr_10 <> 'report_hidden')",
  "(p.wr_10 IS NULL OR p.wr_10 <> 'report_hidden')",
  "api_add_blocked_author_condition($conditions, $params, $viewer, 'w')",
  "api_add_blocked_author_condition($conditions, $params, $viewer, 'p')",
  "SELECT wr_id, wr_subject, wr_seo_title, mb_id, wr_name, wr_datetime, wr_10",
  "api_is_blocked_author(",
]) {
  if (!recentApiSource.includes(token)) {
    fail(`api/v1/recent.php is missing recent-post visibility token ${token}`);
  }
}

for (const token of [
  'SELECT *',
  'api_can_read_board_post($me, $boTable, $board, $post)',
  'api_is_blocked_author(',
  "($post['wr_10'] ?? '') === 'report_hidden'",
]) {
  if (!scrapsApiSource.includes(token)) {
    fail(`api/v1/scraps.php is missing scrap target visibility token ${token}`);
  }
}

for (const token of [
  '"members"',
  'RESERVED_ROOTS.has(root)',
  '/^\\/members\\/[^/]+$/',
  '/^\\/shop\\/content\\/[^/]+$/',
]) {
  if (!legacyRouteBridgeSource.includes(token)) {
    fail(`legacy-route-bridge.tsx is missing members reserved-route token ${token}`);
  }
}

for (const token of [
  '/^\\/shop\\/content\\/[^/]+$/',
  '/shop/content/${encodeURIComponent(content.co_id)}',
]) {
  if (!runtimeConfigSource.includes(token) && !sitemapSource.includes(token) && !legacyRouteBridgeSource.includes(token)) {
    fail(`shop content canonical route guard is missing token ${token}`);
  }
}

for (const token of [
  'SHOP_CONTENT_IDS',
  '`/shop/content/${encodeURIComponent(content.co_id)}`',
]) {
  if (!sitemapSource.includes(token)) {
    fail(`sitemap.ts is missing shop content sitemap token ${token}`);
  }
}

if (!sitemapSource.includes('`/shop/list-${encodeURIComponent(c.ca_id)}`')) {
  fail('sitemap.ts must emit canonical /shop/list-{ca_id} category URLs');
}

if (sitemapSource.includes('url(`/shop/categories/${encodeURIComponent(c.ca_id)}`)')) {
  fail('sitemap.ts must not emit non-canonical /shop/categories/{ca_id} category URLs');
}

for (const token of ['DEFAULT_CONTENT_LINKS', '__g5_static__']) {
  if (!shopContentPageSource.includes(token)) {
    fail(`shop/content/[co_id]/page.tsx is missing bounded static content token ${token}`);
  }
}

if (shopContentPageSource.includes('getContentList')) {
  fail('shop/content/[co_id]/page.tsx must not prebuild every content page; use the static fallback for non-footer content');
}

for (const token of [
  "'#^members/[^/]+$#' => 'members/__g5_static__'",
  "'/members'",
]) {
  if (!themeStaticRoutingSource.includes(token)) {
    fail(`theme static route bridge is missing members static route token ${token}`);
  }
}

for (const token of [
  "'content' => true",
  "'#^shop/content/[^/]+$#' => 'shop/content/__g5_static__'",
  'shop/content/company',
  "preg_match('#^shop/content/([0-9a-zA-Z_]+)$#'",
  "'service' => 'shop'",
]) {
  if (
    !themeStaticRoutingSource.includes(token) &&
    !localRuntimeCheck.includes(token) &&
    !themeLegacyRoutesSource.includes(token) &&
    !themeRouteSource.includes(token)
  ) {
    fail(`theme shop content route guard is missing token ${token}`);
  }
}

const requiredRedirects = [
  '/boards/free=>/free',
  '/boards/free/6=>/free/6',
  '/boards/free/write=>/free/write',
  '/boards/free/rss=>/rss/free',
  '/bbs/board.php?bo_table=free&page=2=>/free?page=2',
  '/bbs/board.php?bo_table=free&wr_id=6=>/free/6',
  '/bbs/write.php?bo_table=free=>/free/write',
  '/bbs/content.php?co_id=company=>/content/company',
  '/bbs/content.php?co_id=company&service=shop=>/shop/content/company',
  '/bbs/group.php?gr_id=shop&page=2=>/boards?page=2&group=shop',
  '/bbs/faq.php?fm_id=1=>/faq?fm_id=1',
  '/bbs/new.php?gr_id=shop&page=2=>/recent?gr_id=shop&page=2',
  '/bbs/search.php?stx=delivery&sfl=wr_subject&bo_table=free&page=2=>/search?sfl=wr_subject&bo_table=free&page=2&q=delivery',
  '/bbs/login.php?url=%2Ffree%3Fpage%3D2=>/login?redirect=%2Ffree%3Fpage%3D2',
  '/bbs/login.php?url=%2Fshop%2Fwishlist=>/shop/login?redirect=%2Fshop%2Fwishlist',
  '/bbs/register.php=>/register',
  '/bbs/register_form.php=>/register',
  '/bbs/register_result.php=>/register/result',
  '/bbs/password_lost.php=>/forgot-password',
  '/bbs/poll_result.php?po_id=3=>/polls?po_id=3',
  '/bbs/qalist.php?page=2=>/mypage/qas?page=2',
  '/bbs/qaview.php?qa_id=7=>/mypage/qas/7',
  '/bbs/qawrite.php=>/mypage/qas/new',
  '/bbs/qawrite.php?w=u&qa_id=7=>/mypage/qas/7',
  '/bbs/qawrite.php?w=r&qa_id=7=>/mypage/qas/new?reply_to=7',
  '/bbs/memo.php?kind=send&page=2=>/mypage/memos?page=2&type=send',
  '/bbs/memo_form.php?me_recv_mb_id=demo=>/mypage/memos/new?recv=demo',
  '/bbs/memo_view.php?me_id=9&kind=send=>/mypage/memos/9?type=send',
  '/bbs/profile.php?mb_id=zz_no_member=>/members/zz_no_member',
  '/bbs/point.php=>/mypage/points',
  '/bbs/scrap.php=>/mypage/scraps',
  '/shop/products/1446772772=>/shop/1446772772',
  '/shop/categories/2010101010=>/shop/list-2010101010',
  '/shop/products?it_type1=1=>/shop/type-1',
];

for (const redirect of requiredRedirects) {
  if (!localRuntimeCheck.includes(redirect)) {
    fail(`check-local-runtime.mjs is missing redirect guard ${redirect}`);
  }
}

const liveRedirects = [
  "checkRedirect('/boards/free', '/free')",
  "checkRedirect('/boards/free/6', '/free/6')",
  "checkRedirect('/shop/products/1446772772', '/shop/1446772772')",
  "checkRedirect('/shop/categories/2010101010', '/shop/list-2010101010')",
];

for (const redirect of liveRedirects) {
  if (!liveDeploymentCheck.includes(redirect)) {
    fail(`check-live-deployment.mjs is missing redirect guard ${redirect}`);
  }
}

for (const token of [
  'checkLegacyAdminLogin',
  'single session cookie',
  'session Set-Cookie header(s)',
  "checkPublicAsset('/sitemap-posts.xml'",
  'Sitemap: ${appUrl}/sitemap-posts.xml',
]) {
  if (!liveDeploymentCheck.includes(token)) {
    fail(`check-live-deployment.mjs is missing deployment guard ${token}`);
  }
}

for (const token of [
  '/sitemap-posts.xml',
  'postsSitemapUrl',
]) {
  if (!localRuntimeCheck.includes(token)) {
    fail(`check-local-runtime.mjs is missing posts sitemap guard ${token}`);
  }
}

for (const token of [
  'LIVE_SMOKE_ADMIN_LOGIN_ID',
  'LIVE_SMOKE_ADMIN_LOGIN_PASSWORD',
  '/adm/config_form.php',
  '/adm/member_list.php',
  '/adm/board_list.php',
  '/adm/shop_admin/itemlist.php',
  '/adm/shop_admin/orderlist.php',
  'single session cookie',
]) {
  if (!liveLegacyAdminCheck.includes(token)) {
    fail(`check-live-legacy-admin.mjs is missing original admin guard ${token}`);
  }
}

if (!packageJsonSource.includes('"check:live-legacy-admin": "node scripts/check-live-legacy-admin.mjs"')) {
  fail('package.json is missing check:live-legacy-admin script');
}

if (!releaseLiveCheck.includes("'check:live-legacy-admin'")) {
  fail('check-release-live.mjs is missing check:live-legacy-admin');
}

for (const token of [
  'LIVE_SMOKE_ORDER_MARKER',
  '/shop/orders/lookup',
  'guest order lookup',
  'guest order cancel',
  '/shop/payment/prepare',
  '/shop/payment/cancel',
  'guest payment prepare',
  'guest payment cancel',
  'od_pwd',
  '\\uBB34\\uD1B5\\uC7A5\\uC785\\uAE08',
  '\\uC2E0\\uC6A9\\uCE74\\uB4DC',
]) {
  if (!liveYoungcartOrderCheck.includes(token)) {
    fail(`check-live-youngcart-order-flow.mjs is missing YoungCart order guard ${token}`);
  }
}

if (!packageJsonSource.includes('"check:live-youngcart-order-flow": "node scripts/check-live-youngcart-order-flow.mjs"')) {
  fail('package.json is missing check:live-youngcart-order-flow script');
}

if (!releaseLiveCheck.includes("'check:live-youngcart-order-flow'")) {
  fail('check-release-live.mjs is missing check:live-youngcart-order-flow');
}

for (const token of [
  'LIVE_SMOKE_BOARD_TABLE',
  'LIVE_SMOKE_CONTENT_ID',
  '/boards/',
  '/recent?limit=5',
  '/content/',
  '/shop/products?per_page=8',
  'migration sample',
]) {
  if (!liveMigrationSampleCheck.includes(token)) {
    fail(`check-live-migration-sample.mjs is missing migration sample guard ${token}`);
  }
}

if (!packageJsonSource.includes('"check:live-migration-sample": "node scripts/check-live-migration-sample.mjs"')) {
  fail('package.json is missing check:live-migration-sample script');
}

if (!releaseLiveCheck.includes("'check:live-migration-sample'")) {
  fail('check-release-live.mjs is missing check:live-migration-sample');
}

for (const token of [
  'LIVE_DEPLOY_HOST',
  'LIVE_DEPLOY_WEB_ROOT',
  'remoteDbSnapshot',
  'board_comments',
  'members DB-only',
  'orders DB-only',
]) {
  if (!liveMigrationCountsCheck.includes(token)) {
    fail(`check-live-migration-counts.mjs is missing migration count guard ${token}`);
  }
}

if (!packageJsonSource.includes('"check:live-migration-counts": "node scripts/check-live-migration-counts.mjs"')) {
  fail('package.json is missing check:live-migration-counts script');
}

for (const token of [
  '--strict',
  '--continue-on-failure',
  '--include-browser',
  '--include-mutating',
  'LIVE_ROOT_HANDOFF_IGNORE_SOURCE_DRIFT',
  'LIVE_ROOT_HANDOFF_LIVE_ONLY',
  'lastOutputLines',
  'check:live-root-handoff',
  'check:live-migration-counts',
  'GITHUB_STEP_SUMMARY',
]) {
  if (!liveOpsCheck.includes(token)) {
    fail(`check-live-ops.mjs is missing live ops guard ${token}`);
  }
}

for (const token of [
  '"check:live-ops": "node scripts/check-live-ops.mjs"',
  '"check:live-ops:strict": "node scripts/check-live-ops.mjs --strict --continue-on-failure"',
  '"check:live-ops:full": "node scripts/check-live-ops.mjs --strict --continue-on-failure --full"',
]) {
  if (!packageJsonSource.includes(token)) {
    fail(`package.json is missing live ops script ${token}`);
  }
}

if (IS_DEFAULT_THEME || liveOpsWorkflowSource !== '') {
  for (const token of [
    'workflow_dispatch:',
    "cron: '17 4 * * *'",
    'timezone: "Asia/Seoul"',
    'LIVE_SSH_PRIVATE_KEY',
    'LIVE_DEPLOY_NGINX_DUMP_COMMAND',
    'Show live ops configuration',
    'Test live SSH',
    'actions/checkout@v5',
    'actions/setup-node@v6',
    'npm run check:live-ops -- "${args[@]}"',
  ]) {
    if (!liveOpsWorkflowSource.includes(token)) {
      fail(`nextjs25-live-ops.yml is missing workflow guard ${token}`);
    }
  }
}

if (!packageLiveDeploySource.includes("'common.php'")) {
  fail('package-live-deploy.mjs must include common.php in rootPatchFiles for session cookie fixes');
}

for (const token of [
  'make_temp_output()',
  'NGINX_TEST_OUTPUT="$(make_temp_output nginx-test)"',
  'NGINX_DUMP_ERROR="$(make_temp_output nginx-dump-err)"',
  'nginx config dump failed; see $NGINX_DUMP_ERROR',
  'assertNoForbiddenLiveStaticOrigins',
  'http://localhost',
  'Live package contains local development origins',
]) {
  if (!packageLiveDeploySource.includes(token)) {
    fail(`package-live-deploy.mjs is missing required live package guard ${token}`);
  }
}

for (const [label, source] of [
  ['shop/wishlist/page.tsx', shopWishlistPageSource],
  ['mypage/wishlist/page.tsx', mypageWishlistPageSource],
]) {
  if (!source.includes('notifyCartChanged()')) {
    fail(`${label} must notify the header cart badge after adding wishlist items to cart`);
  }
}

for (const token of ['wishlistCartBlockReason', 'canAddWishlistItemToCart']) {
  if (!mypageWishlistPageSource.includes(token)) {
    fail(`mypage/wishlist/page.tsx is missing wishlist cart block guard ${token}`);
  }
}

for (const token of [
  'LIVE_DEPLOY_NGINX_TEST_COMMAND',
  'LIVE_DEPLOY_NGINX_DUMP_COMMAND',
  'NGINX_DUMP_COMMAND: nginxDumpCommand',
]) {
  if (!deployLiveSshSource.includes(token)) {
    fail(`deploy-live-ssh.mjs is missing nginx command override guard ${token}`);
  }
}

if (!liveRootHandoffCheck.includes("'common.php'")) {
  fail('check-live-root-handoff.mjs must include common.php in the package source snapshot');
}

for (const token of [
  'LIVE_DEPLOY_NGINX_DUMP_COMMAND',
  'LIVE_ROOT_HANDOFF_IGNORE_SOURCE_DRIFT',
  'LIVE_ROOT_HANDOFF_LIVE_ONLY',
  'local archive comparison',
  'nginx loaded config dump',
  'location = /api/index.php',
]) {
  if (!liveRootHandoffCheck.includes(token)) {
    fail(`check-live-root-handoff.mjs is missing loaded nginx config guard ${token}`);
  }
}

if (
  IS_DEFAULT_THEME &&
  !(
    liveRootHandoffCheck.includes(`location = /theme/${THEME_NAME}/route.php`) ||
    liveRootHandoffCheck.includes('location = /theme/${THEME_NAME}/route.php')
  )
) {
  fail(`check-live-root-handoff.mjs is missing loaded nginx config guard location = /theme/${THEME_NAME}/route.php`);
}

for (const token of [
  "'app/sitemap-posts.xml'",
  '${THEME_NAME} posts sitemap',
]) {
  if (!packageLiveDeploySource.includes(token)) {
    fail(`package-live-deploy.mjs is missing posts sitemap package guard ${token}`);
  }
}

const requiredRscPayloads = [
  '/shop/products/1446772772.txt=>/shop/1446772772',
  '/shop/1446772772.txt=>/shop/1446772772',
  '/shop/list-2010101010.txt=>/shop/list-2010101010',
  '/shop/type-1.txt=>/shop/type-1',
  '/shop/reviews.txt=>/shop/reviews',
  '/shop/qas.txt=>/shop/qas',
  '/shop/search.txt=>/shop/search',
  '/shop/largeimage.txt=>/shop/largeimage',
];

for (const payload of requiredRscPayloads) {
  if (!localRuntimeCheck.includes(payload)) {
    fail(`check-local-runtime.mjs is missing RSC payload guard ${payload}`);
  }
  if (!liveDeploymentCheck.includes(payload)) {
    fail(`check-live-deployment.mjs is missing RSC payload guard ${payload}`);
  }
}
}

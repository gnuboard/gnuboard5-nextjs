import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import * as ts from 'typescript';

export function checkShortUrlShape({
  repoRoot,
  themeName,
  themeUpperToken,
  themePhpPrefix,
  themeAppShellPath,
  passthroughParam,
  fail,
}) {
  const THEME_NAME = themeName;
  const sourcePath = join(repoRoot, 'src/lib/g5-short-url.ts');

  function read(path) {
    return readFileSync(path, 'utf8');
  }

function loadShortUrlModule() {
  const source = read(sourcePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  });

  const diagnostics = output.diagnostics ?? [];
  if (diagnostics.length > 0) {
    const detail = diagnostics.map((item) => item.messageText).join('; ');
    fail(`failed to transpile g5-short-url.ts: ${detail}`);
  }

  const module = { exports: {} };
  const moduleCache = new Map();

  function loadTranspiledTs(modulePath, label) {
    if (moduleCache.has(modulePath)) return moduleCache.get(modulePath);

    const moduleOutput = ts.transpileModule(read(modulePath), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: modulePath,
      reportDiagnostics: true,
    });
    const moduleDiagnostics = moduleOutput.diagnostics ?? [];
    if (moduleDiagnostics.length > 0) {
      const detail = moduleDiagnostics.map((item) => item.messageText).join('; ');
      fail(`failed to transpile ${label}: ${detail}`);
    }

    const loadedModule = { exports: {} };
    moduleCache.set(modulePath, loadedModule.exports);
    vm.runInNewContext(moduleOutput.outputText, {
      module: loadedModule,
      exports: loadedModule.exports,
      require: sandboxRequire,
      URLSearchParams,
    }, {
      filename: modulePath,
    });
    moduleCache.set(modulePath, loadedModule.exports);
    return loadedModule.exports;
  }

  function sandboxRequire(id) {
    if (id === '@/lib/config') {
      return {
        appUrl(path) {
          return `https://example.com${path}`;
        },
        g5PathForRuntime(path) {
          return path;
        },
        stripG5BasePath(path) {
          return path;
        },
      };
    }

    if (id === '@/lib/g5-short-url-rules') {
      return loadTranspiledTs(
        join(repoRoot, 'src/lib/g5-short-url-rules.ts'),
        'g5-short-url-rules.ts'
      );
    }

    if (id === '@/lib/g5-short-url-utils') {
      return loadTranspiledTs(
        join(repoRoot, 'src/lib/g5-short-url-utils.ts'),
        'g5-short-url-utils.ts'
      );
    }

    throw new Error(`unexpected require: ${id}`);
  }

  const sandbox = {
    module,
    exports: module.exports,
    require: sandboxRequire,
    URLSearchParams,
  };

  vm.runInNewContext(output.outputText, sandbox, {
    filename: sourcePath,
  });

  return module.exports;
}

function expectEqual(name, actual, expected) {
  if (actual !== expected) {
    fail(`${name} produced ${actual}, expected ${expected}`);
  }
}

function phpSingleQuoted(value) {
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function checkPhpShortPathCases(casesToCheck) {
  const php = `
define('_GNUBOARD_', true);
define('G5_URL', 'https://example.com');
define('G5_THEME_PATH', ${phpSingleQuoted(join(repoRoot, '..', `theme/${THEME_NAME}`))});
define('G5_THEME_URL', ${phpSingleQuoted(`https://example.com/theme/${THEME_NAME}`)});
define('${themeUpperToken}_G5_URL', 'https://example.com');
define('${themeUpperToken}_THEME_URL', ${phpSingleQuoted(`https://example.com/theme/${THEME_NAME}`)});
$_SERVER['REQUEST_URI'] = '/';
require ${phpSingleQuoted(themeAppShellPath)};
$cases = json_decode(${phpSingleQuoted(JSON.stringify(casesToCheck))}, true);
if (!is_array($cases)) {
    fwrite(STDERR, "failed to decode PHP short-path cases\\n");
    exit(1);
}
foreach ($cases as $case) {
    $actual = ${themePhpPrefix}_short_path($case[0]);
    if ($actual !== $case[1]) {
        fwrite(STDERR, json_encode(array(
            'input' => $case[0],
            'actual' => $actual,
            'expected' => $case[1],
        ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\\n");
        exit(1);
    }
}
`;

  const result = spawnSync('php', ['-r', php], {
    cwd: join(repoRoot, '..'),
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    fail(
      `theme app-shell.php ${themePhpPrefix}_short_path PHP parity failed: ${
        (result.stderr || result.stdout || `exit ${result.status}`).trim()
      }`
    );
  }
}

const { appShortUrl, g5ShortHref, toG5ShortPath } = loadShortUrlModule();
if (
  typeof toG5ShortPath !== 'function' ||
  typeof g5ShortHref !== 'function' ||
  typeof appShortUrl !== 'function'
) {
  fail('g5-short-url exports are missing');
}

const cases = [
  ['/boards/free', '/free'],
  ['/boards/free?sca=notice#top', '/free?sca=notice#top'],
  ['/boards/free/6', '/free/6'],
  ['/boards/free/6?comment=1#reply', '/free/6?comment=1#reply'],
  ['/boards/free/test-long-content-sample/', '/free/test-long-content-sample/'],
  ['/boards/free/%EC%95%88%EB%85%95%ED%95%98%EC%84%B8%EC%9A%94/', '/free/%EC%95%88%EB%85%95%ED%95%98%EC%84%B8%EC%9A%94/'],
  ['/boards/free/write', '/free/write'],
  ['/boards/free/rss', '/rss/free'],
  ['/mobile', '/'],
  ['/mobile/', '/'],
  ['/mobile/index.php?device=mobile', '/?device=mobile'],
  ['/mobile/group.php?gr_id=shop&page=2', '/boards?page=2&group=shop'],
  ['/mobile/group.php?page=2', '/boards?page=2'],
  ['/mobile/content.php?co_id=company&page=2', '/content/company?page=2'],
  ['/mobile/content.php?co_id=company&service=shop&page=2', '/shop/content/company?page=2'],
  ['/mobile/content.php?co_seo_title=%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C', '/content/%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C/'],
  [
    '/mobile/content.php?co_seo_title=%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C&service=shop',
    '/shop/content/%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C/',
  ],
  ['/bbs/board.php?bo_table=free&page=2', '/free?page=2'],
  ['/bbs/board.php?bo_table=free&wr_id=6&page=2#reply', '/free/6?page=2#reply'],
  ['/bbs/board.php?bo_table=free&wr_seo_title=hello-world&page=2', '/free/hello-world/?page=2'],
  ['/bbs/write.php?bo_table=free&w=u&wr_id=6', '/free/write?w=u&wr_id=6'],
  ['/bbs/content.php?co_id=company&page=2', '/content/company?page=2'],
  ['/bbs/content.php?co_id=company&service=shop&page=2', '/shop/content/company?page=2'],
  ['/bbs/content.php?co_seo_title=%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C', '/content/%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C/'],
  [
    '/bbs/content.php?co_seo_title=%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C&service=shop',
    '/shop/content/%ED%9A%8C%EC%82%AC%EC%86%8C%EA%B0%9C/',
  ],
  ['/bbs/group.php?gr_id=shop&page=2', '/boards?page=2&group=shop'],
  ['/bbs/faq.php?fm_id=1&stx=delivery', '/faq?fm_id=1&stx=delivery'],
  ['/bbs/new.php?gr_id=shop&view=w&page=2', '/recent?gr_id=shop&view=w&page=2'],
  [
    '/bbs/search.php?stx=delivery&sfl=wr_subject&bo_table=free&page=2',
    '/search?sfl=wr_subject&bo_table=free&page=2&q=delivery',
  ],
  ['/bbs/login.php?url=%2Ffree%3Fpage%3D2', '/login?redirect=%2Ffree%3Fpage%3D2'],
  ['/bbs/login.php?url=%2Fshop%2Fwishlist', '/shop/login?redirect=%2Fshop%2Fwishlist'],
  ['/bbs/login.php?url=https%3A%2F%2Fevil.example&foo=bar', '/login?foo=bar'],
  ['/bbs/register.php', '/register'],
  ['/bbs/register_form.php?next=agreement', '/register?next=agreement'],
  ['/bbs/register_result.php', '/register/result'],
  ['/bbs/password_lost.php', '/forgot-password'],
  ['/bbs/poll_result.php?po_id=3&page=2', '/polls?po_id=3&page=2'],
  ['/bbs/qalist.php?page=2&sca=shipping&stx=delivery&sfl=qa_subject', '/mypage/qas?page=2&sca=shipping&stx=delivery&sfl=qa_subject'],
  ['/bbs/qaview.php?qa_id=7&page=2', '/mypage/qas/7?page=2'],
  ['/bbs/qawrite.php', '/mypage/qas/new'],
  ['/bbs/qawrite.php?w=u&qa_id=7&page=2', '/mypage/qas/7?page=2'],
  ['/bbs/qawrite.php?w=r&qa_id=7&page=2', '/mypage/qas/new?page=2&reply_to=7'],
  ['/bbs/memo.php?kind=send&page=2', '/mypage/memos?page=2&type=send'],
  ['/bbs/memo_form.php?me_recv_mb_id=demo', '/mypage/memos/new?recv=demo'],
  ['/bbs/memo_view.php?me_id=9&kind=send&page=2', '/mypage/memos/9?page=2&type=send'],
  ['/bbs/profile.php?mb_id=demo&page=2', '/members/demo?page=2'],
  ['/bbs/point.php?page=2', '/mypage/points?page=2'],
  ['/bbs/scrap.php?page=2', '/mypage/scraps?page=2'],
  ['/mobile/shop', '/shop'],
  ['/mobile/shop/', '/shop'],
  ['/mobile/shop/index.php', '/shop'],
  ['/mobile/shop/cart.php', '/shop/cart'],
  ['/mobile/shop/wishlist.php', '/shop/wishlist'],
  ['/mobile/shop/item.php?it_id=1446772772&page=2', '/shop/1446772772?page=2'],
  ['/mobile/shop/iteminfo.php?it_id=1446772772&info=qa', '/shop/1446772772?tab=qa'],
  ['/mobile/shop/itemqa.php?it_id=1446772772&page=2', '/shop/1446772772?page=2&tab=qa'],
  ['/mobile/shop/itemqaform.php?it_id=1446772772', '/shop/1446772772?tab=qa&form=qa'],
  ['/mobile/shop/itemrecommend.php?it_id=1446772772', '/shop/1446772772?modal=recommend'],
  ['/mobile/shop/itemstocksms.php?it_id=1446772772', '/shop/1446772772?modal=restock'],
  ['/mobile/shop/itemuse.php?it_id=1446772772&page=2', '/shop/1446772772?page=2&tab=reviews'],
  ['/mobile/shop/itemuseform.php?it_id=1446772772', '/shop/1446772772?tab=reviews&form=review'],
  ['/mobile/shop/category.php?ca_id=2010101010&page=2', '/shop/list-2010101010?page=2'],
  ['/mobile/shop/list.php?ca_id=2010101010&page=2', '/shop/list-2010101010?page=2'],
  ['/mobile/shop/listtype.php?type=2&page=3', '/shop/type-2?page=3'],
  ['/mobile/shop/coupon.php', '/mypage/coupons'],
  ['/mobile/shop/event.php?ev_id=1', '/shop/events/1'],
  ['/mobile/shop/largeimage.php?it_id=1446772772&no=1', '/shop/largeimage?it_id=1446772772&no=1'],
  ['/mobile/shop/mypage.php', '/mypage'],
  ['/mobile/shop/orderaddress.php', '/mypage/addresses'],
  ['/mobile/shop/orderform.php?sw_direct=1', '/shop/order?direct=1'],
  ['/mobile/shop/orderinquiry.php', '/shop/orders'],
  ['/mobile/shop/orderinquiryview.php?od_id=202606030001&uid=abc', '/shop/orders/202606030001?uid=abc'],
  ['/mobile/shop/personalpay.php', '/shop/personalpay'],
  ['/mobile/shop/personalpayform.php?pp_id=demo', '/shop/personalpay/demo/pay'],
  ['/mobile/shop/personalpayresult.php?pp_id=demo', '/shop/personalpay/demo'],
  ['/mobile/shop/search.php?q=TH&qcaid=2010101010', '/shop/search?q=TH&qcaid=2010101010'],
  ['/shop/index.php', '/shop'],
  ['/shop/cart.php', '/shop/cart'],
  ['/shop/wishlist.php', '/shop/wishlist'],
  ['/shop/couponzone.php', '/shop/couponzone'],
  ['/shop/search.php?q=TH&qcaid=2010101010', '/shop/search?q=TH&qcaid=2010101010'],
  ['/shop/largeimage.php?it_id=1446772772&no=1', '/shop/largeimage?it_id=1446772772&no=1'],
  ['/shop/mypage.php', '/mypage'],
  ['/shop/orderinquiry.php', '/shop/orders'],
  ['/shop/personalpay.php', '/shop/personalpay'],
  ['/shop/item.php?it_id=1446772772&foo=bar#review', '/shop/1446772772?foo=bar#review'],
  ['/shop/item.php?it_seo_title=%EC%83%81%ED%92%88', '/shop/%EC%83%81%ED%92%88/'],
  ['/shop/item.php?it_id=cart', '/shop/products/cart'],
  ['/shop/item.php?it_seo_title=..', '/shop/products'],
  ['/shop/iteminfo.php?it_id=1446772772&info=use', '/shop/1446772772?tab=reviews'],
  ['/shop/iteminfo.php?it_id=1446772772&info=qa', '/shop/1446772772?tab=qa'],
  ['/shop/category.php?ca_id=2010101010&page=2', '/shop/list-2010101010?page=2'],
  ['/shop/list.php?ca_id=2010101010&page=2', '/shop/list-2010101010?page=2'],
  ['/shop/listtype.php?type=1&page=2', '/shop/type-1?page=2'],
  ['/shop/event.php?ev_id=1', '/shop/events/1'],
  ['/shop/orderform.php?sw_direct=1', '/shop/order?direct=1'],
  ['/shop/orderinquiryview.php?od_id=202606030001&uid=abc', '/shop/orders/202606030001?uid=abc'],
  [
    '/shop/orderinquirycancel.php?od_id=202606030001&token=secret&cancel_memo=no&foo=bar',
    '/shop/orders/202606030001?foo=bar',
  ],
  ['/shop/personalpayform.php?pp_id=demo', '/shop/personalpay/demo/pay'],
  [
    `/shop/personalpayform.php?pp_id=demo&${passthroughParam}=1`,
    `/shop/personalpayform.php?pp_id=demo&${passthroughParam}=1`,
  ],
  ['/shop/personalpayresult.php?pp_id=demo', '/shop/personalpay/demo'],
  ['/shop/categories/2010101010', '/shop/list-2010101010'],
  ['/shop/categories/2010101010?page=2', '/shop/list-2010101010?page=2'],
  ['/shop/products/1446772772', '/shop/1446772772'],
  ['/shop/products/1446772772?foo=bar#review', '/shop/1446772772?foo=bar#review'],
  ['/shop/products/%EC%83%81%ED%92%88-%EC%95%88%EB%85%95/', '/shop/%EC%83%81%ED%92%88-%EC%95%88%EB%85%95/'],
  ['/shop/products?it_type1=1', '/shop/type-1'],
  ['/shop/products?it_type5=1&page=2', '/shop/type-5?page=2'],
  ['/shop/products?sort=latest', '/shop/products?sort=latest'],
  ['/shop/products/cart', '/shop/products/cart'],
  ['/shop/products/largeimage', '/shop/products/largeimage'],
  ['/shop/products/bannerhit.php?bn_id=1', '/shop/products/bannerhit.php?bn_id=1'],
  ['/shop/products/naverpay', '/shop/products/naverpay'],
  ['/shop/products/orderform', '/shop/products/orderform'],
  ['/shop/products/price', '/shop/products/price'],
  ['/shop/products/qas', '/shop/products/qas'],
  ['/shop/products/reviews', '/shop/products/reviews'],
  ['/shop/products/taxsave', '/shop/products/taxsave'],
  ['/shop/qas', '/shop/qas'],
  ['/shop/reviews', '/shop/reviews'],
  ['/shop/search?q=TH&qcaid=2010101010', '/shop/search?q=TH&qcaid=2010101010'],
  ['/shop/largeimage?it_id=1446772772&no=1', '/shop/largeimage?it_id=1446772772&no=1'],
  ['/content/company', '/content/company'],
];

for (const [input, expected] of cases) {
  expectEqual(`toG5ShortPath(${input})`, toG5ShortPath(input), expected);
}
checkPhpShortPathCases(cases);

expectEqual('g5ShortHref(/boards/free/6)', g5ShortHref('/boards/free/6'), '/free/6');
expectEqual(
  'appShortUrl(/shop/products/1446772772)',
  appShortUrl('/shop/products/1446772772'),
  'https://example.com/shop/1446772772'
);

  return cases.map(([input, expected]) => ({
    input,
    output: toG5ShortPath(input),
    expected,
  }));
}

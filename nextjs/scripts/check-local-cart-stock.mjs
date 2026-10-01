// 장바구니 담기 · 수량 바꾸기의 재고 판정이 영카트 원본(cartupdate.php · is_soldout)과 같은지 본다.
//   쓸 수 있는 재고 = 창고 재고 - 주문 대기 수량. 재고 0 은 품절(무제한이 아니다).
//   옵션 없는 본품은 상품 재고, 옵션 행은 그 옵션 재고만 본다. 이미 담긴 같은 줄 수량도 더해 센다.
// 비회원 장바구니로 담았다가 지우고, 잠시 0 으로 바꾼 옵션 재고는 되돌린다.
//
//   node scripts/check-local-cart-stock.mjs
//   LOCAL_EXPECTED_API_URL=http://localhost/api/v1 (기본값)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiUrl = (process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1').replace(/\/+$/, '');
const php = process.env.PHP_BIN || 'php';
const seedScript = fileURLToPath(new URL('./smoke/set_nextjs_smoke_product_stock.php', import.meta.url));

const cookies = new Map();
const createdCtIds = new Set();
const results = [];

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  const json = await response.json().catch(() => ({}));
  for (const id of collectCtIds(json?.data)) createdCtIds.add(id);
  return { status: response.status, message: String(json?.message ?? json?.error ?? ''), data: json?.data };
}

function collectCtIds(data) {
  if (!data || typeof data !== 'object') return [];
  const rows = Array.isArray(data.items) ? data.items : [data];
  return rows.map((row) => row?.ct_id).filter(Boolean).map(String);
}

function check(name, actual, expect) {
  const ok = actual.status === expect.status && (!expect.message || actual.message.includes(expect.message));
  results.push({ name, ok, status: actual.status, message: actual.message });
}

function seedStock(args) {
  const out = spawnSync(php, [seedScript, '--json', ...args], { encoding: 'utf8', windowsHide: true });
  if (out.status !== 0) throw new Error(`stock seed failed: ${out.stderr || out.stdout}`);
  return JSON.parse(out.stdout.trim().split('\n').pop());
}

async function products() {
  const list = (await api('/shop/products?per_page=100')).data ?? [];
  const purchasable = (p) => p.it_soldout !== '1' && p.it_tel_inq !== '1' && Number(p.it_buy_max_qty || 0) === 0 && Number(p.it_buy_min_qty || 0) <= 1;
  const plainZero = list.find((p) => purchasable(p) && p.has_options === false && Number(p.it_stock_qty) <= 0);
  const plainStock = list.find((p) => purchasable(p) && p.has_options === false && Number(p.it_stock_qty) > 1);
  const withOptions = list.filter((p) => purchasable(p) && p.has_options === true);
  for (const candidate of withOptions) {
    const detail = (await api(`/shop/products/${encodeURIComponent(candidate.it_id)}`)).data;
    const option = (detail?.options ?? []).find((o) => Number(o.io_type) === 0 && Number(o.io_use ?? 1) === 1 && Number(o.io_stock_qty) > 1);
    if (option) return { plainZero, plainStock, optionItem: detail, option };
  }
  return { plainZero, plainStock };
}

async function main() {
  const { plainZero, plainStock, optionItem, option } = await products();
  if (!plainStock || !optionItem) throw new Error('needs an in-stock product without options and one with options');

  if (plainZero) {
    check('재고 0 인 옵션 없는 상품은 담기지 않는다(품절)', await api('/shop/cart', { method: 'POST', body: { it_id: plainZero.it_id, ct_qty: 1 } }), { status: 400, message: 'sold out' });
  } else {
    results.push({ name: '재고 0 인 옵션 없는 상품 (목록에 없어 건너뜀)', ok: true, status: '-', message: 'skipped' });
  }

  const stock = Number(plainStock.it_stock_qty);
  const added = await api('/shop/cart', { method: 'POST', body: { it_id: plainStock.it_id, ct_qty: 1 } });
  check('재고 있는 옵션 없는 상품은 담긴다', added, { status: 201 });
  check('이미 담긴 수량까지 더해 재고를 넘으면 막는다', await api('/shop/cart', { method: 'POST', body: { it_id: plainStock.it_id, ct_qty: stock } }), { status: 400, message: 'exceeds available stock' });
  const ctId = collectCtIds(added.data)[0];
  check('수량 바꾸기도 재고를 넘으면 막는다', await api(`/shop/cart/${ctId}`, { method: 'PATCH', body: { ct_qty: stock + 1 } }), { status: 400, message: 'exceeds available stock' });

  check('옵션 상품을 옵션 없이 담으면 옵션 선택을 요구한다(품절이 아니다)', await api('/shop/cart', { method: 'POST', body: { it_id: optionItem.it_id, ct_qty: 1 } }), { status: 400, message: '옵션을 선택해주세요' });

  const optStock = Number(option.io_stock_qty);
  check('재고 있는 옵션은 담긴다', await api('/shop/cart', { method: 'POST', body: { it_id: optionItem.it_id, options: [{ io_id: option.io_id, ct_qty: 1 }] } }), { status: 201 });
  check('옵션도 이미 담긴 수량까지 더해 재고를 넘으면 막는다', await api('/shop/cart', { method: 'POST', body: { it_id: optionItem.it_id, options: [{ io_id: option.io_id, ct_qty: optStock }] } }), { status: 400, message: 'exceeds available' });
  check('옵션 하나 담기(ct_option)도 재고를 넘으면 막는다', await api('/shop/cart', { method: 'POST', body: { it_id: optionItem.it_id, ct_option: option.io_id, ct_qty: optStock + 1 } }), { status: 400, message: 'exceeds available' });

  const ioIdB64 = Buffer.from(option.io_id, 'utf8').toString('base64');
  const previous = seedStock([`--product-id=${optionItem.it_id}`, `--io-id-b64=${ioIdB64}`, '--io-type=0', '--stock=0']);
  try {
    check('재고 0 인 옵션은 담기지 않는다(품절)', await api('/shop/cart', { method: 'POST', body: { it_id: optionItem.it_id, options: [{ io_id: option.io_id, ct_qty: 1 }] } }), { status: 400, message: '품절' });
  } finally {
    seedStock([`--product-id=${optionItem.it_id}`, `--io-id-b64=${ioIdB64}`, '--io-type=0', `--stock=${previous.previous_stock}`]);
  }
}

try {
  await main();
} finally {
  for (const ctId of createdCtIds) await api(`/shop/cart/${ctId}`, { method: 'DELETE' }).catch(() => undefined);
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  [${r.status}] ${r.message}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

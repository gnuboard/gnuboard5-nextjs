import { seedBrowserAuth } from './lib/seed-browser-auth.mjs';
import { createOrderBrowserHelpers } from './lib/order-browser-flow.mjs';
import { createLocalOrderFixtures } from './lib/local-order-fixtures.mjs';
import { createLocalOrderScopeChecks } from './lib/local-order-scope-checks.mjs';
import { createLocalOrderStatusChecks } from './lib/local-order-status-checks.mjs';
import { createLocalOrderCouponChecks } from './lib/local-order-coupon-checks.mjs';
import {
  verifyCrossSiteGuestCookiePolicy,
  verifyOrderStockRevalidation,
} from './lib/local-order-core-checks.mjs';
import { createLocalShopSmokeHelpers } from './lib/local-shop-smoke-helpers.mjs';
import {
  assertOkResponse,
  authHeaders,
  createCookieJar,
  createLocalActionApi,
  fail,
  printFailure,
  trimTrailingSlash,
} from './lib/local-action-api.mjs';
import { chromium } from '@playwright/test';

const appUrl = trimTrailingSlash(process.env.LOCAL_APP_URL || 'http://localhost');
const expectedApiUrl = trimTrailingSlash(
  process.env.LOCAL_EXPECTED_API_URL || 'http://localhost/api/v1'
);

const smokeMemberId = process.env.LOCAL_SMOKE_LOGIN_ID || 'nextjs_smoke';
const smokeMemberPassword =
  process.env.LOCAL_SMOKE_LOGIN_PASSWORD || 'NextjsSmoke123!';
const smokeProductId = process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || '1446772772';
const smokeMarker = process.env.LOCAL_SMOKE_ORDER_MARKER || 'nextjs-local-order-smoke';
const smokeRunId = `${Date.now()}`;
const sendCouponSubject =
  process.env.LOCAL_SMOKE_SEND_COUPON_SUBJECT || 'nextjs-local-send-coupon-smoke 1000';
const orderCouponSubject =
  process.env.LOCAL_SMOKE_ORDER_COUPON_SUBJECT || 'nextjs-local-order-coupon-smoke 2000';
const itemCouponSubject =
  process.env.LOCAL_SMOKE_ITEM_COUPON_SUBJECT || 'nextjs-local-item-coupon-smoke 1500';
const categoryCouponSubject =
  process.env.LOCAL_SMOKE_CATEGORY_COUPON_SUBJECT || 'nextjs-local-category-coupon-smoke 1200';
const itemPaymentCouponSubject =
  process.env.LOCAL_SMOKE_ITEM_PAYMENT_COUPON_SUBJECT ||
  'nextjs-local-item-payment-coupon-smoke 1400';
const categoryPaymentCouponSubject =
  process.env.LOCAL_SMOKE_CATEGORY_PAYMENT_COUPON_SUBJECT ||
  'nextjs-local-category-payment-coupon-smoke 1100';
const orderPointMarker =
  process.env.LOCAL_SMOKE_ORDER_POINT_MARKER || `${smokeMarker}-order-point`;
// Cross-site cookie policy needs an https Origin that the API also CORS-allows;
// the SameSite=None branch only applies to secure cross-site requests. Set
// LOCAL_SMOKE_CROSS_SITE_ORIGIN to such an origin and add it to the runtime
// G5_NEXTJS_LOCAL_CORS_ORIGINS allowlist to exercise this check locally.
const smokeCrossSiteOrigin =
  process.env.LOCAL_SMOKE_CROSS_SITE_ORIGIN || 'https://example.com';

const STATUS_ORDERED = '\uC8FC\uBB38';
const STATUS_PAID = '\uC785\uAE08';
const STATUS_SHIPPING = '\uBC30\uC1A1';
const STATUS_CANCELLED = '\uCDE8\uC18C';
const SETTLE_BANK = '\uBB34\uD1B5\uC7A5\uC785\uAE08';
const SETTLE_CARD = '\uC2E0\uC6A9\uCE74\uB4DC';

const {
  apiFailure,
  apiJson,
  apiOk,
  fetchApi,
  login,
  runPhp,
} = createLocalActionApi({
  expectedApiUrl,
  smokeMemberId,
  smokeMemberPassword,
  smokeMarker,
});

const {
  cartAddBody,
  cartIdsFromAddPayload,
  cleanupCart,
  currentCartRows,
  currentGuestCartRows,
  firstUsableOption,
  getProduct,
  setupCartForOrder,
} = createLocalShopSmokeHelpers({
  apiJson,
  apiOk,
  smokeProductId,
});

const {
  cleanupCartCoupon,
  cleanupOrderCoupons,
  cleanupOrderPoints,
  cleanupOrders,
  cleanupSendCoupons,
  markSmokeOrderPaid,
  seedCartCouponZone,
  seedOrderCouponZone,
  seedOrderPoints,
  seedSendCouponZone,
  setSmokeStock,
} = createLocalOrderFixtures({
  runPhp,
  smokeMemberId,
  sendCouponSubject,
  orderCouponSubject,
  orderPointMarker,
});

const orderActionCheckDeps = {
  SETTLE_BANK,
  SETTLE_CARD,
  STATUS_CANCELLED,
  STATUS_ORDERED,
  STATUS_PAID,
  STATUS_SHIPPING,
  apiFailure,
  apiJson,
  apiOk,
  authHeaders,
  cartAddBody,
  cartIdsFromAddPayload,
  cleanupCart,
  cleanupCartCoupon,
  cleanupOrderCoupons,
  cleanupOrderPoints,
  cleanupOrders,
  cleanupSendCoupons,
  createCookieJar,
  currentCartRows,
  currentGuestCartRows,
  fail,
  firstUsableOption,
  markSmokeOrderPaid,
  seedCartCouponZone,
  seedOrderCouponZone,
  seedOrderPoints,
  seedSendCouponZone,
  smokeMarker,
  smokeMemberId,
  smokeRunId,
};

const {
  verifyDirectBuyScope,
  verifyGuestOrderLookup,
  verifyGuestPaymentPrepareCancel,
  verifyPreparedPaymentRestore,
  verifySendCouponPrepare,
} = createLocalOrderScopeChecks(orderActionCheckDeps);

const {
  verifyOrderCouponPointDirect,
  verifyPaidOrderDirectCancelGuard,
  verifyReceiptAndDeliveryLinks,
  verifyCashReceiptLink,
} = createLocalOrderStatusChecks(orderActionCheckDeps);

const {
  verifyCartRowCouponDirect,
  verifyCartRowCouponPaymentPrepareCancel,
} = createLocalOrderCouponChecks(orderActionCheckDeps);


const { createOrderInBrowser, cancelOrderInBrowser } = createOrderBrowserHelpers({
  appUrl,
  smokeMarker,
  smokeMemberId,
  smokeRunId,
  STATUS_ORDERED,
  STATUS_CANCELLED,
  fail,
  assertOkResponse,
  apiJson,
  authHeaders,
});

let browser = null;
let credentials = null;
let exitCode = 0;
let createdOrderId = '';
let createdDirectOrderId = '';
let createdGuestOrderId = '';
let createdGuestPreparedOrderId = '';
let preparedCancelOrderId = '';
let preparedRefreshOrderId = '';
let preparedKcpOrderId = '';
let sendCouponOrderId = '';
let orderCouponPointOrderId = '';
let paidCancelGuardOrderId = '';
let receiptDeliveryOrderId = '';
let cashReceiptOrderId = '';
let productCartCouponOrderId = '';
let categoryCartCouponOrderId = '';
let productPaymentCouponOrderId = '';
let categoryPaymentCouponOrderId = '';

try {
  runPhp('seed_nextjs_smoke_user.php');
  cleanupOrders();
  credentials = await login();
  const product = await getProduct();
  await cleanupCart(credentials.token);
  const crossSiteCookieResult = await verifyCrossSiteGuestCookiePolicy({
    product,
    firstUsableOption,
    fetchApi,
    apiOk,
    cartAddBody,
    smokeCrossSiteOrigin,
  });
  const stockRevalidationResult = await verifyOrderStockRevalidation({
    token: credentials.token,
    product,
    cleanupCart,
    firstUsableOption,
    apiJson,
    apiFailure,
    cartAddBody,
    cartIdsFromAddPayload,
    setSmokeStock,
    smokeMemberId,
    smokeMarker,
    smokeRunId,
  });
  const directScopeResult = await verifyDirectBuyScope(credentials.token, product);
  createdDirectOrderId = directScopeResult.directOrderId;
  const guestLookupResult = await verifyGuestOrderLookup(product);
  createdGuestOrderId = guestLookupResult.guestOrderId;
  const guestPaymentResult = await verifyGuestPaymentPrepareCancel(product);
  createdGuestPreparedOrderId = guestPaymentResult.guestPreparedOrderId;
  const preparedRestoreResult = await verifyPreparedPaymentRestore(credentials.token, product);
  preparedCancelOrderId = preparedRestoreResult.preparedOrderId;
  preparedRefreshOrderId = preparedRestoreResult.refreshOrderId;
  preparedKcpOrderId = preparedRestoreResult.kcpOrderId;
  const sendCouponResult = await verifySendCouponPrepare(credentials.token, product);
  sendCouponOrderId = sendCouponResult.sendCouponOrderId;
  const orderCouponPointResult = await verifyOrderCouponPointDirect(credentials.token, product);
  orderCouponPointOrderId = orderCouponPointResult.orderCouponPointOrderId;
  const paidCancelGuardResult = await verifyPaidOrderDirectCancelGuard(credentials.token, product);
  paidCancelGuardOrderId = paidCancelGuardResult.paidCancelGuardOrderId;
  const receiptDeliveryResult = await verifyReceiptAndDeliveryLinks(credentials.token, product);
  receiptDeliveryOrderId = receiptDeliveryResult.receiptDeliveryOrderId;
  const cashReceiptResult = await verifyCashReceiptLink(credentials.token, product);
  cashReceiptOrderId = cashReceiptResult.cashReceiptOrderId;
  const productCartCouponResult = await verifyCartRowCouponDirect(credentials.token, product, {
    key: 'product',
    label: 'product',
    subject: itemCouponSubject,
    method: 0,
    target: String(product.it_id || ''),
    price: 1500,
  });
  productCartCouponOrderId = productCartCouponResult.productCartCouponOrderId;
  const categoryTarget = String(product.ca_id || product.category?.ca_id || '');
  if (!categoryTarget) {
    fail('smoke product has no category id for category coupon checks', product);
  }
  const categoryCartCouponResult = await verifyCartRowCouponDirect(credentials.token, product, {
    key: 'category',
    label: 'category',
    subject: categoryCouponSubject,
    method: 1,
    target: categoryTarget,
    price: 1200,
  });
  categoryCartCouponOrderId = categoryCartCouponResult.categoryCartCouponOrderId;
  const productPaymentCouponResult = await verifyCartRowCouponPaymentPrepareCancel(
    credentials.token,
    product,
    {
      key: 'product',
      label: 'product',
      subject: itemPaymentCouponSubject,
      method: 0,
      target: String(product.it_id || ''),
      price: 1400,
    }
  );
  productPaymentCouponOrderId = productPaymentCouponResult.productPaymentCouponOrderId;
  const categoryPaymentCouponResult = await verifyCartRowCouponPaymentPrepareCancel(
    credentials.token,
    product,
    {
      key: 'category',
      label: 'category',
      subject: categoryPaymentCouponSubject,
      method: 1,
      target: categoryTarget,
      price: 1100,
    }
  );
  categoryPaymentCouponOrderId = categoryPaymentCouponResult.categoryPaymentCouponOrderId;
  await cleanupCart(credentials.token);
  const setup = await setupCartForOrder(credentials.token, product);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  await seedBrowserAuth(context, credentials, appUrl);

  const page = await context.newPage();
  createdOrderId = await createOrderInBrowser(page, credentials.token, product);
  const cancelResult = await cancelOrderInBrowser(page, credentials.token, createdOrderId);
  await context.close();

  console.table([
    { productId: product.it_id, ...crossSiteCookieResult },
    { productId: product.it_id, ...stockRevalidationResult },
    { productId: product.it_id, ...directScopeResult },
    { productId: product.it_id, ...guestLookupResult },
    { productId: product.it_id, ...guestPaymentResult },
    { productId: product.it_id, ...preparedRestoreResult },
    { productId: product.it_id, ...sendCouponResult },
    { productId: product.it_id, ...orderCouponPointResult },
    { productId: product.it_id, ...paidCancelGuardResult },
    { productId: product.it_id, ...receiptDeliveryResult },
    { productId: product.it_id, ...cashReceiptResult },
    { productId: product.it_id, ...productCartCouponResult },
    { productId: product.it_id, ...categoryCartCouponResult },
    { productId: product.it_id, ...productPaymentCouponResult },
    { productId: product.it_id, ...categoryPaymentCouponResult },
    { productId: product.it_id, cartId: setup.ctId, ...cancelResult },
  ]);
  console.log(`[check-local-order-actions] app=${appUrl}`);
  console.log(`[check-local-order-actions] api=${expectedApiUrl}`);
} catch (error) {
  printFailure(error, 'check-local-order-actions');
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  if (credentials?.token) {
    try {
      cleanupOrders(createdDirectOrderId);
      cleanupOrders(createdGuestOrderId, true);
      cleanupOrders(createdGuestPreparedOrderId, true);
      cleanupOrders(preparedCancelOrderId);
      cleanupOrders(preparedRefreshOrderId);
      cleanupOrders(preparedKcpOrderId);
      cleanupOrders(sendCouponOrderId);
      cleanupOrders(orderCouponPointOrderId);
      cleanupOrders(paidCancelGuardOrderId);
      cleanupOrders(receiptDeliveryOrderId);
      cleanupOrders(cashReceiptOrderId);
      cleanupOrders(productCartCouponOrderId);
      cleanupOrders(categoryCartCouponOrderId);
      cleanupOrders(productPaymentCouponOrderId);
      cleanupOrders(categoryPaymentCouponOrderId);
      cleanupOrders(createdOrderId);
      cleanupOrders();
      cleanupSendCoupons();
      cleanupOrderCoupons();
      cleanupCartCoupon(itemCouponSubject);
      cleanupCartCoupon(categoryCouponSubject);
      cleanupCartCoupon(itemPaymentCouponSubject);
      cleanupCartCoupon(categoryPaymentCouponSubject);
      cleanupOrderPoints();
      await cleanupCart(credentials.token);
    } catch (error) {
      printFailure(error, 'check-local-order-actions cleanup');
      exitCode = 1;
    }
  }
  try {
    runPhp('seed_nextjs_smoke_user.php');
  } catch (error) {
    printFailure(error, 'check-local-order-actions reset');
    exitCode = 1;
  }
}

process.exit(exitCode);

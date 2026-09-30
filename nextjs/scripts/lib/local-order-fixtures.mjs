export function createLocalOrderFixtures({
  runPhp,
  smokeMemberId,
  sendCouponSubject,
  orderCouponSubject,
  orderPointMarker,
}) {
  function cleanupOrders(orderId = '', includeGuests = false) {
    const args = orderId ? [`--order-id=${orderId}`] : [];
    if (includeGuests) {
      args.push('--include-guests');
    }
    return runPhp('cleanup_nextjs_smoke_orders.php', {}, args);
  }

  function markSmokeOrderPaid(orderId, args = []) {
    return runPhp('mark_nextjs_smoke_order_paid.php', {}, [`--order-id=${orderId}`, ...args]);
  }

  function setSmokeStock(product, option, stock) {
    const args = [`--product-id=${product.it_id}`, `--stock=${stock}`];
    if (option?.ioId) {
      args.push(`--io-id=${option.ioId}`, '--io-type=0');
    }
    return runPhp('set_nextjs_smoke_product_stock.php', {}, args);
  }

  function seedSendCouponZone() {
    return runPhp('seed_nextjs_smoke_coupon_zone.php', {
      LOCAL_SMOKE_COUPON_SUBJECT: sendCouponSubject,
      LOCAL_SMOKE_COUPON_PRICE: '1000',
      LOCAL_SMOKE_COUPON_MINIMUM: '0',
      LOCAL_SMOKE_COUPON_METHOD: '3',
    });
  }

  function cleanupSendCoupons() {
    return runPhp('cleanup_nextjs_smoke_coupons.php', {
      LOCAL_SMOKE_COUPON_LOGIN_ID: smokeMemberId,
      LOCAL_SMOKE_COUPON_SUBJECT: sendCouponSubject,
    });
  }

  function seedOrderCouponZone(price = 2000) {
    return runPhp('seed_nextjs_smoke_coupon_zone.php', {
      LOCAL_SMOKE_COUPON_SUBJECT: orderCouponSubject,
      LOCAL_SMOKE_COUPON_PRICE: String(price),
      LOCAL_SMOKE_COUPON_MINIMUM: '0',
      LOCAL_SMOKE_COUPON_METHOD: '2',
    });
  }

  function cleanupOrderCoupons() {
    return runPhp('cleanup_nextjs_smoke_coupons.php', {
      LOCAL_SMOKE_COUPON_LOGIN_ID: smokeMemberId,
      LOCAL_SMOKE_COUPON_SUBJECT: orderCouponSubject,
    });
  }

  function seedCartCouponZone(subject, method, target, price) {
    return runPhp('seed_nextjs_smoke_coupon_zone.php', {
      LOCAL_SMOKE_COUPON_SUBJECT: subject,
      LOCAL_SMOKE_COUPON_PRICE: String(price),
      LOCAL_SMOKE_COUPON_MINIMUM: '0',
      LOCAL_SMOKE_COUPON_METHOD: String(method),
      LOCAL_SMOKE_COUPON_TARGET: target,
    });
  }

  function cleanupCartCoupon(subject) {
    return runPhp('cleanup_nextjs_smoke_coupons.php', {
      LOCAL_SMOKE_COUPON_LOGIN_ID: smokeMemberId,
      LOCAL_SMOKE_COUPON_SUBJECT: subject,
    });
  }

  function seedOrderPoints() {
    return runPhp('seed_nextjs_smoke_points.php', {
      LOCAL_SMOKE_POINT_LOGIN_ID: smokeMemberId,
      LOCAL_SMOKE_POINT_MARKER: orderPointMarker,
      LOCAL_SMOKE_POINT_EARN: '10000',
      LOCAL_SMOKE_POINT_USE: '1000',
    });
  }

  function cleanupOrderPoints() {
    return runPhp('cleanup_nextjs_smoke_points.php', {
      LOCAL_SMOKE_POINT_LOGIN_ID: smokeMemberId,
      LOCAL_SMOKE_POINT_MARKER: orderPointMarker,
    });
  }

  return {
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
  };
}

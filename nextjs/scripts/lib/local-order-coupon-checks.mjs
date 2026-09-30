export function createLocalOrderCouponChecks(deps) {
  const {
    SETTLE_BANK,
    SETTLE_CARD,
    STATUS_CANCELLED,
    apiJson,
    authHeaders,
    cartAddBody,
    cartIdsFromAddPayload,
    cleanupCart,
    cleanupCartCoupon,
    cleanupOrders,
    currentCartRows,
    fail,
    firstUsableOption,
    seedCartCouponZone,
    smokeMarker,
    smokeMemberId,
    smokeRunId,
  } = deps;

  async function verifyCartRowCouponDirect(token, product, config) {
    await cleanupCart(token);
    cleanupCartCoupon(config.subject);
  
    const option = firstUsableOption(product);
    let orderId = '';
    let cpId = '';
  
    try {
      const directAdd = await apiJson('/shop/cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
      });
      const directCtIds = cartIdsFromAddPayload(directAdd);
      if (directCtIds.length === 0) {
        fail(`${config.label} cart coupon setup did not return direct cart row ids`, directAdd);
      }
      const ctId = directCtIds[0];
  
      const directRows = await currentCartRows(
        token,
        `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
      );
      const row = directRows.find((item) => String(item.ct_id) === String(ctId));
      if (!row) {
        fail(`${config.label} cart coupon setup could not read the direct cart row`, {
          ctId,
          directRows,
        });
      }
      const cartTotal = directRows.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
      const rowTotal = Number(row.line_total || 0);
      if (cartTotal <= 0 || rowTotal <= 0) {
        fail(`${config.label} cart coupon setup did not produce a positive row total`, {
          cartTotal,
          row,
        });
      }
  
      const couponPrice = Math.max(1, Math.min(config.price, Math.floor(rowTotal / 3)));
      const zone = seedCartCouponZone(config.subject, config.method, config.target, couponPrice);
      const download = await apiJson('/shop/coupons/download', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ cz_id: zone.cz_id }),
      });
      cpId = String(download.data?.cp_id || '');
      if (!cpId) {
        fail(`${config.label} cart coupon download did not return a coupon id`, download);
      }
  
      const applicable = await apiJson(
        `/shop/coupons/applicable?ct_id=${encodeURIComponent(ctId)}`,
        {
          headers: authHeaders(token),
        }
      );
      const match = (applicable.data || []).find((coupon) => String(coupon.cp_id) === cpId);
      if (!match || Number(match.discount || 0) !== couponPrice) {
        fail(`${config.label} cart coupon applicable API did not expose the expected coupon`, {
          cpId,
          couponPrice,
          applicable: applicable.data,
        });
      }
  
      const applied = await apiJson('/shop/coupons/apply-to-cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ ct_id: Number(ctId), cp_id: cpId }),
      });
      if (Number(applied.data?.discount || 0) !== couponPrice) {
        fail(`${config.label} cart coupon apply did not return the expected discount`, applied);
      }
  
      const couponRows = await currentCartRows(
        token,
        `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
      );
      const couponRow = couponRows.find((item) => String(item.ct_id) === String(ctId));
      if (
        !couponRow ||
        String(couponRow.cp_id || '') !== cpId ||
        Number(couponRow.cp_price || 0) !== couponPrice
      ) {
        fail(`${config.label} cart coupon was not persisted on the cart row`, {
          cpId,
          couponPrice,
          couponRows,
        });
      }
  
      const quote = await apiJson(
        `/shop/shipping/quote?ct_ids=${encodeURIComponent(directCtIds.join(','))}`,
        {
          headers: authHeaders(token),
        }
      );
      const shippingTotal = Number(quote.data?.total || 0);
      const expectedReceipt = Math.max(0, cartTotal + shippingTotal - couponPrice);
  
      const orderPayload = await apiJson('/shop/orders', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          ct_ids: directCtIds.join(','),
          od_name: 'NextjsSmoke',
          od_tel: '02-000-0000',
          od_hp: '010-1234-5678',
          od_email: `${smokeMemberId}@example.test`,
          od_zip: '12345',
          od_addr1: 'Next.js smoke address',
          od_addr2: `${config.label} cart coupon direct`,
          od_memo: `${smokeMarker} ${config.key}-cart-coupon ${smokeRunId}`,
          od_settle_case: SETTLE_BANK,
          od_bank_account: 'smoke-bank',
          od_deposit_name: 'NextjsSmoke',
        }),
      });
      orderId = String(orderPayload.data?.od_id || orderPayload.data?.order?.od_id || '');
      if (!/^[0-9]{8,20}$/.test(orderId)) {
        fail(`${config.label} cart coupon direct order did not return a valid order id`, orderPayload);
      }
  
      const detail = await apiJson(`/shop/orders/${orderId}`, {
        headers: authHeaders(token),
      });
      const order = detail.data || {};
      const actualShippingTotal =
        Number(order.od_send_cost || 0) + Number(order.od_send_cost2 || 0);
      const amountFields = {
        od_cart_price: Number(order.od_cart_price || 0),
        od_cart_coupon: Number(order.od_cart_coupon || 0),
        od_coupon: Number(order.od_coupon || 0),
        od_receipt_point: Number(order.od_receipt_point || 0),
        od_send_total: actualShippingTotal,
        od_receipt_price: Number(order.od_receipt_price || 0),
        od_misu: Number(order.od_misu || 0),
      };
      const expectedFields = {
        od_cart_price: cartTotal,
        od_cart_coupon: couponPrice,
        od_coupon: 0,
        od_receipt_point: 0,
        od_send_total: shippingTotal,
        od_receipt_price: 0,
        od_misu: expectedReceipt,
      };
      for (const [field, expected] of Object.entries(expectedFields)) {
        if (amountFields[field] !== expected) {
          fail(`${config.label} cart coupon order amount field mismatch`, {
            field,
            expected,
            actual: amountFields[field],
            amountFields,
            expectedFields,
            order,
          });
        }
      }
  
      const usedListing = await apiJson('/shop/coupons', {
        headers: authHeaders(token),
      });
      const usedCoupon = (usedListing.data || []).find((coupon) => String(coupon.cp_id || '') === cpId);
      if (!usedCoupon || String(usedCoupon.cp_used || '') === '') {
        fail(`${config.label} cart coupon was not marked used immediately after order`, {
          cpId,
          coupons: usedListing.data,
        });
      }
  
      await apiJson(`/shop/orders/${orderId}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({
          reason: `smoke ${config.key} cart coupon restore`,
        }),
      });
      const cancelledDetail = await apiJson(`/shop/orders/${orderId}`, {
        headers: authHeaders(token),
      });
      const cancelled = cancelledDetail.data || {};
      if (
        String(cancelled.od_status || '') !== STATUS_CANCELLED ||
        Number(cancelled.od_cart_coupon || 0) !== 0 ||
        Number(cancelled.od_receipt_price || 0) !== 0 ||
        Number(cancelled.od_cancel_price || 0) !== cartTotal
      ) {
        fail(`${config.label} cart coupon cancel did not restore YoungCart fields`, {
          cartTotal,
          cancelled,
        });
      }
  
      const restoredListing = await apiJson('/shop/coupons', {
        headers: authHeaders(token),
      });
      const restoredCoupon = (restoredListing.data || []).find(
        (coupon) => String(coupon.cp_id || '') === cpId
      );
      if (!restoredCoupon || String(restoredCoupon.cp_used || '') !== '') {
        fail(`${config.label} cart coupon was not restored after cancellation`, {
          cpId,
          coupons: restoredListing.data,
        });
      }
  
      return {
        [`${config.key}CartCouponOrderId`]: orderId,
        [`${config.key}CartCouponDiscount`]: couponPrice,
        [`${config.key}CartCouponReceipt`]: expectedReceipt,
        [`${config.key}CartCouponReusableAfterCancel`]: true,
      };
    } catch (error) {
      if (orderId) {
        cleanupOrders(orderId);
      }
      throw error;
    } finally {
      await cleanupCart(token).catch(() => null);
    }
  }
  
  async function verifyCartRowCouponPaymentPrepareCancel(token, product, config) {
    await cleanupCart(token);
    cleanupCartCoupon(config.subject);
  
    const option = firstUsableOption(product);
    let orderId = '';
    let cpId = '';
  
    try {
      const directAdd = await apiJson('/shop/cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
      });
      const directCtIds = cartIdsFromAddPayload(directAdd);
      if (directCtIds.length === 0) {
        fail(`${config.label} payment cart coupon setup did not return direct cart row ids`, directAdd);
      }
      const ctId = directCtIds[0];
  
      const directRows = await currentCartRows(
        token,
        `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
      );
      const row = directRows.find((item) => String(item.ct_id) === String(ctId));
      const cartTotal = directRows.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
      const rowTotal = Number(row?.line_total || 0);
      if (!row || cartTotal <= 0 || rowTotal <= 0) {
        fail(`${config.label} payment cart coupon setup did not produce a positive row total`, {
          ctId,
          cartTotal,
          directRows,
        });
      }
  
      const couponPrice = Math.max(1, Math.min(config.price, Math.floor(rowTotal / 3)));
      const zone = seedCartCouponZone(config.subject, config.method, config.target, couponPrice);
      const download = await apiJson('/shop/coupons/download', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ cz_id: zone.cz_id }),
      });
      cpId = String(download.data?.cp_id || '');
      if (!cpId) {
        fail(`${config.label} payment cart coupon download did not return a coupon id`, download);
      }
  
      const applicable = await apiJson(
        `/shop/coupons/applicable?ct_id=${encodeURIComponent(ctId)}`,
        { headers: authHeaders(token) }
      );
      const match = (applicable.data || []).find((coupon) => String(coupon.cp_id) === cpId);
      if (!match || Number(match.discount || 0) !== couponPrice) {
        fail(`${config.label} payment applicable API did not expose the expected cart coupon`, {
          cpId,
          couponPrice,
          applicable: applicable.data,
        });
      }
  
      await apiJson('/shop/coupons/apply-to-cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ ct_id: Number(ctId), cp_id: cpId }),
      });
  
      const couponRows = await currentCartRows(
        token,
        `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
      );
      const couponRow = couponRows.find((item) => String(item.ct_id) === String(ctId));
      if (
        !couponRow ||
        String(couponRow.cp_id || '') !== cpId ||
        Number(couponRow.cp_price || 0) !== couponPrice
      ) {
        fail(`${config.label} payment cart coupon was not persisted before prepare`, {
          cpId,
          couponPrice,
          couponRows,
        });
      }
  
      const quote = await apiJson(
        `/shop/shipping/quote?ct_ids=${encodeURIComponent(directCtIds.join(','))}`,
        { headers: authHeaders(token) }
      );
      const shippingTotal = Number(quote.data?.total || 0);
      const expectedReceipt = Math.max(0, cartTotal + shippingTotal - couponPrice);
  
      const prepared = await apiJson('/shop/payment/prepare', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          ct_ids: directCtIds.join(','),
          od_name: 'NextjsSmoke',
          od_tel: '02-000-0000',
          od_hp: '010-1234-5678',
          od_email: `${smokeMemberId}@example.test`,
          od_zip: '12345',
          od_addr1: 'Next.js smoke address',
          od_addr2: `${config.label} payment cart coupon`,
          od_memo: `${smokeMarker} ${config.key}-payment-cart-coupon ${smokeRunId}`,
          od_settle_case: SETTLE_CARD,
        }),
      });
      orderId = String(prepared.data?.order_id || '');
      const amount = Number(prepared.data?.amount || 0);
      if (!/^[0-9]{8,20}$/.test(orderId) || amount !== expectedReceipt) {
        fail(`${config.label} payment prepare did not return the expected cart coupon amount`, {
          orderId,
          amount,
          expectedReceipt,
          prepared: prepared.data,
        });
      }
  
      const preparedDetail = await apiJson(`/shop/orders/${orderId}`, {
        headers: authHeaders(token),
      });
      const preparedOrder = preparedDetail.data || {};
      const preparedShippingTotal =
        Number(preparedOrder.od_send_cost || 0) + Number(preparedOrder.od_send_cost2 || 0);
      if (
        Number(preparedOrder.od_cart_price || 0) !== cartTotal ||
        Number(preparedOrder.od_cart_coupon || 0) !== couponPrice ||
        Number(preparedOrder.od_receipt_price || 0) !== expectedReceipt ||
        preparedShippingTotal !== shippingTotal
      ) {
        fail(`${config.label} prepared payment order did not persist cart coupon totals`, {
          cartTotal,
          couponPrice,
          shippingTotal,
          expectedReceipt,
          preparedOrder,
        });
      }
  
      const listingBeforeCancel = await apiJson('/shop/coupons', {
        headers: authHeaders(token),
      });
      const couponBeforeCancel = (listingBeforeCancel.data || []).find(
        (coupon) => String(coupon.cp_id || '') === cpId
      );
      if (!couponBeforeCancel || String(couponBeforeCancel.cp_used || '') !== '') {
        fail(`${config.label} cart coupon was marked used before PG confirmation`, {
          cpId,
          coupons: listingBeforeCancel.data,
        });
      }
  
      const cancelled = await apiJson('/shop/payment/cancel', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          order_id: orderId,
          reason: `smoke ${config.key} payment cart coupon restore`,
        }),
      });
      if (String(cancelled.data?.status || '') !== STATUS_CANCELLED) {
        fail(`${config.label} payment cart coupon cancel did not return cancelled status`, cancelled);
      }
  
      const cancelledDetail = await apiJson(`/shop/orders/${orderId}`, {
        headers: authHeaders(token),
      });
      const cancelledOrder = cancelledDetail.data || {};
      const cancelledZeroFields = [
        'od_receipt_price',
        'od_receipt_point',
        'od_misu',
        'od_send_cost',
        'od_send_cost2',
        'od_cart_coupon',
        'od_coupon',
        'od_send_coupon',
      ];
      const nonZeroCancelledFields = cancelledZeroFields.filter(
        (field) => Number(cancelledOrder[field] || 0) !== 0
      );
      if (
        String(cancelledOrder.od_status || '') !== STATUS_CANCELLED ||
        nonZeroCancelledFields.length > 0 ||
        Number(cancelledOrder.od_cancel_price || 0) !== cartTotal
      ) {
        fail(`${config.label} payment cart coupon cancel did not reset YoungCart amount fields`, {
          nonZeroCancelledFields,
          cartTotal,
          cancelledOrder,
        });
      }
  
      const restoredRows = await currentCartRows(
        token,
        `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
      );
      const restoredRow = restoredRows.find((item) => String(item.ct_id) === String(ctId));
      if (
        !restoredRow ||
        String(restoredRow.cp_id || '') !== cpId ||
        Number(restoredRow.cp_price || 0) !== couponPrice
      ) {
        fail(`${config.label} payment cancel did not restore the coupon-bound direct cart row`, {
          cpId,
          couponPrice,
          restoredRows,
        });
      }
  
      const listingAfterCancel = await apiJson('/shop/coupons', {
        headers: authHeaders(token),
      });
      const couponAfterCancel = (listingAfterCancel.data || []).find(
        (coupon) => String(coupon.cp_id || '') === cpId
      );
      if (!couponAfterCancel || String(couponAfterCancel.cp_used || '') !== '') {
        fail(`${config.label} cart coupon was not available after payment cancellation`, {
          cpId,
          coupons: listingAfterCancel.data,
        });
      }
  
      return {
        [`${config.key}PaymentCouponOrderId`]: orderId,
        [`${config.key}PaymentCouponDiscount`]: couponPrice,
        [`${config.key}PaymentCouponAmount`]: expectedReceipt,
        [`${config.key}PaymentCouponCartRestored`]: true,
      };
    } catch (error) {
      if (orderId) {
        cleanupOrders(orderId);
      }
      throw error;
    } finally {
      await cleanupCart(token).catch(() => null);
    }
  }

  return {
    verifyCartRowCouponDirect,
    verifyCartRowCouponPaymentPrepareCancel,
  };
}

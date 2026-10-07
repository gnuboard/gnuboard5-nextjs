export function createLocalOrderStatusChecks(deps) {
  const {
    SETTLE_BANK,
    STATUS_CANCELLED,
    STATUS_ORDERED,
    STATUS_PAID,
    STATUS_SHIPPING,
    apiFailure,
    apiJson,
    authHeaders,
    cartAddBody,
    cartIdsFromAddPayload,
    cleanupCart,
    cleanupOrderCoupons,
    cleanupOrderPoints,
    cleanupOrders,
    currentCartRows,
    fail,
    firstUsableOption,
    markSmokeOrderPaid,
    seedOrderCouponZone,
    seedOrderPoints,
    smokeMarker,
    smokeMemberId,
    smokeRunId,
  } = deps;

  async function verifyOrderCouponPointDirect(token, product) {
    await cleanupCart(token);
    cleanupOrderCoupons();
    cleanupOrderPoints();
    seedOrderPoints();
  
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
        fail('order coupon/point setup did not return direct cart row ids', directAdd);
      }
  
      const directRows = await currentCartRows(
        token,
        `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
      );
      const cartTotal = directRows.reduce((sum, row) => sum + Number(row.line_total || 0), 0);
      if (cartTotal <= 0) {
        fail('order coupon/point setup did not produce a positive cart total', directRows);
      }
  
      const orderCouponPrice = Math.max(1, Math.min(2000, Math.floor(cartTotal / 3)));
      const pointUse = Math.max(
        1,
        Math.min(1500, Math.floor((cartTotal - orderCouponPrice) / 2))
      );
      if (pointUse <= 0 || cartTotal - orderCouponPrice <= 0) {
        fail('order coupon/point setup product total is too small for a point-use assertion', {
          cartTotal,
          orderCouponPrice,
          pointUse,
        });
      }
  
      const zone = seedOrderCouponZone(orderCouponPrice);
      const download = await apiJson('/shop/coupons/download', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ cz_id: zone.cz_id }),
      });
      cpId = String(download.data?.cp_id || '');
      if (!cpId) {
        fail('order coupon download did not return a coupon id', download);
      }
  
      const quote = await apiJson(
        `/shop/shipping/quote?ct_ids=${encodeURIComponent(directCtIds.join(','))}`,
        {
          headers: authHeaders(token),
        }
      );
      const shippingTotal = Number(quote.data?.total || 0);
      const expectedOrderCoupon = Math.min(orderCouponPrice, cartTotal);
      const expectedPoint = Math.min(pointUse, 9000, Math.max(0, cartTotal - expectedOrderCoupon));
      const expectedReceipt = Math.max(
        0,
        cartTotal + shippingTotal - expectedOrderCoupon - expectedPoint
      );
      if (expectedPoint <= 0) {
        fail('order coupon/point setup did not produce a positive expected point use', {
          cartTotal,
          orderCouponPrice,
          pointUse,
          expectedOrderCoupon,
          expectedPoint,
        });
      }
  
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
          od_addr2: 'Order coupon point direct',
          od_memo: `${smokeMarker} order-coupon-point ${smokeRunId}`,
          od_settle_case: SETTLE_BANK,
          od_bank_account: 'smoke-bank',
          od_deposit_name: 'NextjsSmoke',
          cp_id: cpId,
          point_use: pointUse,
        }),
      });
      orderId = String(orderPayload.data?.od_id || orderPayload.data?.order?.od_id || '');
      if (!/^[0-9]{8,20}$/.test(orderId)) {
        fail('order coupon/point direct order did not return a valid order id', orderPayload);
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
        od_cart_coupon: 0,
        od_coupon: expectedOrderCoupon,
        od_receipt_point: expectedPoint,
        od_send_total: shippingTotal,
        od_receipt_price: 0,
        od_misu: expectedReceipt,
      };
      for (const [field, expected] of Object.entries(expectedFields)) {
        if (amountFields[field] !== expected) {
          fail('order coupon/point direct order amount field mismatch', {
            field,
            expected,
            actual: amountFields[field],
            amountFields,
            expectedFields,
            order,
          });
        }
      }
      if (String(order.od_status || '') !== STATUS_ORDERED) {
        fail('order coupon/point direct order did not keep bank orders in ordered/deposit-waiting status', order);
      }
      const wrongCartStatusItems = (order.items || []).filter(
        (item) => String(item.ct_status || '') !== STATUS_ORDERED
      );
      if (wrongCartStatusItems.length > 0) {
        fail('order coupon/point cart rows did not inherit the YoungCart order status', {
          expectedStatus: STATUS_ORDERED,
          wrongCartStatusItems,
          orderItems: order.items,
        });
      }
      const itemIds = (order.items || []).map((item) => String(item.ct_id));
      if (
        itemIds.length !== directCtIds.length ||
        itemIds.some((ctId) => !directCtIds.includes(ctId))
      ) {
        fail('order coupon/point direct order included unexpected cart rows', {
          directCtIds,
          itemIds,
          orderItems: order.items,
        });
      }
  
      await apiJson(`/shop/orders/${orderId}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({
          reason: 'smoke order coupon point restore',
        }),
      });
      const cancelledDetail = await apiJson(`/shop/orders/${orderId}`, {
        headers: authHeaders(token),
      });
      const cancelled = cancelledDetail.data || {};
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
        (field) => Number(cancelled[field] || 0) !== 0
      );
      if (
        String(cancelled.od_status || '') !== STATUS_CANCELLED ||
        nonZeroCancelledFields.length > 0 ||
        Number(cancelled.od_cancel_price || 0) !== cartTotal
      ) {
        fail('order coupon/point cancel did not restore YoungCart amount fields', {
          nonZeroCancelledFields,
          cancelled,
          cartTotal,
        });
      }
  
      const coupons = await apiJson('/shop/coupons/mine', {
        headers: authHeaders(token),
      });
      if (!(coupons.data || []).some((coupon) => String(coupon.cp_id || '') === cpId)) {
        fail('order coupon was not reusable after order cancellation', {
          cpId,
          coupons: coupons.data,
        });
      }
  
      return {
        orderCouponPointOrderId: orderId,
        orderCouponDiscount: expectedOrderCoupon,
        orderPointUse: expectedPoint,
        orderShippingTotal: shippingTotal,
        orderReceiptPrice: expectedReceipt,
        orderCouponReusableAfterCancel: true,
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
  
  async function verifyPaidOrderDirectCancelGuard(token, product) {
    await cleanupCart(token);
  
    const option = firstUsableOption(product);
    let orderId = '';
  
    try {
      const directAdd = await apiJson('/shop/cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
      });
      const directCtIds = cartIdsFromAddPayload(directAdd);
      if (directCtIds.length === 0) {
        fail('paid cancel guard setup did not return direct cart row ids', directAdd);
      }
  
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
          od_addr2: 'Paid cancel guard',
          od_memo: `${smokeMarker} paid-cancel-guard ${smokeRunId}`,
          od_settle_case: SETTLE_BANK,
          od_bank_account: 'smoke-bank',
          od_deposit_name: 'NextjsSmoke',
        }),
      });
      orderId = String(orderPayload.data?.od_id || orderPayload.data?.order?.od_id || '');
      if (!/^[0-9]{8,20}$/.test(orderId)) {
        fail('paid cancel guard order did not return a valid order id', orderPayload);
      }
  
      const marked = markSmokeOrderPaid(orderId);
      if (String(marked.status || '') !== STATUS_PAID || Number(marked.paid_amount || 0) <= 0) {
        fail('paid cancel guard helper did not mark the order as paid', marked);
      }
  
      const detail = await apiJson(`/shop/orders/${orderId}`, {
        headers: authHeaders(token),
      });
      const order = detail.data || {};
      if (String(order.od_status || '') !== STATUS_PAID) {
        fail('paid cancel guard order detail did not expose paid status', order);
      }
      if (order.can_cancel !== false || !String(order.cancel_block_reason || '')) {
        fail('paid cancel guard detail did not block customer cancellation', {
          can_cancel: order.can_cancel,
          cancel_block_reason: order.cancel_block_reason,
          order,
        });
      }
      const wrongCartStatusItems = (order.items || []).filter(
        (item) => String(item.ct_status || '') !== STATUS_PAID
      );
      if (wrongCartStatusItems.length > 0) {
        fail('paid cancel guard cart rows did not keep paid status', {
          expectedStatus: STATUS_PAID,
          wrongCartStatusItems,
          orderItems: order.items,
        });
      }
  
      await apiFailure(
        `/shop/orders/${orderId}`,
        {
          method: 'PATCH',
          headers: authHeaders(token),
          body: JSON.stringify({
            reason: 'smoke paid cancel guard',
          }),
        },
        400
      );
  
      const afterFailure = await apiJson(`/shop/orders/${orderId}`, {
        headers: authHeaders(token),
      });
      if (String(afterFailure.data?.od_status || '') !== STATUS_PAID) {
        fail('paid cancel guard direct PATCH changed the paid order status', afterFailure.data);
      }
  
      return {
        paidCancelGuardOrderId: orderId,
        paidCancelGuardBlocked: true,
        paidCancelGuardAmount: Number(marked.paid_amount || 0),
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
  
  async function verifyReceiptAndDeliveryLinks(token, product) {
    await cleanupCart(token);
  
    const option = firstUsableOption(product);
    let orderId = '';
  
    try {
      const directAdd = await apiJson('/shop/cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
      });
      const directCtIds = cartIdsFromAddPayload(directAdd);
      if (directCtIds.length === 0) {
        fail('receipt/delivery setup did not return direct cart row ids', directAdd);
      }
  
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
          od_addr2: 'Receipt delivery links',
          od_memo: `${smokeMarker} receipt-delivery ${smokeRunId}`,
          od_settle_case: SETTLE_BANK,
          od_bank_account: 'smoke-bank',
          od_deposit_name: 'NextjsSmoke',
        }),
      });
      orderId = String(orderPayload.data?.od_id || orderPayload.data?.order?.od_id || '');
      if (!/^[0-9]{8,20}$/.test(orderId)) {
        fail('receipt/delivery order did not return a valid order id', orderPayload);
      }
  
      const marked = markSmokeOrderPaid(orderId, [
        '--status=shipping',
        '--with-toss-receipt',
        '--with-delivery',
      ]);
      if (
        String(marked.status || '') !== STATUS_SHIPPING ||
        !String(marked.tno || '') ||
        !String(marked.invoice || '') ||
        Number(marked.paid_amount || 0) <= 0
      ) {
        fail('receipt/delivery helper did not mark the order with receipt and delivery metadata', marked);
      }
  
      const detail = await apiJson(`/shop/orders/${orderId}`, {
        headers: authHeaders(token),
      });
      const order = detail.data || {};
      if (String(order.od_status || '') !== STATUS_SHIPPING) {
        fail('receipt/delivery detail did not expose shipping status', order);
      }
      if (order.can_cancel !== false || !String(order.cancel_block_reason || '')) {
        fail('receipt/delivery detail did not block customer cancellation', {
          can_cancel: order.can_cancel,
          cancel_block_reason: order.cancel_block_reason,
          order,
        });
      }
  
      const receiptUrl = String(order.receipt_url || order.od_payment_receipt_url || '');
      if (
        !receiptUrl.includes('dashboard.tosspayments.com/receipt/redirection') ||
        !receiptUrl.includes(encodeURIComponent(String(marked.tno)))
      ) {
        fail('receipt/delivery detail did not expose the expected Toss receipt URL', {
          receiptUrl,
          marked,
          order,
        });
      }
      if (
        String(order.od_payment_app_value || '') !== String(marked.app_no || '') ||
        !String(order.od_payment_app_label || '')
      ) {
        fail('receipt/delivery detail did not expose the YoungCart approval number fields', {
          marked,
          order,
        });
      }
  
      const deliveryInquiryUrl = String(
        order.delivery_inquiry_url || order.od_delivery_inquiry_url || ''
      );
      if (
        String(order.od_delivery_company || '') !== String(marked.delivery_company || '') ||
        String(order.od_invoice || '') !== String(marked.invoice || '') ||
        !String(order.od_invoice_time || '') ||
        !deliveryInquiryUrl
      ) {
        fail('receipt/delivery detail did not expose invoice and delivery inquiry fields', {
          deliveryInquiryUrl,
          marked,
          order,
        });
      }
  
      const wrongCartStatusItems = (order.items || []).filter(
        (item) => String(item.ct_status || '') !== STATUS_SHIPPING
      );
      if (wrongCartStatusItems.length > 0) {
        fail('receipt/delivery cart rows did not inherit shipping status', {
          expectedStatus: STATUS_SHIPPING,
          wrongCartStatusItems,
          orderItems: order.items,
        });
      }
  
      return {
        receiptDeliveryOrderId: orderId,
        receiptUrlExposed: true,
        deliveryInquiryExposed: true,
        deliveryStatus: STATUS_SHIPPING,
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
  
  async function verifyCashReceiptLink(token, product) {
    await cleanupCart(token);
  
    const option = firstUsableOption(product);
    let orderId = '';
  
    try {
      const directAdd = await apiJson('/shop/cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
      });
      const directCtIds = cartIdsFromAddPayload(directAdd);
      if (directCtIds.length === 0) {
        fail('cash receipt setup did not return direct cart row ids', directAdd);
      }
  
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
          od_addr2: 'Cash receipt link',
          od_memo: `${smokeMarker} cash-receipt ${smokeRunId}`,
          od_settle_case: SETTLE_BANK,
          od_bank_account: 'smoke-bank',
          od_deposit_name: 'NextjsSmoke',
        }),
      });
      orderId = String(orderPayload.data?.od_id || orderPayload.data?.order?.od_id || '');
      if (!/^[0-9]{8,20}$/.test(orderId)) {
        fail('cash receipt order did not return a valid order id', orderPayload);
      }
  
      const marked = markSmokeOrderPaid(orderId, ['--with-toss-cash-receipt']);
      if (
        String(marked.status || '') !== STATUS_PAID ||
        !String(marked.cash_no || '') ||
        !String(marked.cash_receipt_url || '') ||
        Number(marked.paid_amount || 0) <= 0
      ) {
        fail('cash receipt helper did not mark the order with issued cash receipt metadata', marked);
      }
  
      const detail = await apiJson(`/shop/orders/${orderId}`, {
        headers: authHeaders(token),
      });
      const order = detail.data || {};
      const cashReceiptUrl = String(order.cash_receipt_url || order.od_cash_receipt_url || '');
      const issueUrl = String(order.cash_receipt_issue_url || order.od_cash_receipt_issue_url || '');
  
      if (String(order.od_status || '') !== STATUS_PAID) {
        fail('cash receipt detail did not expose paid status', order);
      }
      if (
        Number(order.od_cash || 0) !== 1 ||
        String(order.od_cash_no || '') !== String(marked.cash_no || '') ||
        !String(order.od_cash_info || '').includes(String(marked.cash_no || ''))
      ) {
        fail('cash receipt detail did not expose issued cash receipt fields', {
          marked,
          order,
        });
      }
      if (cashReceiptUrl !== String(marked.cash_receipt_url || '')) {
        fail('cash receipt detail did not expose the expected issued receipt URL', {
          expected: marked.cash_receipt_url,
          actual: cashReceiptUrl,
          order,
        });
      }
      if (issueUrl) {
        fail('cash receipt detail exposed an issue URL even though a cash receipt was already issued', {
          issueUrl,
          order,
        });
      }
      if (order.can_cancel !== false || !String(order.cancel_block_reason || '')) {
        fail('cash receipt paid detail did not block customer cancellation', {
          can_cancel: order.can_cancel,
          cancel_block_reason: order.cancel_block_reason,
          order,
        });
      }
  
      return {
        cashReceiptOrderId: orderId,
        cashReceiptUrlExposed: true,
        cashReceiptNo: String(marked.cash_no || ''),
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
    verifyOrderCouponPointDirect,
    verifyPaidOrderDirectCancelGuard,
    verifyReceiptAndDeliveryLinks,
    verifyCashReceiptLink,
  };
}

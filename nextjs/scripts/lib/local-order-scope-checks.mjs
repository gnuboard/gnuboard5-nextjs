export function createLocalOrderScopeChecks(deps) {
  const {
    SETTLE_BANK,
    SETTLE_CARD,
    STATUS_CANCELLED,
    STATUS_PAID,
    apiFailure,
    apiJson,
    apiOk,
    authHeaders,
    cartAddBody,
    cartIdsFromAddPayload,
    cleanupCart,
    cleanupOrders,
    cleanupSendCoupons,
    createCookieJar,
    currentCartRows,
    currentGuestCartRows,
    fail,
    firstUsableOption,
    seedSendCouponZone,
    smokeMarker,
    smokeMemberId,
    smokeRunId,
  } = deps;

  async function verifyDirectBuyScope(token, product) {
    await cleanupCart(token);
  
    const option = firstUsableOption(product);
    await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBody(product, option, 1)),
    });
  
    const visibleBeforeDirect = await currentCartRows(token);
    const normalRow = visibleBeforeDirect.find((row) => String(row.it_id) === product.it_id);
    if (!normalRow) {
      fail('direct-buy setup did not create a normal cart row', visibleBeforeDirect);
    }
  
    const directAdd = await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
    });
    const directCtIds = cartIdsFromAddPayload(directAdd);
    if (directCtIds.length === 0) {
      fail('direct cart add did not return cart row ids', directAdd);
    }
  
    const visibleAfterDirect = await currentCartRows(token);
    if (visibleAfterDirect.some((row) => directCtIds.includes(String(row.ct_id)))) {
      fail('direct cart rows leaked into the normal cart response', {
        directCtIds,
        visibleAfterDirect,
      });
    }
    if (!visibleAfterDirect.some((row) => String(row.ct_id) === String(normalRow.ct_id))) {
      fail('normal cart row disappeared after direct cart add', {
        normalRow,
        visibleAfterDirect,
      });
    }
  
    const directRows = await currentCartRows(
      token,
      `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
    );
    if (directRows.length !== directCtIds.length) {
      fail('direct cart query did not return exactly the direct rows', {
        directCtIds,
        directRows,
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
        od_addr2: 'Direct buy scope',
        od_memo: `${smokeMarker} direct ${smokeRunId}`,
        od_settle_case: '무통장',
        od_bank_account: 'smoke-bank',
        od_deposit_name: 'NextjsSmoke',
      }),
    });
    const orderId = String(orderPayload.data?.od_id || orderPayload.data?.order?.od_id || '');
    if (!/^[0-9]{8,20}$/.test(orderId)) {
      fail('direct-buy scoped order did not return a valid order id', orderPayload);
    }
  
    const detail = await apiJson(`/shop/orders/${orderId}`, {
      headers: authHeaders(token),
    });
    const orderedItems = detail.data?.items || [];
    const unexpectedItems = orderedItems.filter(
      (item) => !directCtIds.includes(String(item.ct_id))
    );
    if (orderedItems.length !== directCtIds.length || unexpectedItems.length > 0) {
      fail('direct-buy scoped order included non-direct cart rows', {
        directCtIds,
        orderedItems,
      });
    }
  
    const remainingRows = await currentCartRows(token);
    if (!remainingRows.some((row) => String(row.ct_id) === String(normalRow.ct_id))) {
      fail('normal cart row was consumed by a direct-buy scoped order', {
        normalRow,
        remainingRows,
      });
    }
  
    return {
      directOrderId: orderId,
      directRows: directCtIds.length,
      normalCartPreserved: true,
    };
  }
  
  async function verifyGuestOrderLookup(product) {
    const option = firstUsableOption(product);
    const guestCartJar = createCookieJar();
    let orderId = '';
  
    try {
      const directAdd = await apiJson('/shop/cart', {
        method: 'POST',
        cookieJar: guestCartJar,
        body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
      });
      const directCtIds = cartIdsFromAddPayload(directAdd);
      if (directCtIds.length === 0) {
        fail('guest direct cart add did not return cart row ids', directAdd);
      }
  
      const guestPassword = 'abc123';
      const orderPayload = await apiJson('/shop/orders', {
        method: 'POST',
        cookieJar: guestCartJar,
        body: JSON.stringify({
          ct_ids: directCtIds.join(','),
          od_name: 'GuestSmoke',
          od_tel: '02-000-0000',
          od_hp: '010-1234-5678',
          od_email: 'guest-smoke@example.test',
          od_zip: '12345',
          od_addr1: 'Next.js guest smoke address',
          od_addr2: 'Guest order lookup',
          od_memo: `${smokeMarker} guest ${smokeRunId}`,
          od_settle_case: SETTLE_BANK,
          od_bank_account: 'smoke-bank',
          od_deposit_name: 'GuestSmoke',
          od_pwd: guestPassword,
        }),
      });
  
      orderId = String(orderPayload.data?.od_id || orderPayload.data?.order?.od_id || '');
      const createdUid = String(orderPayload.data?.uid || orderPayload.data?.order?.uid || '');
      if (!/^[0-9]{8,20}$/.test(orderId) || createdUid.length !== 64) {
        fail('guest order did not return a valid order id and uid', orderPayload);
      }
  
      await apiFailure(
        '/shop/orders/lookup',
        {
          method: 'POST',
          cookieJar: createCookieJar(),
          body: JSON.stringify({
            od_id: orderId,
            od_pwd: 'wrong123',
          }),
        },
        404
      );
  
      const lookupJar = createCookieJar();
      const lookupPayload = await apiJson('/shop/orders/lookup', {
        method: 'POST',
        cookieJar: lookupJar,
        body: JSON.stringify({
          od_id: orderId,
          od_pwd: guestPassword,
        }),
      });
      const lookupUid = String(lookupPayload.data?.uid || '');
      const redirectUrl = String(lookupPayload.data?.redirect_url || '');
      if (lookupUid !== createdUid || !redirectUrl.includes(`uid=${encodeURIComponent(lookupUid)}`)) {
        fail('guest order lookup did not return the expected uid redirect', {
          createdUid,
          lookupPayload,
        });
      }
  
      const detail = await apiJson(
        `/shop/orders/${orderId}?uid=${encodeURIComponent(lookupUid)}`,
        {
          cookieJar: createCookieJar(),
        }
      );
      const order = detail.data || {};
      if (String(order.od_id || '') !== orderId || String(order.mb_id || '') !== '') {
        fail('guest order uid detail did not return the expected guest order', order);
      }
      if (!String(order.od_memo || '').includes(smokeMarker)) {
        fail('guest order detail is missing the smoke cleanup marker', order);
      }
      if (order.can_cancel !== true || String(order.cancel_block_reason || '') !== '') {
        fail('guest order detail did not expose YoungCart guest cancel availability', {
          can_cancel: order.can_cancel,
          cancel_block_reason: order.cancel_block_reason,
        });
      }
  
      await apiFailure(
        `/shop/orders/${orderId}`,
        {
          method: 'PATCH',
          cookieJar: createCookieJar(),
          body: JSON.stringify({
            uid: 'wrong-guest-order-uid',
            reason: 'guest order wrong uid cancel smoke',
          }),
        },
        404
      );
  
      await apiJson(`/shop/orders/${orderId}`, {
        method: 'PATCH',
        cookieJar: createCookieJar(),
        body: JSON.stringify({
          uid: lookupUid,
          reason: 'guest order cancel smoke',
        }),
      });
  
      const cancelledDetail = await apiJson(
        `/shop/orders/${orderId}?uid=${encodeURIComponent(lookupUid)}`,
        {
          cookieJar: createCookieJar(),
        }
      );
      const cancelled = cancelledDetail.data || {};
      const notCancelled = (cancelled.items || []).filter(
        (item) => String(item.ct_status || '') !== STATUS_CANCELLED
      );
      if (
        String(cancelled.od_status || '') !== STATUS_CANCELLED ||
        cancelled.can_cancel !== false ||
        notCancelled.length > 0 ||
        Number(cancelled.od_cancel_price || 0) !== Number(cancelled.od_cart_price || 0)
      ) {
        fail('guest order cancel did not persist YoungCart cancellation state', {
          cancelled,
          notCancelled,
        });
      }
  
      return {
        guestOrderId: orderId,
        guestUidLength: lookupUid.length,
        guestRows: directCtIds.length,
        guestCancelled: true,
      };
    } catch (error) {
      if (orderId) {
        cleanupOrders(orderId, true);
      }
      throw error;
    }
  }
  
  async function verifyGuestPaymentPrepareCancel(product) {
    const option = firstUsableOption(product);
    const guestJar = createCookieJar();
    let orderId = '';
  
    try {
      await apiJson('/shop/cart', {
        method: 'POST',
        cookieJar: guestJar,
        body: JSON.stringify(cartAddBody(product, option, 1)),
      });
      const normalRows = await currentGuestCartRows(guestJar);
      const normalRow = normalRows.find((row) => String(row.it_id) === product.it_id);
      if (!normalRow) {
        fail('guest payment setup did not create a normal cart row', normalRows);
      }
  
      const directAdd = await apiJson('/shop/cart', {
        method: 'POST',
        cookieJar: guestJar,
        body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
      });
      const directCtIds = cartIdsFromAddPayload(directAdd);
      if (directCtIds.length === 0) {
        fail('guest payment prepare setup did not return direct cart ids', directAdd);
      }
  
      const prepared = await apiJson('/shop/payment/prepare', {
        method: 'POST',
        cookieJar: guestJar,
        body: JSON.stringify({
          ct_ids: directCtIds.join(','),
          od_name: 'GuestSmoke',
          od_tel: '02-000-0000',
          od_hp: '010-1234-5678',
          od_email: 'guest-payment-smoke@example.test',
          od_zip: '12345',
          od_addr1: 'Next.js guest smoke address',
          od_addr2: 'Guest payment prepare cancel',
          od_memo: `${smokeMarker} guest-payment ${smokeRunId}`,
          od_settle_case: SETTLE_CARD,
          od_pwd: 'abc123',
        }),
      });
  
      orderId = String(prepared.data?.order_id || '');
      const uid = String(prepared.data?.uid || '');
      const amount = Number(prepared.data?.amount || 0);
      if (!/^[0-9]{8,20}$/.test(orderId) || uid.length !== 64 || amount <= 0) {
        fail('guest payment prepare did not return a valid order id, uid, and amount', prepared);
      }
  
      await apiFailure(
        '/shop/payment/cancel',
        {
          method: 'POST',
          cookieJar: createCookieJar(),
          body: JSON.stringify({
            order_id: orderId,
            reason: 'untrusted guest cancel smoke',
          }),
        },
        404
      );
  
      const detail = await apiJson(
        `/shop/orders/${orderId}?uid=${encodeURIComponent(uid)}`,
        {
          cookieJar: createCookieJar(),
        }
      );
      const order = detail.data || {};
      if (String(order.od_id || '') !== orderId || String(order.od_status || '') === '') {
        fail('guest prepared payment order detail was not visible with uid', order);
      }
  
      const cancelled = await apiJson('/shop/payment/cancel', {
        method: 'POST',
        cookieJar: guestJar,
        body: JSON.stringify({
          order_id: orderId,
          reason: 'guest payment prepare cancel smoke',
        }),
      });
      if (String(cancelled.data?.status || '') !== STATUS_CANCELLED) {
        fail('guest payment cancel did not return cancelled status', cancelled);
      }
  
      const restoredDirectRows = await currentGuestCartRows(
        guestJar,
        `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
      );
      if (restoredDirectRows.length !== directCtIds.length) {
        fail('guest payment cancel did not restore direct-buy rows', {
          directCtIds,
          restoredDirectRows,
        });
      }
  
      const visibleRows = await currentGuestCartRows(guestJar);
      if (!visibleRows.some((row) => String(row.ct_id) === String(normalRow.ct_id))) {
        fail('guest payment cancel consumed the normal cart row', {
          normalRow,
          visibleRows,
        });
      }
  
      await apiOk('/shop/cart', {
        method: 'DELETE',
        cookieJar: guestJar,
      });
  
      return {
        guestPreparedOrderId: orderId,
        guestPreparedRows: directCtIds.length,
        guestPaymentCancelled: true,
      };
    } catch (error) {
      if (orderId) {
        cleanupOrders(orderId, true);
      }
      throw error;
    }
  }
  
  async function verifyPreparedPaymentRestore(token, product) {
    await cleanupCart(token);
  
    const option = firstUsableOption(product);
    await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBody(product, option, 1)),
    });
    const normalRows = await currentCartRows(token);
    const normalRow = normalRows.find((row) => String(row.it_id) === product.it_id);
    if (!normalRow) {
      fail('prepared payment restore setup did not create a normal cart row', normalRows);
    }
  
    const directAdd = await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
    });
    const directCtIds = cartIdsFromAddPayload(directAdd);
    if (directCtIds.length === 0) {
      fail('prepared payment restore setup did not return direct cart ids', directAdd);
    }
  
    const orderBody = {
      ct_ids: directCtIds.join(','),
      od_name: 'NextjsSmoke',
      od_tel: '02-000-0000',
      od_hp: '010-1234-5678',
      od_email: `${smokeMemberId}@example.test`,
      od_zip: '12345',
      od_addr1: 'Next.js smoke address',
      od_addr2: 'Prepared payment restore',
      od_memo: `${smokeMarker} prepared ${smokeRunId}`,
      od_settle_case: '신용카드',
    };
  
    const prepared = await apiJson('/shop/payment/prepare', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(orderBody),
    });
    const preparedOrderId = String(prepared.data?.order_id || '');
    if (!/^[0-9]{8,20}$/.test(preparedOrderId)) {
      fail('payment prepare did not return a valid order id', prepared);
    }
  
    await apiJson('/shop/payment/cancel', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        order_id: preparedOrderId,
        reason: 'smoke KCP cancel restore',
      }),
    });
  
    const cancelledRows = await currentCartRows(
      token,
      `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
    );
    if (cancelledRows.length !== directCtIds.length) {
      fail('payment cancel did not restore direct-buy cart rows', {
        directCtIds,
        cancelledRows,
      });
    }
  
    await cleanupCart(token);
    await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBody(product, option, 1)),
    });
    const refreshNormalRows = await currentCartRows(token);
    const refreshNormalRow = refreshNormalRows.find((row) => String(row.it_id) === product.it_id);
    if (!refreshNormalRow) {
      fail('prepared payment refresh setup did not create a normal cart row', refreshNormalRows);
    }
    const directRefreshAdd = await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
    });
    const refreshCtIds = cartIdsFromAddPayload(directRefreshAdd);
    if (refreshCtIds.length === 0) {
      fail('prepared payment refresh setup did not return direct cart ids', directRefreshAdd);
    }
  
    const refreshPrepared = await apiJson('/shop/payment/prepare', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        ...orderBody,
        ct_ids: refreshCtIds.join(','),
        od_memo: `${smokeMarker} prepared-refresh ${smokeRunId}`,
      }),
    });
    const refreshOrderId = String(refreshPrepared.data?.order_id || '');
    if (!/^[0-9]{8,20}$/.test(refreshOrderId)) {
      fail('refresh payment prepare did not return a valid order id', refreshPrepared);
    }
  
    const restoredByRead = await currentCartRows(
      token,
      `?ct_ids=${encodeURIComponent(refreshCtIds.join(','))}`
    );
    if (restoredByRead.length !== refreshCtIds.length) {
      fail('direct-buy ct_ids read did not restore pending prepared rows', {
        refreshCtIds,
        restoredByRead,
      });
    }
  
    const visibleNormalRows = await currentCartRows(token);
    if (!visibleNormalRows.some((row) => String(row.ct_id) === String(refreshNormalRow.ct_id))) {
      fail('prepared payment restore consumed the normal cart row', {
        normalRow: refreshNormalRow,
        visibleNormalRows,
      });
    }
  
    await cleanupCart(token);
    const kcpDirectAdd = await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBody(product, option, 1, { direct: true })),
    });
    const kcpCtIds = cartIdsFromAddPayload(kcpDirectAdd);
    if (kcpCtIds.length === 0) {
      fail('KCP confirm setup did not return direct cart ids', kcpDirectAdd);
    }
  
    const kcpPrepared = await apiJson('/shop/payment/prepare', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        ...orderBody,
        ct_ids: kcpCtIds.join(','),
        od_memo: `${smokeMarker} kcp-confirm ${smokeRunId}`,
      }),
    });
    const kcpOrderId = String(kcpPrepared.data?.order_id || '');
    const kcpAmount = Number(kcpPrepared.data?.amount || 0);
    if (!/^[0-9]{8,20}$/.test(kcpOrderId) || kcpAmount <= 0) {
      fail('KCP payment prepare did not return a valid order/amount', kcpPrepared);
    }
  
    const preparedPgService = String(kcpPrepared.data?.pg_service || '').toLowerCase();
    if (preparedPgService !== 'kcp') {
      await apiJson('/shop/payment/cancel', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          order_id: kcpOrderId,
          reason: `smoke PG confirm skipped for ${preparedPgService || 'unknown'} config`,
        }),
      });
  
      return {
        preparedOrderId,
        refreshOrderId,
        kcpOrderId,
        restoredDirectRows: directCtIds.length + refreshCtIds.length,
        pgConfirmSkipped: preparedPgService || 'unknown',
      };
    }
  
    const confirmed = await apiJson('/shop/payment/confirm', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        pg_service: 'kcp',
        order_id: kcpOrderId,
        amount: kcpAmount,
        res_cd: '0000',
        res_msg: 'smoke approval',
        enc_info: 'smoke-enc-info',
        enc_data: 'smoke-enc-data',
        tran_cd: '00100000',
        site_cd: 'T0000',
        tno: `SMOKEKCP${smokeRunId.slice(-8)}`,
      }),
    });
    if (confirmed.data?.status !== STATUS_PAID) {
      fail('KCP confirm did not finalize the order status', confirmed);
    }
  
    const kcpDetail = await apiJson(`/shop/orders/${kcpOrderId}`, {
      headers: authHeaders(token),
    });
    const kcpItems = kcpDetail.data?.items || [];
    if (
      kcpItems.length !== kcpCtIds.length ||
      kcpItems.some((item) => !kcpCtIds.includes(String(item.ct_id)))
    ) {
      fail('KCP confirm included unexpected cart rows', {
        kcpCtIds,
        kcpItems,
      });
    }
    if (String(kcpDetail.data?.od_status || '') !== STATUS_PAID) {
      fail('KCP confirmed order detail did not persist YoungCart paid status', kcpDetail.data);
    }
    if (kcpItems.some((item) => String(item.ct_status || '') !== STATUS_PAID)) {
      fail('KCP confirmed cart rows did not inherit YoungCart paid status', {
        expectedStatus: STATUS_PAID,
        kcpItems,
      });
    }
  
    return {
      preparedOrderId,
      refreshOrderId,
      kcpOrderId,
      restoredDirectRows: directCtIds.length + refreshCtIds.length,
    };
  }
  
  async function verifySendCouponPrepare(token, product) {
    await cleanupCart(token);
    cleanupSendCoupons();
  
    const zone = seedSendCouponZone();
    const download = await apiJson('/shop/coupons/download', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ cz_id: zone.cz_id }),
    });
    const cpId = String(download.data?.cp_id || '');
    if (!cpId) {
      fail('shipping coupon download did not return a coupon id', download);
    }
  
    const option = firstUsableOption(product);
    await apiJson('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBody(product, option, 1)),
    });
  
    const cart = await apiJson('/shop/cart', {
      headers: authHeaders(token),
    });
    const cartTotal = Number(cart.data?.total_price || 0);
    if (cartTotal <= 0) {
      fail('shipping coupon prepare setup did not produce a positive cart total', cart);
    }
  
    const quote = await apiJson('/shop/shipping/quote', {
      headers: authHeaders(token),
    });
    const shippingTotal = Number(quote.data?.total || 0);
    const expectedDiscount = Math.min(1000, Math.max(0, shippingTotal));
  
    const prepared = await apiJson('/shop/payment/prepare', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        od_name: 'NextjsSmoke',
        od_tel: '02-000-0000',
        od_hp: '010-1234-5678',
        od_email: `${smokeMemberId}@example.test`,
        od_zip: '12345',
        od_addr1: 'Next.js smoke address',
        od_addr2: 'Shipping coupon prepare',
        od_memo: `${smokeMarker} send-coupon ${smokeRunId}`,
        od_settle_case: SETTLE_CARD,
        cp_id_send: cpId,
      }),
    });
  
    const orderId = String(prepared.data?.order_id || '');
    const amount = Number(prepared.data?.amount || 0);
    const expectedAmount = cartTotal + shippingTotal - expectedDiscount;
    if (!/^[0-9]{8,20}$/.test(orderId) || amount !== expectedAmount) {
      fail('shipping coupon prepare amount did not match YoungCart-style totals', {
        orderId,
        amount,
        expectedAmount,
        cartTotal,
        shippingTotal,
        expectedDiscount,
        prepared: prepared.data,
      });
    }
  
    await apiJson('/shop/payment/cancel', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        order_id: orderId,
        reason: 'smoke shipping coupon prepare restore',
      }),
    });
  
    return {
      sendCouponOrderId: orderId,
      sendCouponDiscount: expectedDiscount,
      sendCouponAmount: amount,
    };
  }

  return {
    verifyDirectBuyScope,
    verifyGuestOrderLookup,
    verifyGuestPaymentPrepareCancel,
    verifyPreparedPaymentRestore,
    verifySendCouponPrepare,
  };
}

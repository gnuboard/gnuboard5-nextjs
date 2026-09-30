export function createOrderBrowserHelpers(deps) {
  const {
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
  } = deps;
async function fillOrderForm(page) {
  const form = page.locator('form').last();
  await form.waitFor({ state: 'visible', timeout: 10000 });

  const sections = form.locator('section');
  const sectionCount = await sections.count();
  if (sectionCount < 4) {
    const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    fail('order form did not render the expected sections', {
      url: page.url(),
      sectionCount,
      body: bodyText.slice(0, 1200),
    });
  }

  const ordererSection = sections.nth(1);
  const ordererInputs = ordererSection.locator('input');
  const ordererInputCount = await ordererInputs.count();
  if (ordererInputCount < 8) {
    fail('orderer section did not render the expected inputs', {
      url: page.url(),
      sectionCount,
      ordererInputCount,
      ordererText: await ordererSection.innerText({ timeout: 3000 }).catch(() => ''),
    });
  }

  await ordererInputs.nth(0).fill('NextjsSmoke');
  await ordererInputs.nth(1).fill('02-000-0000');
  await ordererInputs.nth(2).fill('010-1234-5678');
  await ordererInputs.nth(3).fill('12345');
  await ordererInputs.nth(4).fill('Next.js smoke address');
  await ordererInputs.nth(5).fill('Order browser flow');
  await ordererInputs.nth(6).fill(smokeMarker);
  await ordererInputs.nth(7).fill(`${smokeMemberId}@example.test`);

  const recipientSection = sections.nth(2);
  await recipientSection.locator('textarea').first().fill(`${smokeMarker} ${smokeRunId}`);

  const paymentSection = sections.nth(3);
  const bankSelect = paymentSection.locator('select').first();
  if ((await bankSelect.count()) === 0) {
    fail('bank account selector was not rendered on the order page');
  }
  const firstBankValue = await bankSelect.evaluate((select) => {
    const option = Array.from(select.options).find((item) => item.value);
    return option?.value || '';
  });
  if (!firstBankValue) {
    fail('local payment config has no bank account for bank transfer orders');
  }
  await bankSelect.selectOption(firstBankValue);
  await paymentSection.locator('input[type="text"]').first().fill('NextjsSmoke');

  const agreementSection = sections.last();
  await agreementSection.locator('input[type="checkbox"]').first().check();
}

function orderIdFromPageUrl(page) {
  return new URL(page.url()).pathname.split('/').filter(Boolean).pop() || '';
}

function expectedYoungCartOrderTotal(order) {
  return Math.max(
    0,
    Number(order?.od_cart_price || 0) +
      Number(order?.od_send_cost || 0) +
      Number(order?.od_send_cost2 || 0) -
      Number(order?.od_cart_coupon || 0) -
      Number(order?.od_coupon || 0) -
      Number(order?.od_send_coupon || 0) -
      Number(order?.od_cancel_price || 0)
  );
}

function assertYoungCartOrderTotals(order, label) {
  const expectedTotal = expectedYoungCartOrderTotal(order);
  const expectedReceiptTotal =
    Number(order?.od_receipt_price || 0) + Number(order?.od_receipt_point || 0);
  const expectedMisu = Math.max(0, expectedTotal - expectedReceiptTotal);

  if (Number(order?.od_total_price || 0) !== expectedTotal) {
    fail(`${label} did not expose the YoungCart total price formula`, {
      expectedTotal,
      actual: Number(order?.od_total_price || 0),
      order,
    });
  }
  if (Number(order?.od_receipt_total || 0) !== expectedReceiptTotal) {
    fail(`${label} did not expose the YoungCart receipt total`, {
      expectedReceiptTotal,
      actual: Number(order?.od_receipt_total || 0),
      order,
    });
  }
  if (Number(order?.od_misu_price || 0) !== expectedMisu) {
    fail(`${label} did not expose the YoungCart unpaid amount`, {
      expectedMisu,
      actual: Number(order?.od_misu_price || 0),
      order,
    });
  }
}

function assertYoungCartOrderListRow(row, detailOrder, label) {
  const expectedListPrice =
    Number(detailOrder?.od_cart_price || 0) +
    Number(detailOrder?.od_send_cost || 0) +
    Number(detailOrder?.od_send_cost2 || 0);
  const expectedItemCount = Number(
    detailOrder?.od_cart_count || detailOrder?.items?.length || 0
  );

  if (Number(row?.od_list_price ?? row?.od_order_price ?? 0) !== expectedListPrice) {
    fail(`${label} did not expose the YoungCart order list amount`, {
      expectedListPrice,
      row,
      detailOrder,
    });
  }
  if (Number(row?.od_receipt_price || 0) !== Number(detailOrder?.od_receipt_price || 0)) {
    fail(`${label} did not expose the YoungCart paid amount`, {
      row,
      detailOrder,
    });
  }
  if (Number(row?.od_misu || 0) !== Number(detailOrder?.od_misu || 0)) {
    fail(`${label} did not expose the YoungCart unpaid amount`, {
      row,
      detailOrder,
    });
  }
  if (Number(row?.od_cart_count || row?.item_count || 0) !== expectedItemCount) {
    fail(`${label} did not expose the YoungCart cart count`, {
      expectedItemCount,
      row,
      detailOrder,
    });
  }
}

async function createOrderInBrowser(page, token, product) {
  await page.goto(`${appUrl}/shop/order`, { waitUntil: 'networkidle' });
  await page.getByText(product.it_name, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
  if (!new URL(page.url()).pathname.startsWith('/shop/order')) {
    const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    fail('order page redirected before the order form was usable', {
      url: page.url(),
      body: bodyText.slice(0, 1200),
    });
  }
  await fillOrderForm(page);

  const observedResponses = [];
  const recordResponse = (response) => {
    const request = response.request();
    if (request.method() === 'POST' && response.url().includes('/shop/')) {
      observedResponses.push({
        status: response.status(),
        url: response.url(),
      });
    }
  };
  page.on('response', recordResponse);

  let orderResponse = null;
  try {
    [orderResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().replace(/\/+$/, '').endsWith('/shop/orders') &&
          response.request().method() === 'POST'
      ),
      page.locator('form button[type="submit"]').last().click(),
    ]);
  } catch (error) {
    const invalidFields = await page.evaluate(() =>
      Array.from(document.querySelectorAll('form input, form select, form textarea'))
        .filter((element) => 'checkValidity' in element && !element.checkValidity())
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          name: element.getAttribute('name') || '',
          id: element.id || '',
          type: element.getAttribute('type') || '',
          value: 'value' in element ? String(element.value || '') : '',
          message: 'validationMessage' in element ? element.validationMessage : '',
        }))
    );
    const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    fail('order create did not post to /shop/orders before timeout', {
      message: error.message,
      url: page.url(),
      observedResponses,
      invalidFields,
      body: bodyText.slice(0, 1600),
    });
  } finally {
    page.off('response', recordResponse);
  }

  await assertOkResponse(orderResponse, 'order create');
  await page.waitForURL(new RegExp('/shop/orders/[0-9]+$'), { timeout: 10000 });

  const orderId = orderIdFromPageUrl(page);
  if (!/^[0-9]{8,20}$/.test(orderId)) {
    fail('order create did not navigate to an order detail URL', { url: page.url() });
  }

  const detail = await apiJson(`/shop/orders/${orderId}`, {
    headers: authHeaders(token),
  });
  const order = detail.data;
  if (order?.mb_id !== smokeMemberId || order?.od_status !== STATUS_ORDERED) {
    fail('created order detail did not persist expected member/status', order);
  }
  if (!String(order?.od_memo || '').includes(smokeMarker)) {
    fail('created order is missing the smoke cleanup marker', order);
  }
  const taxTotal =
    Number(order?.od_tax_mny || 0) +
    Number(order?.od_vat_mny || 0) +
    Number(order?.od_free_mny || 0);
  const expectedTaxBase =
    Number(order?.od_receipt_price || 0) + Number(order?.od_misu || 0);
  if (taxTotal !== expectedTaxBase) {
    fail('created order did not persist YoungCart tax amount fields', {
      taxTotal,
      expectedTaxBase,
      receiptPrice: Number(order?.od_receipt_price || 0),
      misu: Number(order?.od_misu || 0),
      order,
    });
  }
  assertYoungCartOrderTotals(order, 'created order detail');
  const item = (order.items || []).find((row) => String(row.it_id) === product.it_id);
  if (!item || item.ct_status !== STATUS_ORDERED) {
    fail('created order items did not inherit the YoungCart order status', {
      expectedStatus: STATUS_ORDERED,
      orderItems: order.items,
    });
  }
  if (order.can_cancel !== true || String(order.cancel_block_reason || '') !== '') {
    fail('created order detail did not expose YoungCart customer cancel availability', order);
  }
  const list = await apiJson('/shop/orders?per_page=50', {
    headers: authHeaders(token),
  });
  const listRow = (list.data || []).find((row) => String(row.od_id) === String(orderId));
  if (!listRow) {
    fail('created order did not appear in the YoungCart order list API', list.data);
  }
  assertYoungCartOrderListRow(listRow, order, 'created order list row');

  return orderId;
}

async function cancelOrderInBrowser(page, token, orderId) {
  const beforeCancel = await apiJson(`/shop/orders/${orderId}`, {
    headers: authHeaders(token),
  });
  if (beforeCancel.data?.can_cancel !== true) {
    fail('cancellable order API did not expose can_cancel=true before browser cancellation', beforeCancel.data);
  }

  await page.goto(`${appUrl}/shop/orders/${orderId}`, { waitUntil: 'networkidle' });
  const statusSectionButtons = page.locator('section').first().locator('button');
  if ((await statusSectionButtons.count()) < 2) {
    fail('order detail did not render a cancel button for a cancellable order', {
      orderId,
      url: page.url(),
    });
  }

  const observedResponses = [];
  const recordResponse = (response) => {
    const request = response.request();
    if (request.method() === 'PATCH' && response.url().includes('/shop/orders')) {
      observedResponses.push({
        status: response.status(),
        url: response.url(),
      });
    }
  };
  const handleDialog = async (dialog) => {
    if (dialog.type() === 'prompt') {
      await dialog.accept('Nextjs smoke cancel');
      return;
    }
    await dialog.accept();
  };
  page.on('response', recordResponse);
  page.on('dialog', handleDialog);

  let cancelResponse = null;
  try {
    [cancelResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/shop/orders/${orderId}`) &&
          response.request().method() === 'PATCH'
      ),
      statusSectionButtons.last().click(),
    ]);
  } catch (error) {
    const buttonTexts = await statusSectionButtons
      .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim() || ''))
      .catch(() => []);
    const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    fail('order cancel did not patch the order before timeout', {
      message: error.message,
      orderId,
      url: page.url(),
      observedResponses,
      buttonTexts,
      body: bodyText.slice(0, 1600),
    });
  } finally {
    page.off('dialog', handleDialog);
    page.off('response', recordResponse);
  }
  await assertOkResponse(cancelResponse, 'order cancel');

  const detail = await apiJson(`/shop/orders/${orderId}`, {
    headers: authHeaders(token),
  });
  const order = detail.data;
  if (order?.od_status !== STATUS_CANCELLED) {
    fail('order cancel did not persist the cancelled order status', order);
  }
  if (order?.can_cancel !== false || !String(order?.cancel_block_reason || '').trim()) {
    fail('cancelled order detail did not expose a non-cancellable state', order);
  }
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
    (field) => Number(order?.[field] || 0) !== 0
  );
  if (nonZeroCancelledFields.length > 0) {
    fail('order cancel did not reset YoungCart cancellation amount fields', {
      fields: nonZeroCancelledFields,
      order,
    });
  }
  if (Number(order?.od_cancel_price || 0) !== Number(order?.od_cart_price || 0)) {
    fail('order cancel did not persist YoungCart cancellation price', order);
  }
  assertYoungCartOrderTotals(order, 'cancelled order detail');
  const notCancelled = (order.items || []).filter(
    (item) => item.ct_status !== STATUS_CANCELLED
  );
  if (notCancelled.length > 0) {
    fail('order cancel did not persist cancelled item statuses', notCancelled);
  }
  const stockUseRows = (order.items || []).filter(
    (item) => Number(item.ct_stock_use ?? 0) !== 0
  );
  if (stockUseRows.length > 0) {
    fail('order cancel did not clear cart stock-use flags', stockUseRows);
  }

  return {
    orderId,
    cancelled: true,
  };
}
  return {
    createOrderInBrowser,
    cancelOrderInBrowser,
  };
}
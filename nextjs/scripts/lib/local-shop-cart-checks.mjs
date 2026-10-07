export function createLocalShopCartChecks(context) {
  const {
    appUrl,
    smokeRestockHp,
    fail,
    runSeed,
    apiJson,
    apiOk,
    fetchApi,
    authHeaders,
    getProduct,
    firstUsableOption,
    currentCartRows,
    cleanupCartProduct,
    cleanupStockSmsProduct,
    assertOkResponse,
  } = context;

  async function selectProductOption(page, product, option) {
    if (!option) return;

    const optionSubjects = String(product.it_option_subject || '')
      .split(',')
      .filter(Boolean);

    if (optionSubjects.length !== option.values.length) {
      fail('smoke product option shape is not supported by this check', {
        optionSubjects,
        option,
      });
    }

    const selects = page.locator('select[data-shop-option-select="1"]');
    for (let index = 0; index < option.values.length; index += 1) {
      await selects.nth(index).selectOption(option.values[index]);
    }
  }

  async function verifyProductOptionSoldoutState(page, product) {
    const option = firstUsableOption(product);
    if (!option) {
      return {
        optionSoldoutStateSkipped: true,
      };
    }

    const previous = runSeed('set_nextjs_smoke_product_stock.php', {}, [
      `--product-id=${product.it_id}`,
      `--io-id=${option.ioId}`,
      '--io-type=0',
      '--stock=0',
    ]);

    try {
      const payload = await apiJson(`/shop/products/${encodeURIComponent(product.it_id)}`);
      const soldoutOption = (payload.data?.options || []).find(
        (item) => Number(item.io_type) === 0 && String(item.io_id) === option.ioId
      );
      if (!soldoutOption || Number(soldoutOption.io_stock_qty) !== 0) {
        fail('product API did not expose the temporary soldout option state', {
          option,
          soldoutOption,
        });
      }

      await page.goto(`${appUrl}/shop/${encodeURIComponent(product.it_id)}`, {
        waitUntil: 'networkidle',
      });
      await page.getByRole('heading', { name: product.it_name }).first().waitFor({
        state: 'visible',
        timeout: 10000,
      });

      const selects = page.locator('select[data-shop-option-select="1"]');
      for (let index = 0; index < option.values.length - 1; index += 1) {
        await selects.nth(index).selectOption(option.values[index]);
      }

      const finalValue = option.values.at(-1);
      const finalSelect = selects.nth(option.values.length - 1);
      await finalSelect.waitFor({ state: 'visible', timeout: 10000 });
      const finalOption = finalSelect.locator('option').filter({ hasText: finalValue }).first();
      await finalOption.waitFor({ state: 'attached', timeout: 10000 });

      const optionText = (await finalOption.textContent()) || '';
      const disabled = await finalOption.getAttribute('disabled');
      if (!optionText.includes('[품절]') || disabled === null) {
        fail('soldout product option was not marked as disabled with a soldout label', {
          option,
          optionText,
          disabled,
        });
      }

      return {
        optionSoldoutLabel: true,
        optionSoldoutDisabled: true,
      };
    } finally {
      cleanupStockSmsProduct(product.it_id, smokeRestockHp);
      runSeed('set_nextjs_smoke_product_stock.php', {}, [
        `--product-id=${product.it_id}`,
        `--io-id=${option.ioId}`,
        '--io-type=0',
        `--stock=${previous.previous_stock}`,
      ]);
    }
  }

  async function verifyShippingPaymentSelection(page, token, product) {
    const previous = runSeed('set_nextjs_smoke_product_shipping.php', {}, [
      `--product-id=${product.it_id}`,
      '--type=3',
      '--method=2',
      '--price=4000',
      '--minimum=0',
      '--qty=0',
    ]);

    try {
      await cleanupCartProduct(token);

      const payload = await apiJson(`/shop/products/${encodeURIComponent(product.it_id)}`);
      const shippingProduct = payload.data;
      if (
        Number(shippingProduct.it_sc_type) !== 3 ||
        Number(shippingProduct.it_sc_method) !== 2 ||
        Number(shippingProduct.it_sc_price) !== 4000
      ) {
        fail('product API did not expose temporary shipping payment fields', shippingProduct);
      }

      const option = firstUsableOption(shippingProduct);
      await page.goto(`${appUrl}/shop/${encodeURIComponent(product.it_id)}`, {
        waitUntil: 'networkidle',
      });
      await page.getByRole('heading', { name: product.it_name }).first().waitFor({
        state: 'visible',
        timeout: 10000,
      });

      const sendCostSelect = page.locator('select[data-shop-send-cost-select="1"]').first();
      await sendCostSelect.waitFor({ state: 'visible', timeout: 10000 });
      await sendCostSelect.selectOption('1');

      await selectProductOption(page, shippingProduct, option);
      await page.locator('input[type="number"]').first().fill('1');

      const [cartPostResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().replace(/\/+$/, '').endsWith('/shop/cart') &&
            response.request().method() === 'POST'
        ),
        page.getByRole('button', { name: /장바구니/ }).first().click(),
      ]);
      await assertOkResponse(cartPostResponse, 'cart add with shipping payment selection');

      const cartRows = await currentCartRows(token);
      const cartRow = cartRows.find(
        (row) =>
          String(row.it_id) === product.it_id &&
          (!option || String(row.ct_option) === option.ioId)
      );
      if (!cartRow || Number(cartRow.ct_send_cost) !== 1) {
        fail('cart add did not persist selected collect-on-delivery shipping payment', {
          option,
          cartRows,
        });
      }

      await page.goto(`${appUrl}/shop/cart`, { waitUntil: 'networkidle' });
      await page
        .locator('[data-shop-cart-send-cost-label="1"]')
        .filter({ hasText: '착불' })
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });

      await page.goto(`${appUrl}/shop/order?ct_ids=${encodeURIComponent(cartRow.ct_id)}`, {
        waitUntil: 'networkidle',
      });
      await page
        .locator('[data-shop-order-send-cost-label="1"]')
        .filter({ hasText: '착불' })
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });

      return {
        shippingPaymentSelectable: true,
        shippingPaymentCtSendCost: Number(cartRow.ct_send_cost),
        shippingPaymentCartLabel: true,
        shippingPaymentOrderLabel: true,
      };
    } finally {
      await cleanupCartProduct(token);
      runSeed('set_nextjs_smoke_product_shipping.php', {}, [
        `--product-id=${product.it_id}`,
        `--type=${previous.previous_type}`,
        `--method=${previous.previous_method}`,
        `--price=${previous.previous_price}`,
        `--minimum=${previous.previous_minimum}`,
        `--qty=${previous.previous_qty}`,
      ]);
    }
  }

  async function verifyCartFlow(page, token, product) {
    const option = firstUsableOption(product);
    const expectedQty = 2;
    const updatedQty = 3;

    await page.goto(`${appUrl}/shop/${encodeURIComponent(product.it_id)}`, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('heading', { name: product.it_name }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    await selectProductOption(page, product, option);
    await page.locator('input[type="number"]').first().fill(String(expectedQty));

    const [cartPostResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().replace(/\/+$/, '').endsWith('/shop/cart') &&
          response.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /장바구니/ }).first().click(),
    ]);
    await assertOkResponse(cartPostResponse, 'cart add');

    let cartRows = await currentCartRows(token);
    let cartRow = cartRows.find(
      (row) =>
        String(row.it_id) === product.it_id &&
        (!option || String(row.ct_option) === option.ioId)
    );
    if (!cartRow || Number(cartRow.ct_qty) !== expectedQty) {
      fail('cart add did not persist through the API', { cartRows, option });
    }

    await page.goto(`${appUrl}/shop/cart`, { waitUntil: 'networkidle' });
    await page.getByText(product.it_name, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    // 장바구니는 영카트 cart.php 처럼 상품마다 한 줄 — 수량은 "선택사항수정" 창에서 고치고, 확인하면 고친 뒤의 목록을
    // 한 번에 보낸다(POST /shop/cart/options).
    const cartItem = page.locator('.cart-row').filter({ hasText: product.it_name }).first();
    await cartItem.locator('.cart-option-edit').click();
    const optionDialog = page.locator('.cart-option-dialog');
    // 옵션 상품은 담긴 옵션 줄(이름 + " 수량 증가"), 옵션 없는 상품은 수량 칸의 "수량 증가".
    const increase = option
      ? optionDialog.locator('button[aria-label$=" 수량 증가"]').first()
      : optionDialog.getByRole('button', { name: '수량 증가', exact: true });
    await increase.click();
    const [cartPatchResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/shop/cart/options') &&
          response.request().method() === 'POST'
      ),
      optionDialog.locator('.product-quick-add-submit').click(),
    ]);
    await assertOkResponse(cartPatchResponse, 'cart quantity update');
    await optionDialog.waitFor({ state: 'detached', timeout: 10000 });

    cartRows = await currentCartRows(token);
    cartRow = cartRows.find((row) => String(row.ct_id) === String(cartRow.ct_id));
    if (!cartRow || Number(cartRow.ct_qty) !== updatedQty) {
      fail('cart quantity update did not persist through the API', cartRows);
    }

    // 이 상품만 골라 선택삭제 → 확인 창의 삭제(영카트 cartupdate.php act=seldelete 와 같은 요청).
    const selectAll = page.locator('.cart-table-head .cart-check');
    if (await selectAll.isChecked()) await selectAll.click();
    await cartItem.locator('.cart-check').check();
    await page.locator('.cart-delete-selected').click();
    const [cartDeleteResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/shop/cart/legacy-update') &&
          response.request().method() === 'POST'
      ),
      page.locator('[data-slot="alert-dialog-content"]').getByRole('button', { name: '삭제' }).click(),
    ]);
    await assertOkResponse(cartDeleteResponse, 'cart delete');

    cartRows = await currentCartRows(token);
    const remaining = cartRows.filter((row) => String(row.it_id) === product.it_id);
    if (remaining.length > 0) {
      fail('cart delete did not persist through the API', remaining);
    }

    return {
      cartProductId: product.it_id,
      option: option?.ioId || '',
      quantityUpdated: updatedQty,
      deleted: true,
    };
  }

  function cartAddBodyForProduct(product, qty) {
    const option = firstUsableOption(product);
    if (option) {
      return {
        it_id: product.it_id,
        options: [{ io_id: option.ioId, ct_qty: qty }],
      };
    }

    return { it_id: product.it_id, ct_qty: qty };
  }

  function cartIdsFromAddPayload(payload) {
    const data = payload?.data || {};
    return [
      data.ct_id,
      ...((data.items || []).map((item) => item.ct_id)),
    ]
      .filter((id) => id !== undefined && id !== null && String(id) !== '')
      .map((id) => String(id));
  }

  async function assertCartAddStatus(token, product, qty, expectedStatus, label) {
    const { response, payload } = await fetchApi('/shop/cart', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cartAddBodyForProduct(product, qty)),
    });

    if (response.status !== expectedStatus) {
      fail(`${label} returned unexpected status`, {
        expectedStatus,
        actualStatus: response.status,
        payload,
      });
    }

    return payload;
  }

  async function verifyCartBuyQtyLimits(token, product) {
    const option = firstUsableOption(product);
    const stockQty = Number(option ? product.options.find((item) => String(item.io_id) === option.ioId)?.io_stock_qty : product.it_stock_qty);
    if (!Number.isFinite(stockQty) || stockQty < 4) {
      fail('smoke product needs at least 4 available units for buy quantity limit checks', {
        productId: product.it_id,
        option: option?.ioId || '',
        stockQty,
      });
    }

    const previous = runSeed('set_nextjs_smoke_product_qty_limits.php', {}, [
      `--product-id=${product.it_id}`,
      '--min=2',
      '--max=3',
    ]);

    try {
      await cleanupCartProduct(token);
      const limitedProduct = await getProduct();

      if (Number(limitedProduct.it_buy_min_qty) !== 2 || Number(limitedProduct.it_buy_max_qty) !== 3) {
        fail('product API did not expose updated buy quantity limits', limitedProduct);
      }

      await assertCartAddStatus(token, limitedProduct, 1, 422, 'cart add below min buy quantity');
      await assertCartAddStatus(token, limitedProduct, 4, 422, 'cart add above max buy quantity');
      await assertCartAddStatus(token, limitedProduct, 2, 201, 'cart add within buy quantity limits');
      await assertCartAddStatus(token, limitedProduct, 2, 422, 'cart add exceeding max with existing cart quantity');

      const directAdd = await apiJson('/shop/cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          ...cartAddBodyForProduct(limitedProduct, 2),
          direct: true,
        }),
      });
      const directCtIds = cartIdsFromAddPayload(directAdd);
      if (directCtIds.length === 0) {
        fail('direct buy quantity limit check did not return direct cart ids', directAdd);
      }

      const directRows = await currentCartRows(
        token,
        `?ct_ids=${encodeURIComponent(directCtIds.join(','))}`
      );
      const directQty = directRows
        .filter((row) => directCtIds.includes(String(row.ct_id)))
        .reduce((sum, row) => sum + Number(row.ct_qty || 0), 0);
      if (directQty !== 2) {
        fail('direct buy quantity limit check did not persist direct cart quantity', {
          directCtIds,
          directRows,
        });
      }

      const directOverflow = await fetchApi('/shop/cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          ...cartAddBodyForProduct(limitedProduct, 2),
          direct: true,
          replace_direct: false,
        }),
      });
      if (directOverflow.response.status !== 422 || directOverflow.payload?.success !== false) {
        fail('direct buy quantity limit should reject accumulated quantity above max', {
          status: directOverflow.response.status,
          payload: directOverflow.payload,
        });
      }

      const cartRows = await currentCartRows(token);
      const cartQty = cartRows
        .filter((row) => String(row.it_id) === product.it_id)
        .reduce((sum, row) => sum + Number(row.ct_qty || 0), 0);
      if (cartQty !== 2) {
        fail('buy quantity limit check left an unexpected cart quantity', cartRows);
      }

      return {
        buyMinQty: Number(limitedProduct.it_buy_min_qty),
        buyMaxQty: Number(limitedProduct.it_buy_max_qty),
        directLimitRows: directCtIds.length,
        limitChecks: true,
      };
    } finally {
      await apiOk('/shop/cart', {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      runSeed('set_nextjs_smoke_product_qty_limits.php', {}, [
        `--product-id=${product.it_id}`,
        `--min=${previous.previous_min}`,
        `--max=${previous.previous_max}`,
      ]);
    }
  }

  async function verifyTelInquiryCartGuard(token, product) {
    const previous = runSeed('set_nextjs_smoke_product_qty_limits.php', {}, [
      `--product-id=${product.it_id}`,
      '--min=0',
      '--max=0',
      '--tel=1',
    ]);

    try {
      await cleanupCartProduct(token);
      const telProduct = await getProduct();
      if (String(telProduct.it_tel_inq ?? '0') !== '1') {
        fail('product API did not expose telephone inquiry flag', telProduct);
      }

      const { response, payload } = await fetchApi('/shop/cart', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(cartAddBodyForProduct(telProduct, 1)),
      });
      if (response.status !== 400) {
        fail('telephone inquiry product should not be added to cart', {
          status: response.status,
          payload,
        });
      }

      return {
        telInquiryGuard: true,
        telInquiryStatus: response.status,
      };
    } finally {
      await cleanupCartProduct(token);
      runSeed('set_nextjs_smoke_product_qty_limits.php', {}, [
        `--product-id=${product.it_id}`,
        `--min=${previous.previous_min}`,
        `--max=${previous.previous_max}`,
        `--tel=${previous.previous_tel}`,
      ]);
    }
  }

  async function verifyWishlistFlow(page, token, product) {
    await page.goto(`${appUrl}/shop/${encodeURIComponent(product.it_id)}`, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('heading', { name: product.it_name }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    const [wishlistPostResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().replace(/\/+$/, '').endsWith('/shop/wishlist') &&
          response.request().method() === 'POST'
      ),
      page.locator('button:has(svg.lucide-heart)').first().click(),
    ]);
    await assertOkResponse(wishlistPostResponse, 'wishlist add');

    let wishCheck = await apiJson(`/shop/wishlist/check/${encodeURIComponent(product.it_id)}`, {
      headers: authHeaders(token),
    });
    if (!wishCheck.data?.wishlisted) {
      fail('wishlist add did not persist through the API', wishCheck.data);
    }

    await page.goto(`${appUrl}/shop/wishlist`, { waitUntil: 'networkidle' });
    await page.getByText(product.it_name, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });

    const wishlistItem = page.locator('div.group.relative').filter({
      hasText: product.it_name,
    }).first();

    if (firstUsableOption(product)) {
      await wishlistItem
        .locator('[data-shop-wishlist-cart-block="1"]')
        .filter({ hasText: '옵션 선택 필요' })
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });
      await wishlistItem.getByText('옵션선택', { exact: true }).first().waitFor({
        state: 'visible',
        timeout: 10000,
      });
    }

    page.once('dialog', (dialog) => dialog.accept());
    const [wishlistDeleteResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/shop/wishlist/${product.it_id}`) &&
          response.request().method() === 'DELETE'
      ),
      wishlistItem.locator('button').last().click(),
    ]);
    await assertOkResponse(wishlistDeleteResponse, 'wishlist delete');

    wishCheck = await apiJson(`/shop/wishlist/check/${encodeURIComponent(product.it_id)}`, {
      headers: authHeaders(token),
    });
    if (wishCheck.data?.wishlisted) {
      fail('wishlist delete did not persist through the API', wishCheck.data);
    }

    return {
      wishlistProductId: product.it_id,
      added: true,
      deleted: true,
      optionProductBlocked: Boolean(firstUsableOption(product)),
    };
  }
  

  return {
    verifyProductOptionSoldoutState,
    verifyShippingPaymentSelection,
    verifyCartFlow,
    verifyCartBuyQtyLimits,
    verifyTelInquiryCartGuard,
    verifyWishlistFlow,
  };
}

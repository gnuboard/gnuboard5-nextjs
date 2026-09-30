export function usableBaseOptions(product) {
  return Array.isArray(product?.options)
    ? product.options.filter(
        (option) =>
          String(option?.io_use ?? '1') !== '0' &&
          Number(option?.io_type || 0) === 0 &&
          Number(option?.io_stock_qty ?? 0) > 0 &&
          String(option?.io_id || '') !== ''
      )
    : [];
}

export function firstUsableBaseOption(product) {
  const option = usableBaseOptions(product)[0];
  if (!option) return null;

  return {
    ioId: String(option.io_id),
    values: String(option.io_id).split('\x1e'),
  };
}

export function productFixtureProblems(product, { expectedId, requireBaseOption = false } = {}) {
  const problems = [];
  if (!product || typeof product !== 'object') {
    return ['product payload is missing'];
  }

  if (expectedId && String(product.it_id || '') !== expectedId) {
    problems.push(`expected it_id=${expectedId}, got ${product.it_id || '(missing)'}`);
  }
  if (String(product.it_soldout || '0') === '1') {
    problems.push('product is sold out');
  }
  if (String(product.it_tel_inq || '0') === '1') {
    problems.push('product is phone-inquiry only');
  }
  if (Number(product.it_stock_qty || 0) <= 0) {
    problems.push(`product stock must be positive, got ${product.it_stock_qty ?? '(missing)'}`);
  }

  const activeBaseOptions = Array.isArray(product.options)
    ? product.options.filter(
        (option) => String(option?.io_use ?? '1') !== '0' && Number(option?.io_type || 0) === 0
      )
    : [];
  const usableOptions = usableBaseOptions(product);

  if (requireBaseOption && activeBaseOptions.length === 0) {
    problems.push('option product fixture must have at least one active base option');
  }
  if (activeBaseOptions.length > 0 && usableOptions.length === 0) {
    problems.push('product has base options, but none are usable and in stock');
  }

  return problems;
}

export function cartAddBodyForProduct(product, qty, extra = {}) {
  const productId = String(product?.it_id || '');
  const option = firstUsableBaseOption(product);
  if (option) {
    return {
      it_id: productId,
      options: [{ io_id: option.ioId, ct_qty: qty }],
      ...extra,
    };
  }

  return {
    it_id: productId,
    ct_qty: qty,
    ...extra,
  };
}

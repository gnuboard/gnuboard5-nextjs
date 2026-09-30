const PG_FRAME_SOURCES = [
  'https://*.tosspayments.com',
  'https://testpay.kcp.co.kr',
  'https://*.kcp.co.kr',
  'https://stdpay.inicis.com',
  'https://stgstdpay.inicis.com',
  'https://*.inicis.com',
  'https://web.nicepay.co.kr',
  'https://*.nicepay.co.kr',
].join(' ');

const POSTCODE_FRAME_SOURCES = [
  'https://postcode.map.daum.net',
  'https://postcode.map.kakao.com',
].join(' ');
const POSTCODE_SCRIPT_SOURCES = 'https://t1.daumcdn.net';
const POSTCODE_IMAGE_SOURCES = 'https://t1.daumcdn.net https://t1.kakaocdn.net';

export function staticExportCsp({ allowUnsafeEval = false } = {}) {
  const scriptSources = [
    `'self'`,
    `'unsafe-inline'`,
    ...(allowUnsafeEval ? [`'unsafe-eval'`] : []),
    'https://js.tosspayments.com',
    PG_FRAME_SOURCES,
    POSTCODE_SCRIPT_SOURCES,
  ].join(' ');

  return [
    `default-src 'self'`,
    `script-src ${scriptSources}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https: ${POSTCODE_IMAGE_SOURCES}`,
    `font-src 'self' data:`,
    `connect-src 'self' https:`,
    `frame-src ${PG_FRAME_SOURCES} ${POSTCODE_FRAME_SOURCES}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self' ${PG_FRAME_SOURCES}`,
    `object-src 'none'`,
  ].join('; ');
}

export function staticExportSecurityHeaders({ allowUnsafeEval = false } = {}) {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'Content-Security-Policy', value: staticExportCsp({ allowUnsafeEval }) },
  ];
}

export function apacheStaticSecurityHeaders(options = {}) {
  return staticExportSecurityHeaders(options)
    .map(({ key, value }) => `  Header set ${key} "${value}"`)
    .join('\n');
}

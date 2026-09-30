/**
 * Sentry — 브라우저 (클라이언트) 측 설정.
 *
 * DSN 미설정 시 초기화 자체를 건너뛰어 dev / 자체 호스트 환경에서 noop.
 * 운영 환경에서만 NEXT_PUBLIC_SENTRY_DSN 정의 필요.
 *
 * 트래픽이 많아질 가능성이 있어 tracesSampleRate / replaysSessionSampleRate
 * 를 낮게 시작. 운영 중 quota 보고 조정.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // 100건 중 5건만 trace — quota 보호
    tracesSampleRate: 0.05,
    // Session replay 는 비활성 (privacy + quota). 필요 시 0.01 로 켜기.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    // 흔한 noise 필터
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection captured',
      // Chrome extension 오류
      /chrome-extension:/,
      /moz-extension:/,
    ],
    beforeSend(event) {
      // 비밀번호 / 토큰이 request body 에 섞여 들어가지 않도록 필터
      if (event.request?.data) {
        const data = event.request.data;
        if (typeof data === 'object' && data !== null) {
          const sanitized: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
            if (/password|token|secret|key/i.test(k)) {
              sanitized[k] = '[redacted]';
            } else {
              sanitized[k] = v;
            }
          }
          event.request.data = sanitized;
        }
      }
      return event;
    },
  });
}

/**
 * Sentry — Node.js (RSC / API routes) 서버 측 설정.
 * DSN 미설정이면 noop.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.05,
    // RSC 내부에서 발생하는 Next 의 정상 NEXT_REDIRECT throw 는 noise.
    ignoreErrors: [
      'NEXT_REDIRECT',
      'NEXT_NOT_FOUND',
    ],
  });
}

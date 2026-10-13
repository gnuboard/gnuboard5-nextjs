/**
 * handbook(매뉴얼 테마) 개발 서버.
 *
 * - G5_MANUAL_SITE_URL: 바라볼 그누보드 주소. 정하면 서버 렌더 · 브라우저 · 그누보드 주소 세 값을 모두 그 사이트로 세운다.
 *   dev-theme.mjs 는 API 주소를 셸 환경변수 기준으로 먼저 확정해 자식에게 넘기므로, .env.local 에
 *   NEXT_PUBLIC_API_URL 만 적어 두면 서버에서 그린 화면이 계속 기본값을 본다 — 여기서 세 값을 함께 세워 막는다.
 *   정하지 않으면 dev-theme.mjs 의 기본값(셸 환경변수, 없으면 로컬 기본 사이트)을 그대로 쓴다.
 * - NEXT_PUBLIC_DOCS_GROUP: 매뉴얼로 쓰는 게시판 그룹. 정하지 않으면 매뉴얼 가져오기 도구(tools/manual)가
 *   만드는 그룹 `manual`.
 * - G5_MANUAL_DEV_PORT: 포트(기본 3003). 윈도우는 Hyper-V/WinNAT 가 포트 구간을 통째로 예약해 두기도 한다 —
 *   그 안의 포트에 listen 하면 아무도 안 쓰는데도 EACCES 가 난다. 기본 포트가 막히면 이 값으로 옮긴다.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MANUAL_SITE = (process.env.G5_MANUAL_SITE_URL || '').trim().replace(/\/+$/, '');
const PORT = process.env.G5_MANUAL_DEV_PORT || '3003';
const here = dirname(fileURLToPath(import.meta.url));

const siteEnv = MANUAL_SITE
  ? {
      G5_API_INTERNAL_URL: `${MANUAL_SITE}/api/v1`,
      NEXT_PUBLIC_API_URL: `${MANUAL_SITE}/api/v1`,
      NEXT_PUBLIC_G5_URL: MANUAL_SITE,
    }
  : {};

const child = spawn(
  process.execPath,
  [join(here, '..', '..', 'dev-theme.mjs'), 'handbook', 'handbook', '--', '-H', '127.0.0.1', '-p', PORT],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...siteEnv,
      NEXT_PUBLIC_DOCS_GROUP: process.env.NEXT_PUBLIC_DOCS_GROUP ?? 'manual',
    },
  }
);

child.on('exit', (code) => process.exit(code ?? 0));

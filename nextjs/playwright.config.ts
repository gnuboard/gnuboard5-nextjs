import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const explicitBaseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.LOCAL_APP_URL;
const mobileOnly = process.env.PLAYWRIGHT_MOBILE_ONLY === '1';
const mobileUse = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

/* 테마마다 프로젝트 하나. 목록은 theme-manifest.json 에서 생성된 vercel-theme-map.json 이고,
   check-ui.mjs 가 같은 목록으로 개발 서버를 띄운다 — 여기 손으로 적어 두면 테마가 늘 때
   서버는 뜨는데 테스트는 안 도는 상태가 된다. uiSmoke:false 인 테마(문서형 테마 등)는 뺀다. 테스트는 늘 nextjs/ 에서 돌므로 cwd 기준으로 읽는다. */
type ThemeMapEntry = { source: string; devPort: number; uiSmoke?: boolean };
const host = process.env.G5_DEV_THEMES_HOST || '127.0.0.1';
const smokeThemes = (
  JSON.parse(readFileSync(resolve(process.cwd(), 'vercel-theme-map.json'), 'utf8')).themes as ThemeMapEntry[]
).filter((entry) => entry.uiSmoke !== false);

const projects = explicitBaseURL
  ? mobileOnly
    ? [
        {
          name: 'mobile',
          use: { baseURL: explicitBaseURL, ...mobileUse },
        },
      ]
    : undefined
  : smokeThemes.map((entry) =>
      mobileOnly
        ? {
            name: `${entry.source}-mobile`,
            use: { baseURL: `http://${host}:${entry.devPort}`, ...mobileUse },
          }
        : {
            name: entry.source,
            use: { baseURL: `http://${host}:${entry.devPort}` },
          }
    );

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  projects,
  use: {
    baseURL: explicitBaseURL || 'http://127.0.0.1:3001',
    screenshot: 'only-on-failure',
  },
  reporter: [['list']],
});

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 공개판의 발행자(회사) 정보 — 한 곳에서만 정한다.
 * 시험 저장소(개인 계정)와 정식 저장소(gnuboard 조직)는 같은 커밋을 받으므로, 내용은 늘 정식 기준으로 만든다.
 */
export const PUBLISHER = {
  name: 'SIR Soft',
  legalName: '(주)에스아이알소프트',
  url: 'https://sir.kr',
  repoUrl: 'https://github.com/gnuboard/gnuboard5-nextjs',
};

/**
 * 사용자가 읽는 파일에 남으면 안 되는 개인 흔적(관리자 개인 계정 · 개인 서버 이름).
 * 테마 데모 사이트 주소(thisgun3.mycafe24.com)는 README 에 일부러 둔 것이라 뺀다.
 */
export const PERSONAL_TRACE_PATTERN = { label: 'personal account trace', regex: /thisgun(?!3\.mycafe24\.com)/i };

/** 개인 흔적을 보는 곳 — 사용자가 읽는 문서와 설치물. 개발용 검사 스크립트(nextjs/scripts)는 보지 않는다. */
export const USER_FACING_ROOTS = [
  'README.md',
  'INSTALL.md',
  'package.json',
  'docs',
  'overlay',
  'nextjs-install',
  'nextjs/package.json',
  'nextjs/release-policy.json',
];

const PUBLIC_ENV_EXAMPLE_HEAD = `# Example settings for api/.env. Do NOT copy this file as-is: every value below is an
# example. Copy only the lines you need and put your own values in. A normal install
# (the Next.js theme on the same address as Gnuboard) needs none of them.

# Front ends on another address (for example a Vercel project) that call this API.
# Comma-separated origins, no trailing slash.
# G5_CORS_ALLOWED_ORIGINS=https://your-project.vercel.app

# A PHP-hosted install (root or sub-folder) needs none of the settings below:
# the bridge and the API derive every URL from Gnuboard's own G5_URL.
# Use the theme-neutral G5_WEBAPP_* names — they keep working when you switch to another
# Next.js theme (G5_<THEME>_* names such as G5_NEXTJS_DEFAULT_ALLOWED_HOSTS apply to one theme only).
# Extra host names the site answers on besides G5_URL's (for example a www. alias when
# config.php fixes G5_DOMAIN — other hosts get "Invalid Host header."):
# G5_WEBAPP_ALLOWED_HOSTS=www.your-gnuboard.example.com
# When the app lives on another origin (for example a Vercel preview), define its address
# in a PHP extend file:
# define('G5_WEBAPP_APP_URL', 'https://your-project.vercel.app');

# Optional. Extra web hosts allowed for social OAuth redirects.
# If omitted, G5_CORS_ALLOWED_ORIGINS is also used for social redirect host checks.
# G5_SOCIAL_WEB_HOSTS=your-project.vercel.app

# Optional. Comma-separated reverse proxy REMOTE_ADDR values whose
# X-Forwarded-Proto / X-Forwarded-Host headers may be trusted by PHP.
# Same-host nginx/PHP-FPM normally needs no value because loopback is trusted.
# G5_TRUSTED_PROXY_REMOTE_ADDRS=10.0.0.10,172.16.0.5

# Optional. Extra mobile app schemes allowed for social OAuth deep links.
# The official Gnuboard5 app (gnuboard5-app, scheme sirsoft-g5) is always allowed.
# G5_SOCIAL_MOBILE_SCHEMES=myapp

`;

function rewrite(path, replacements) {
  if (!existsSync(path)) return;
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const [pattern, value] of replacements) after = after.replace(pattern, value);
  if (after !== before) writeFileSync(path, after);
}

/** 원본에서 복사해 온 파일의 제작자 · 예시 주소를 발행자 기준으로 바꾼다. */
export function applyPublisherBranding(repoRoot, publicTheme) {
  rewrite(join(repoRoot, 'overlay', 'theme', publicTheme, 'readme.txt'), [
    [/^Theme URI: .*$/m, `Theme URI: ${PUBLISHER.repoUrl}`],
    [/^Maker: .*$/m, `Maker: ${PUBLISHER.name}`],
    [/^Maker URI: .*$/m, `Maker URI: ${PUBLISHER.url}`],
    [/^License: .*$/m, 'License: LGPL-2.1-or-later'],
    [/^License URI: .*$/m, `License URI: ${PUBLISHER.repoUrl}/blob/main/LICENSE`],
  ]);

  // API 안내서의 예시 주소 — 관리자 개인 서버 대신 누구나 알아보는 예시 주소.
  rewrite(join(repoRoot, 'overlay', 'api', 'README.md'), [
    [/https:\/\/thisgun4\.gnuboard\.net\/gnuboard5/g, 'https://your-gnuboard.example.com'],
    [/gnuboard5-nextjs-default\.vercel\.app/g, 'your-project.vercel.app'],
  ]);

  rewrite(join(repoRoot, 'overlay', 'plugin', 'webapp', 'notify', 'admin.php'), [
    [/placeholder="예: thisgun"/g, 'placeholder="예: member01"'],
  ]);

  // 소셜 로그인 앱 스킴 기본값 — 공개판은 공식 앱(sirsoft-g5)만. 관리자 개인 앱(dday-app)은 뺀다.
  rewrite(join(repoRoot, 'overlay', 'api', 'social', '_bridge_common.php'), [
    [/\$schemes = array\('sirsoft-g5', 'dday-app'\);/, "$schemes = array('sirsoft-g5');"],
  ]);

  // API 설정 예시 — 원본은 관리자가 운영하는 Vercel 프로젝트 · 개발 주소를 켜 둔 값이다.
  // 공개판은 모든 값을 주석으로 둔 사용자용 예시로 바꾼다(Nicepay 줄부터는 원본 그대로).
  rewrite(join(repoRoot, 'overlay', 'api', 'env.example'), [
    [/^[\s\S]*?(?=# Optional\. Nicepay)/, PUBLIC_ENV_EXAMPLE_HEAD],
  ]);

  // 원본 저장소의 브랜치 · 폴더 정책은 공개 저장소와 상관없다. 공개 저장소는 main 하나다.
  const policyPath = join(repoRoot, 'nextjs', 'release-policy.json');
  if (existsSync(policyPath)) {
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    const next = { ...policy, sourceBranches: ['main'], publicPackageBranches: ['main'], publicPackageDir: '.' };
    writeFileSync(policyPath, `${JSON.stringify(next, null, 2)}\n`);
  }
}

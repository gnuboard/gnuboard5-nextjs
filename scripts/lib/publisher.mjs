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

/** 사용자가 읽는 파일에 남으면 안 되는 개인 흔적(관리자 개인 계정 · 개인 서버 이름). */
export const PERSONAL_TRACE_PATTERN = { label: 'personal account trace', regex: /thisgun/i };

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

  // 원본 저장소의 브랜치 · 폴더 정책은 공개 저장소와 상관없다. 공개 저장소는 main 하나다.
  const policyPath = join(repoRoot, 'nextjs', 'release-policy.json');
  if (existsSync(policyPath)) {
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    const next = { ...policy, sourceBranches: ['main'], publicPackageBranches: ['main'], publicPackageDir: '.' };
    writeFileSync(policyPath, `${JSON.stringify(next, null, 2)}\n`);
  }
}

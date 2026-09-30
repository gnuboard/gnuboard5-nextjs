/**
 * 빌드 전에 out/ 을 비운다.
 *
 * Windows 에서는 내보내기 단계가 out/ 을 스스로 지우다 EBUSY 로 멈추는 일이 잦다
 * (긴 경로 + 바이러스 검사·색인이 잠깐 붙잡는 사이). 미리 지워 두면 그 단계가
 * 지울 것이 없어 문제가 사라진다. 실패해도 빌드를 막지는 않는다.
 */
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'out');

if (!existsSync(outDir)) {
  process.exit(0);
}

try {
  rmSync(outDir, { recursive: true, force: true, maxRetries: 15, retryDelay: 500 });
  console.log('[clean-out] out/ 정리');
} catch (error) {
  console.warn(`[clean-out] out/ 을 지우지 못했습니다(${error.code}). 빌드는 계속합니다.`);
}

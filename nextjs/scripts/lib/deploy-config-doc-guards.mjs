import { existsSync, readFileSync } from 'node:fs';

export function checkVercelDashboardDocs({ docPaths, fail }) {
  const docs = docPaths
    .filter((path) => existsSync(path))
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }));
  if (docs.length === 0) return;

  const combined = docs.map((doc) => doc.source).join('\n');
  if (!combined.includes('Framework Preset: Next.js')) {
    fail('Vercel dashboard docs must tell users to use Framework Preset: Next.js');
  }
  if (!combined.includes('Output Directory: <leave blank>') && !combined.includes('| Output Directory | 비움 |')) {
    fail('Vercel dashboard docs must tell users to leave Output Directory blank for server runtime');
  }
  if (!combined.includes('G5_NEXT_RUNTIME=server')) {
    fail('Vercel dashboard docs must require G5_NEXT_RUNTIME=server');
  }
  if (!combined.includes('Production and Preview') && !combined.includes('Production과 Preview')) {
    fail('Vercel dashboard docs must require runtime env configuration for Production and Preview');
  }

  for (const doc of docs) {
    if (/(^|\r?\n)\s*Output Directory:\s*out\s*(\r?\n|$)/i.test(doc.source)) {
      fail(`${doc.path} must not document Output Directory: out as a default Vercel setting`);
    }
    if (/\|\s*Output Directory\s*\|\s*`?out`?\s*\|/i.test(doc.source)) {
      fail(`${doc.path} must not document Output Directory out as a default Vercel table setting`);
    }
  }
}

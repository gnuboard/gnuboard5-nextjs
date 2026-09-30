import { staticExportSecurityHeaders } from './static-security-headers.mjs';
import { vercelStaticFallbackRewrites } from './route-rules.mjs';

export function createVercelConfig({ runtime = 'server' } = {}) {
  if (runtime !== 'server' && runtime !== 'static') {
    throw new Error(`Unsupported Vercel config runtime ${runtime}. Use server or static.`);
  }

  if (runtime === 'server') {
    return {
      $schema: 'https://openapi.vercel.sh/vercel.json',
      framework: 'nextjs',
      installCommand: 'npm ci',
      buildCommand: 'npm run build:vercel',
      devCommand: 'npm run dev',
    };
  }

  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: null,
    installCommand: 'npm ci',
    buildCommand: 'npm run build:vercel:static',
    outputDirectory: 'out',
    devCommand: 'npm run dev',
    cleanUrls: true,
    trailingSlash: false,
    routes: [
      {
        src: '/admin(?:/.*)?',
        status: 307,
        headers: { Location: '$NEXT_PUBLIC_G5_URL/adm' },
        env: ['NEXT_PUBLIC_G5_URL'],
      },
      {
        src: '/api/v1/(.*)',
        dest: '$NEXT_PUBLIC_API_URL/$1',
        env: ['NEXT_PUBLIC_API_URL'],
      },
      {
        src: '/api/v1',
        dest: '$NEXT_PUBLIC_API_URL',
        env: ['NEXT_PUBLIC_API_URL'],
      },
    ],
    headers: [
      {
        source: '/(.*)',
        headers: staticExportSecurityHeaders({ allowUnsafeEval: false }),
      },
    ],
    rewrites: vercelStaticFallbackRewrites,
  };
}

export function formatVercelConfig(config = createVercelConfig()) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

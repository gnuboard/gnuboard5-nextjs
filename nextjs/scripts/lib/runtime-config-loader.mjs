import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as ts from 'typescript';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

function transpile(sourcePath, fail) {
  const output = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  });

  const diagnostics = output.diagnostics ?? [];
  if (diagnostics.length > 0) {
    fail(`failed to transpile ${sourcePath}: ${diagnostics.map((item) => item.messageText).join('; ')}`);
  }
  return output.outputText;
}

// config.ts 가 불러 쓰는 src 안 모듈(@/lib/... · ./...)만 같은 방식으로 읽는다. 바깥 패키지는 받지 않는다.
function resolveSourceModule(specifier, fromPath) {
  const base = specifier.startsWith('@/')
    ? join(srcRoot, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromPath), specifier)
      : null;
  if (!base) return null;
  return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((candidate) => existsSync(candidate) && candidate.match(/\.tsx?$/)) ?? null;
}

export function loadRuntimeConfigModule(sourcePath, { env = {}, windowValue, fail }) {
  const process = {
    env: {
      NODE_ENV: 'production',
      ...env,
    },
  };
  const cache = new Map();

  const load = (modulePath) => {
    if (cache.has(modulePath)) return cache.get(modulePath).exports;
    const module = { exports: {} };
    cache.set(modulePath, module);
    const sandbox = {
      module,
      exports: module.exports,
      process,
      URL,
      require: (specifier) => {
        const resolved = resolveSourceModule(specifier, modulePath);
        if (!resolved) fail(`${modulePath} requires unsupported module ${specifier}`);
        return load(resolved);
      },
    };

    if (windowValue) {
      sandbox.window = windowValue;
    }

    vm.runInNewContext(transpile(modulePath, fail), sandbox, {
      filename: modulePath,
    });
    return module.exports;
  };

  return load(sourcePath);
}

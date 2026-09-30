import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as ts from 'typescript';

export function loadRuntimeConfigModule(sourcePath, { env = {}, windowValue, fail }) {
  const source = readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
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
    fail(`failed to transpile config.ts: ${diagnostics.map((item) => item.messageText).join('; ')}`);
  }

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    process: {
      env: {
        NODE_ENV: 'production',
        ...env,
      },
    },
    URL,
  };

  if (windowValue) {
    sandbox.window = windowValue;
  }

  vm.runInNewContext(output.outputText, sandbox, {
    filename: sourcePath,
  });

  return module.exports;
}

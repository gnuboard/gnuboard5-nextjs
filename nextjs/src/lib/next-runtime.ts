export type NextRuntime = "server" | "static";

interface NextRuntimeEnv {
  G5_NEXT_RUNTIME?: string;
  VERCEL?: string;
}

function currentNextRuntimeEnv(): NextRuntimeEnv {
  return {
    G5_NEXT_RUNTIME: process.env.G5_NEXT_RUNTIME,
    VERCEL: process.env.VERCEL,
  };
}

export function resolveNextRuntime(env: NextRuntimeEnv = currentNextRuntimeEnv()): NextRuntime {
  const configured = env.G5_NEXT_RUNTIME?.trim();
  if (configured === "server" || configured === "static") {
    return configured;
  }

  if (configured) {
    throw new Error(
      `Unsupported G5_NEXT_RUNTIME ${configured}. Use server or static.`
    );
  }

  // Vercel evaluates Next config and server components outside the child process
  // started by build-vercel-theme.mjs. Default those evaluations to server runtime.
  return env.VERCEL === "1" ? "server" : "static";
}

export function usesServerRuntime(env: NextRuntimeEnv = currentNextRuntimeEnv()): boolean {
  return resolveNextRuntime(env) === "server";
}

import { expect, test } from "@playwright/test";
import { resolveNextRuntime, usesServerRuntime } from "@/lib/next-runtime";

test("uses an explicit server runtime", () => {
  expect(resolveNextRuntime({ G5_NEXT_RUNTIME: "server" })).toBe("server");
  expect(usesServerRuntime({ G5_NEXT_RUNTIME: "server" })).toBe(true);
});

test("uses an explicit static runtime even on Vercel", () => {
  expect(resolveNextRuntime({ G5_NEXT_RUNTIME: "static", VERCEL: "1" })).toBe("static");
  expect(usesServerRuntime({ G5_NEXT_RUNTIME: "static", VERCEL: "1" })).toBe(false);
});

test("defaults an unset Vercel runtime to server", () => {
  expect(resolveNextRuntime({ VERCEL: "1" })).toBe("server");
});

test("keeps an unset non-Vercel runtime static", () => {
  expect(resolveNextRuntime({})).toBe("static");
});

test("rejects an unsupported explicit runtime", () => {
  expect(() => resolveNextRuntime({ G5_NEXT_RUNTIME: "edge" })).toThrow(
    "Unsupported G5_NEXT_RUNTIME edge"
  );
});

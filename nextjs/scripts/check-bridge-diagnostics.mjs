import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const apiRoot = existsSync(join(root, "..", "api"))
  ? join(root, "..", "api")
  : join(root, "..", "overlay", "api");

const requiredMarkers = [
  {
    file: join(apiRoot, "social", "_bridge_common.php"),
    markers: ["[nextjs25-social] opener redirect failed"],
  },
  {
    file: join(apiRoot, "cert", "_cert_common.php"),
    markers: [
      "[nextjs25-cert]",
      "opener postMessage failed",
      "window close failed",
    ],
  },
  {
    file: join(apiRoot, "v1", "shop", "payment_bridge_helpers.php"),
    markers: ["function pg_bridge_json", "JSON_HEX_TAG", "[g5-payment-bridge]"],
  },
];

const missing = [];

for (const item of requiredMarkers) {
  const content = readFileSync(item.file, "utf8");
  for (const marker of item.markers) {
    if (!content.includes(marker)) {
      missing.push(`${item.file}: ${marker}`);
    }
  }
}

if (missing.length > 0) {
  for (const line of missing) {
    console.error(`[check-bridge-diagnostics] missing ${line}`);
  }
  process.exit(1);
}

console.log("[check-bridge-diagnostics] ok");

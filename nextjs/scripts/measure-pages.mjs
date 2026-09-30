const baseUrl = process.argv[2] || "http://localhost:3000";
const paths = ["/", "/boards", "/recent", "/shop"];

async function measure(path) {
  const url = new URL(path, baseUrl).toString();
  const started = performance.now();
  const response = await fetch(url, {
    headers: { "User-Agent": "gnuboard-nextjs-perf-check" },
  });
  const text = await response.text();
  const total = performance.now() - started;

  return {
    path,
    status: response.status,
    bytes: Buffer.byteLength(text),
    totalMs: Math.round(total),
  };
}

const results = [];
for (const path of paths) {
  results.push(await measure(path));
}

console.table(results);

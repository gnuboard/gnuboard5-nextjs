import {
  inspectSourceFileSizes,
  loadSourceFileSizeBaseline,
  loadSourceFileSizeSplitPlan,
  SOURCE_FILE_SIZE_BASELINE,
  SOURCE_FILE_SIZE_SPLIT_PLAN,
} from "./lib/source-file-size.mjs";

const root = process.cwd();
const baseline = loadSourceFileSizeBaseline(root);
const splitPlan = loadSourceFileSizeSplitPlan(root);
const rows = inspectSourceFileSizes(root)
  .map((item) => {
    const allowed = Number(baseline[item.file] || 0);
    const plan = splitPlan[item.file] || {};
    return {
      file: item.file,
      lines: item.lines,
      baseline: allowed || "",
      overBaseline: allowed > 0 ? Math.max(0, item.lines - allowed) : "",
      warnLines: item.warnLines,
      priority: plan.priority || "",
      targetLines: plan.targetLines || "",
      nextStep: plan.nextStep || "",
    };
  })
  .filter((item) => item.lines > item.warnLines || Number(item.baseline) > 0)
  .sort((a, b) => b.lines - a.lines);

console.log("| lines | baseline | target | priority | over | file | next split step |");
console.log("|---:|---:|---:|---|---:|---|---|");
for (const row of rows.slice(0, Number(process.env.FILE_HOTSPOT_LIMIT || 25))) {
  console.log(
    `| ${row.lines} | ${row.baseline} | ${row.targetLines} | ${row.priority} | ${row.overBaseline} | ${row.file} | ${row.nextStep} |`
  );
}

if (rows.length === 0) {
  console.log("\nNo source file hotspots found.");
} else {
  console.log(
    `\nSplit the highest-risk files before increasing their baseline in ${SOURCE_FILE_SIZE_BASELINE}; keep next steps current in ${SOURCE_FILE_SIZE_SPLIT_PLAN}.`
  );
}

import {
  inspectSourceFileSizes,
  loadSourceFileSizeBaseline,
  loadSourceFileSizeSplitPlan,
  SOURCE_FILE_SIZE_BASELINE,
  SOURCE_FILE_SIZE_SPLIT_PLAN,
} from "./lib/source-file-size.mjs";

const ROOT = process.cwd();
const baseline = loadSourceFileSizeBaseline(ROOT);
const splitPlan = loadSourceFileSizeSplitPlan(ROOT);
const inspectedFiles = new Map(
  inspectSourceFileSizes(ROOT).map((item) => [item.file, item])
);

const oversized = [];
const baselineWarnings = [];
const staleBaselineEntries = [];
const splitPlanProblems = [];
const plannedPriorities = new Set(["high", "medium", "low"]);

for (const item of [...inspectedFiles.values()].sort((a, b) => b.lines - a.lines)) {
  if (Number.isFinite(item.maxLines) && item.maxLines > 0 && item.lines > item.maxLines) {
    oversized.push(item);
    continue;
  }

  if (!Number.isFinite(item.warnLines) || item.warnLines <= 0 || item.lines <= item.warnLines) {
    continue;
  }

  const allowedLines = Number(baseline[item.file] || 0);
  if (allowedLines > 0 && item.lines <= allowedLines) {
    baselineWarnings.push(item);
    continue;
  }

  oversized.push({
    ...item,
    reason: allowedLines > 0
      ? `grew beyond baseline ${allowedLines}`
      : `large file is not in ${SOURCE_FILE_SIZE_BASELINE}`,
  });
}

for (const [file, allowedLines] of Object.entries(baseline)) {
  const inspected = inspectedFiles.get(file);
  const plan = splitPlan[file];
  if (!inspected) {
    staleBaselineEntries.push({
      file,
      reason: "baseline entry no longer matches an inspected source file",
    });
    continue;
  }

  if (inspected.lines <= inspected.warnLines) {
    staleBaselineEntries.push({
      file,
      lines: inspected.lines,
      reason: `file is now at or below warning threshold ${inspected.warnLines}; remove it from baseline`,
    });
    continue;
  }

  if (Number(allowedLines) <= 0) {
    staleBaselineEntries.push({
      file,
      lines: inspected.lines,
      reason: "baseline value must be a positive line count",
    });
  }

  if (!plan || typeof plan !== "object") {
    splitPlanProblems.push({
      file,
      lines: inspected.lines,
      reason: `missing entry in ${SOURCE_FILE_SIZE_SPLIT_PLAN}`,
    });
    continue;
  }

  if (!plannedPriorities.has(String(plan.priority || ""))) {
    splitPlanProblems.push({
      file,
      lines: inspected.lines,
      reason: "split plan priority must be high, medium, or low",
    });
  }

  const targetLines = Number(plan.targetLines);
  if (!Number.isInteger(targetLines) || targetLines <= 0 || targetLines >= Number(allowedLines)) {
    splitPlanProblems.push({
      file,
      lines: inspected.lines,
      reason: `split plan targetLines must be a positive number below baseline ${allowedLines}`,
    });
  }

  if (typeof plan.nextStep !== "string" || plan.nextStep.trim().length < 20) {
    splitPlanProblems.push({
      file,
      lines: inspected.lines,
      reason: "split plan nextStep must describe the next extraction step",
    });
  }
}

for (const file of Object.keys(splitPlan)) {
  if (!baseline[file] && inspectedFiles.has(file)) {
    splitPlanProblems.push({
      file,
      reason: `split plan entry does not match ${SOURCE_FILE_SIZE_BASELINE}`,
    });
  }
}

oversized.push(...staleBaselineEntries, ...splitPlanProblems);

if (oversized.length > 0) {
  for (const item of oversized.sort((a, b) => (b.lines || 0) - (a.lines || 0))) {
    const reason = item.reason ? ` (${item.reason})` : "";
    const lineLabel = Number.isFinite(item.lines) ? `${item.lines} lines` : "not inspected";
    console.error(`[check-source-file-size] too large ${item.file}: ${lineLabel}${reason}`);
  }
  console.error(
    `[check-source-file-size] Split the file or update ${SOURCE_FILE_SIZE_BASELINE} and ${SOURCE_FILE_SIZE_SPLIT_PLAN} intentionally.`
  );
  process.exit(1);
}

if (baselineWarnings.length > 0) {
  for (const item of baselineWarnings) {
    const allowedLines = Number(baseline[item.file] || 0);
    console.warn(`[check-source-file-size] known large ${item.file}: ${item.lines}/${allowedLines} lines`);
  }
  console.warn(
    `[check-source-file-size] ${baselineWarnings.length} known large file(s) are at or below baseline; split them before increasing their line count.`
  );
}

console.log("[check-source-file-size] ok");

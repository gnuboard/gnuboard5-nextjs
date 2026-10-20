export interface PostRevisionInlineSegment {
  kind: "same" | "removed" | "added";
  text: string;
}

export interface PostRevisionDiffLine {
  kind: "same" | "removed" | "added";
  text: string;
  /** Character-level detail for paired changed lines. */
  segments?: PostRevisionInlineSegment[];
}

const MAX_DIFF_CELLS = 1_000_000;
const MAX_DIFF_CHARACTERS = 1_000_000;
const MAX_INLINE_LINE_CHARACTERS = 20_000;

function countLines(value: string): number {
  let count = 1;
  let index = -1;
  while ((index = value.indexOf("\n", index + 1)) !== -1) count += 1;
  return count;
}

function buildInlineSegments(
  before: string,
  after: string,
): { before: PostRevisionInlineSegment[]; after: PostRevisionInlineSegment[] } | null {
  if (before.length + after.length > MAX_INLINE_LINE_CHARACTERS) return null;
  const beforeCharacters = Array.from(before);
  const afterCharacters = Array.from(after);

  let prefixLength = 0;
  while (
    prefixLength < beforeCharacters.length &&
    prefixLength < afterCharacters.length &&
    beforeCharacters[prefixLength] === afterCharacters[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < beforeCharacters.length - prefixLength &&
    suffixLength < afterCharacters.length - prefixLength &&
    beforeCharacters[beforeCharacters.length - suffixLength - 1] ===
      afterCharacters[afterCharacters.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const prefix = beforeCharacters.slice(0, prefixLength).join("");
  const beforeChanged = beforeCharacters
    .slice(prefixLength, beforeCharacters.length - suffixLength)
    .join("");
  const afterChanged = afterCharacters
    .slice(prefixLength, afterCharacters.length - suffixLength)
    .join("");
  const suffix = suffixLength > 0
    ? beforeCharacters.slice(beforeCharacters.length - suffixLength).join("")
    : "";

  return {
    before: [
      ...(prefix ? [{ kind: "same" as const, text: prefix }] : []),
      ...(beforeChanged ? [{ kind: "removed" as const, text: beforeChanged }] : []),
      ...(suffix ? [{ kind: "same" as const, text: suffix }] : []),
    ],
    after: [
      ...(prefix ? [{ kind: "same" as const, text: prefix }] : []),
      ...(afterChanged ? [{ kind: "added" as const, text: afterChanged }] : []),
      ...(suffix ? [{ kind: "same" as const, text: suffix }] : []),
    ],
  };
}

/**
 * Builds a bounded LCS line diff. Large bodies fall back to the source view so
 * opening the history dialog cannot allocate an unbounded comparison matrix.
 */
export function diffPostRevisionLines(before: string, after: string): PostRevisionDiffLine[] | null {
  if (before.length + after.length > MAX_DIFF_CHARACTERS) return null;

  const rows = countLines(before) + 1;
  const columns = countLines(after) + 1;
  const cellCount = rows * columns;
  if (!Number.isSafeInteger(cellCount) || cellCount > MAX_DIFF_CELLS) return null;

  const oldLines = before.replace(/\r\n/g, "\n").split("\n");
  const newLines = after.replace(/\r\n/g, "\n").split("\n");

  const table = new Uint32Array(cellCount);
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      const cell = oldIndex * columns + newIndex;
      table[cell] = oldLines[oldIndex] === newLines[newIndex]
        ? table[(oldIndex + 1) * columns + newIndex + 1] + 1
        : Math.max(table[(oldIndex + 1) * columns + newIndex], table[cell + 1]);
    }
  }

  const lineDiff: PostRevisionDiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      lineDiff.push({ kind: "same", text: oldLines[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
    } else if (
      table[(oldIndex + 1) * columns + newIndex] >= table[oldIndex * columns + newIndex + 1]
    ) {
      lineDiff.push({ kind: "removed", text: oldLines[oldIndex] });
      oldIndex += 1;
    } else {
      lineDiff.push({ kind: "added", text: newLines[newIndex] });
      newIndex += 1;
    }
  }
  while (oldIndex < oldLines.length) {
    lineDiff.push({ kind: "removed", text: oldLines[oldIndex] });
    oldIndex += 1;
  }
  while (newIndex < newLines.length) {
    lineDiff.push({ kind: "added", text: newLines[newIndex] });
    newIndex += 1;
  }

  const result: PostRevisionDiffLine[] = [];
  for (let index = 0; index < lineDiff.length;) {
    if (lineDiff[index].kind === "same") {
      result.push(lineDiff[index]);
      index += 1;
      continue;
    }

    const changedBlock: PostRevisionDiffLine[] = [];
    while (index < lineDiff.length && lineDiff[index].kind !== "same") {
      changedBlock.push(lineDiff[index]);
      index += 1;
    }

    const removed = changedBlock.filter((line) => line.kind === "removed");
    const added = changedBlock.filter((line) => line.kind === "added");
    const pairedLineCount = Math.min(removed.length, added.length);

    for (let pairIndex = 0; pairIndex < pairedLineCount; pairIndex += 1) {
      const oldLine = removed[pairIndex];
      const newLine = added[pairIndex];
      const inline = buildInlineSegments(oldLine.text, newLine.text);
      result.push(inline ? { ...oldLine, segments: inline.before } : oldLine);
      result.push(inline ? { ...newLine, segments: inline.after } : newLine);
    }
    result.push(...removed.slice(pairedLineCount), ...added.slice(pairedLineCount));
  }

  return result;
}

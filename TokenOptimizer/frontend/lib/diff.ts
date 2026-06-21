// Word-level diff for the before/after preview. Compression is extractive (it only removes words),
// so we render the original text and strike through the words that were dropped. LCS keeps alignment
// correct even when the same word repeats.

export type DiffPart = { text: string; removed: boolean };

export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      parts.push({ text: a[i], removed: false });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push({ text: a[i], removed: true });
      i++;
    } else {
      j++; // a word present only in the output (rare for extractive) — skip it in the view
    }
  }
  while (i < n) {
    parts.push({ text: a[i], removed: true });
    i++;
  }
  return parts;
}

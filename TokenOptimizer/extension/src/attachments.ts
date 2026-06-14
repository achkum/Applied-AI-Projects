// In-browser attachment optimization. Lossless, text-format only (the engine's binary handling —
// PDF/Word extraction, YAML, AST-safe code — lives in the Python library/MCP). JSON minify is the
// highest-value, definitely-lossless win; CSV→TSV and text cleanup follow.

export type AttachmentResult = { text: string; changed: boolean; kind: string };

const OPTIMIZABLE = /\.(json|csv|txt|md|markdown)$/i;
const CODE_RE = /(```[\s\S]*?```|`[^`\n]*`)/g; // protect fenced + inline code only

export function isOptimizableAttachment(filename: string): boolean {
  return OPTIMIZABLE.test(filename);
}

export function normalizeAttachment(filename: string, text: string): AttachmentResult {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (ext === "json") return minifyJson(text);
  if (ext === "csv") return csvToTsv(text);
  if (ext === "txt" || ext === "md" || ext === "markdown") return cleanText(text);
  return { text, changed: false, kind: "none" };
}

function minifyJson(text: string): AttachmentResult {
  try {
    const min = JSON.stringify(JSON.parse(text)); // value-identical, minified
    return { text: min, changed: min.length < text.length, kind: "minify_json" };
  } catch {
    return { text, changed: false, kind: "none" }; // invalid JSON → never corrupt
  }
}

// Delimiter-parametric RFC-4180 parser (used for both CSV input and TSV round-trip verification).
function parseDsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toTsv(rows: string[][]): string {
  return (
    rows
      .map((r) =>
        r.map((cell) => (/[\t\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join("\t"))
      .join("\n") + "\n"
  );
}

function csvToTsv(text: string): AttachmentResult {
  if (!text.includes(",")) return { text, changed: false, kind: "none" };
  const rows = parseDsv(text, ",");
  const tsv = toTsv(rows);
  // value-identical-or-revert: re-parse the TSV with a tab delimiter and confirm cells round-trip.
  if (JSON.stringify(parseDsv(tsv, "\t")) !== JSON.stringify(rows)) {
    return { text, changed: false, kind: "none" };
  }
  return { text: tsv, changed: tsv.length < text.length, kind: "csv_to_tsv" };
}

function splitCode(text: string): { code: boolean; seg: string }[] {
  const parts: { code: boolean; seg: string }[] = [];
  let idx = 0;
  for (const m of text.matchAll(CODE_RE)) {
    const start = m.index ?? 0;
    if (start > idx) parts.push({ code: false, seg: text.slice(idx, start) });
    parts.push({ code: true, seg: m[0] });
    idx = start + m[0].length;
  }
  if (idx < text.length) parts.push({ code: false, seg: text.slice(idx) });
  if (parts.length === 0) parts.push({ code: false, seg: text });
  return parts;
}

function cleanText(text: string): AttachmentResult {
  // Normalize prose outside fenced/inline code (smart quotes, HTML comments, blank-line runs).
  const out = splitCode(text)
    .map((part) =>
      part.code
        ? part.seg
        : part.seg
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/\n{4,}/g, "\n\n")
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/[–—]/g, "-")
            .replace(/…/g, "...")
            .replace(/ /g, " "),
    )
    .join("");
  return { text: out, changed: out !== text, kind: "clean_text" };
}

import { describe, expect, it } from "vitest";

import { isOptimizableAttachment, normalizeAttachment } from "../attachments";

describe("attachment optimization (lossless, text formats)", () => {
  it("recognizes optimizable extensions", () => {
    expect(isOptimizableAttachment("data.json")).toBe(true);
    expect(isOptimizableAttachment("table.csv")).toBe(true);
    expect(isOptimizableAttachment("notes.md")).toBe(true);
    expect(isOptimizableAttachment("report.pdf")).toBe(false);
    expect(isOptimizableAttachment("photo.png")).toBe(false);
  });

  it("minifies JSON value-identically", () => {
    const pretty = JSON.stringify({ users: [{ id: 1, name: "a" }, { id: 2, name: "b" }] }, null, 4);
    const res = normalizeAttachment("x.json", pretty);
    expect(res.kind).toBe("minify_json");
    expect(res.changed).toBe(true);
    expect(res.text.length).toBeLessThan(pretty.length);
    expect(JSON.parse(res.text)).toEqual(JSON.parse(pretty)); // value-identical
  });

  it("never corrupts invalid JSON", () => {
    const res = normalizeAttachment("x.json", "{not valid,,,");
    expect(res.changed).toBe(false);
    expect(res.text).toBe("{not valid,,,");
  });

  it("compacts quoted CSV to TSV preserving cell values", () => {
    const csv = '"Smith, John","says ""hi"""\n"Doe","plain"\n';
    const res = normalizeAttachment("x.csv", csv);
    expect(res.kind).toBe("csv_to_tsv");
    expect(res.changed).toBe(true);
    // Cells survive: tab-separated, quotes only where needed.
    const firstRow = res.text.split("\n")[0].split("\t");
    expect(firstRow[0]).toBe("Smith, John");
    expect(res.text.length).toBeLessThan(csv.length);
  });

  it("cleans text but never touches code fences", () => {
    const code = "```\nconst x = 1;\n```";
    const text = `A “smart” quote.\n\n\n\n\n${code}\n\n<!-- secret -->Tail.`;
    const res = normalizeAttachment("notes.md", text);
    expect(res.text).toContain('A "smart" quote.'); // smart quote normalized
    expect(res.text).not.toContain("<!-- secret -->"); // comment stripped
    expect(res.text).toContain(code); // fenced code untouched
  });

  it("leaves non-text formats unchanged", () => {
    const res = normalizeAttachment("a.bin", "whatever");
    expect(res.changed).toBe(false);
    expect(res.kind).toBe("none");
  });
});

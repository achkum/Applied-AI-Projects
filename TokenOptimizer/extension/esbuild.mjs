import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "dist");

mkdirSync(dist, { recursive: true });

await build({
  entryPoints: {
    content: resolve(here, "src/content.ts"),
    background: resolve(here, "src/background.ts"),
  },
  bundle: true,
  format: "iife",
  target: "chrome114",
  outdir: dist,
  loader: { ".json": "json" },
  logLevel: "info",
});

// Ship the manifest and icons alongside the bundle.
cpSync(resolve(here, "manifest.json"), resolve(dist, "manifest.json"));
cpSync(resolve(here, "icons"), resolve(dist, "icons"), { recursive: true });

console.log("Built extension to", dist);

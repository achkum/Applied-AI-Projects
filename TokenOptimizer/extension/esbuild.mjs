import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "dist");
const shared = resolve(here, "..", "shared");

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

// Ship the manifest, icons, and the shared rule spec / token vectors alongside the bundle.
cpSync(resolve(here, "manifest.json"), resolve(dist, "manifest.json"));
cpSync(resolve(here, "icons"), resolve(dist, "icons"), { recursive: true });
cpSync(resolve(shared, "compression_rules.json"), resolve(dist, "compression_rules.json"));
cpSync(resolve(shared, "token_test_vectors.json"), resolve(dist, "token_test_vectors.json"));

console.log("Built extension to", dist);

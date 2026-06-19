// Build + zip the extension into an uploadable archive for the Chrome Web Store / Edge Add-ons.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "dist");
const out = resolve(here, "token-optimizer-extension.zip");

// Ensure a fresh build first.
execFileSync(process.execPath, [resolve(here, "esbuild.mjs")], { stdio: "inherit" });

rmSync(out, { force: true });
if (process.platform === "win32") {
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${dist}\\*' -DestinationPath '${out}' -Force`],
    { stdio: "inherit" },
  );
} else {
  execFileSync("zip", ["-r", out, "."], { cwd: dist, stdio: "inherit" });
}
console.log("Packaged extension →", out);

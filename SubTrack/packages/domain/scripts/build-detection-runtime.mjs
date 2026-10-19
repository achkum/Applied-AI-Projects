import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const vitest = createRequire(require.resolve('vitest/package.json'));
const vite = createRequire(vitest.resolve('vite/package.json'));
const esbuild = vite('esbuild');
assert.equal(esbuild.version, '0.28.2');
const money = realpathSync(fileURLToPath(import.meta.resolve('@subtrack/money')));
assert.equal(money, realpathSync(resolve(root, '../money/src/index.ts')));
const output = join(root, 'dist/detection-runtime.js');
const built = esbuild.buildSync({
  absWorkingDir: root,
  entryPoints: ['detection/index.ts'],
  outfile: output,
  bundle: true,
  packages: 'bundle',
  platform: 'node',
  format: 'esm',
  target: 'node20',
  metafile: true,
  write: false,
  logLevel: 'silent',
});
assert.ok(Object.keys(built.metafile.inputs).some((input) => realpathSync(resolve(root, input)) === money));
for (const emitted of Object.values(built.metafile.outputs)) {
  assert.ok(emitted.imports.every((item) => !item.external));
}
assert.equal(built.outputFiles.length, 1);
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, built.outputFiles[0].contents);
const probe = spawnSync(process.execPath, ['--input-type=module', '-e',
  'const m = await import("@subtrack/domain/detection-runtime"); if (typeof m.detectRecurringBigint !== "function" || typeof m.detectRecurring !== "function" || typeof m.matchMerchantDescriptor !== "function") process.exit(1);'],
{cwd: root, env: {...process.env, NODE_OPTIONS: ''}, stdio: 'pipe'});
assert.equal(probe.status, 0, 'Clean Node detection import failed');
const commonJsProbe = spawnSync(process.execPath, ['-e',
  'const {pathToFileURL} = require("node:url"); import(pathToFileURL(require.resolve("@subtrack/domain/detection-runtime")).href).then(m => {if(typeof m.detectRecurringBigint !== "function" || typeof m.matchMerchantDescriptor !== "function") process.exit(1);}).catch(() => process.exit(1));'],
{cwd: root, env: {...process.env, NODE_OPTIONS: ''}, stdio: 'pipe'});
assert.equal(commonJsProbe.status, 0, 'Clean CommonJS detection import failed');

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDemoSnapshot } from './generate.js';

const args = process.argv.slice(2);
const asOfArg = args.find((a) => a.startsWith('--as-of='))?.slice('--as-of='.length);
const outDirArg = args.find((a) => a.startsWith('--out-dir='))?.slice('--out-dir='.length);

const asOf = asOfArg ? new Date(asOfArg) : new Date();
if (isNaN(asOf.getTime())) {
  console.error(`Invalid --as-of date: "${asOfArg ?? ''}"`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = outDirArg
  ? path.resolve(outDirArg)
  : path.resolve(__dirname, '..', 'fixtures');

mkdirSync(outDir, { recursive: true });

const snapshot = generateDemoSnapshot(asOf);
const outPath = path.join(outDir, `demo-snapshot-${snapshot.asOf}.json`);
writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');

const totalTxns = snapshot.households.reduce((s, h) => s + h.transactions.length, 0);
console.log(`Demo snapshot written: ${outPath}`);
console.log(`  asOf:         ${snapshot.asOf}`);
console.log(`  households:   ${snapshot.households.length}`);
console.log(`  transactions: ${totalTxns}`);

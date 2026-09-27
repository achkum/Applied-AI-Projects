import { error, log } from 'node:console';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateContrast } from './contrast.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokenPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'src/tokens.json');
const tokens = JSON.parse(await readFile(tokenPath, 'utf8'));
const failures = validateContrast(tokens);
if (failures.length) {
  for (const failure of failures) error(failure);
  process.exitCode = 1;
} else
  log(
    `Contrast AA passed for ${tokens.contrastPairs.length} declared text pairs in ${Object.keys(tokens.color).length} themes.`,
  );

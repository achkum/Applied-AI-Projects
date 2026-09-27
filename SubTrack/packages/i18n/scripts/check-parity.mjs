import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [svPath, enPath] = process.argv.slice(2).length === 2
  ? process.argv.slice(2).map((path) => resolve(path))
  : ['catalogs/sv.json', 'catalogs/en.json'].map((path) => resolve(packageRoot, path));

async function loadCatalog(path, locale) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (!isRecord(value)) throw new Error('catalog root must be an object');
    return value;
  } catch (error) {
    console.error(`${locale} catalog (${path}): ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compare(sv, en, path = '') {
  for (const key of [...new Set([...Object.keys(sv), ...Object.keys(en)])].sort()) {
    const keyPath = path ? `${path}.${key}` : key;
    if (!(key in sv)) {
      console.error(`Missing Swedish key: ${keyPath}`);
      process.exitCode = 1;
      continue;
    }
    if (!(key in en)) {
      console.error(`Missing English key: ${keyPath}`);
      process.exitCode = 1;
      continue;
    }
    const svValue = sv[key];
    const enValue = en[key];
    const svObject = isRecord(svValue);
    const enObject = isRecord(enValue);
    if (svObject !== enObject || Array.isArray(svValue) !== Array.isArray(enValue)) {
      console.error(`Mismatched value shape at ${keyPath}`);
      process.exitCode = 1;
    } else if (svObject) {
      compare(svValue, enValue, keyPath);
    } else if (typeof svValue !== typeof enValue) {
      console.error(`Mismatched value type at ${keyPath} (sv: ${typeof svValue}, en: ${typeof enValue})`);
      process.exitCode = 1;
    }
  }
}

const sv = await loadCatalog(svPath, 'sv');
const en = await loadCatalog(enPath, 'en');
if (sv && en) compare(sv, en);
if (!process.exitCode) console.log('Swedish and English catalogs have matching nested keys and value shapes.');

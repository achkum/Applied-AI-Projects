import { runCatalogueExtraction } from './pipeline.js';

const forwarded = process.argv.slice(2);
if (forwarded[0] === '--') forwarded.shift();
const [manifest, output, ...extra] = forwarded;
if (!manifest || !output || extra.length > 0) {
  process.stderr.write('Usage: pnpm --filter @subtrack/catalog catalogue:extract -- <manifest.json> <output.json>\n');
  process.exitCode = 2;
} else {
  try {
    await runCatalogueExtraction(manifest, output);
    process.stdout.write('Catalogue candidate artifact written. Review quarantine entries; values are not verified market prices.\n');
  } catch {
    process.stderr.write('Catalogue extraction failed. Check the manifest, registered sources and output path.\n');
    process.exitCode = 1;
  }
}

// Rasterize the established repository brand; no external images or new design.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.resolve(app, '../../docs/design/branding/orbit-light.svg'), 'utf8').replace(/\r\n/g, '\n');
const sharpPath = process.argv[2];
let sharp;
if (sharpPath) {
  if (!path.isAbsolute(sharpPath)) throw new Error('Expected an existing absolute Sharp module path');
  sharp = createRequire(import.meta.url)(sharpPath);
} else {
  const web = createRequire(path.resolve(app, '../web/package.json'));
  sharp = createRequire(web.resolve('next/package.json'))('sharp');
}
if (sharp.versions.sharp !== '0.35.5') throw new Error('Expected locked Sharp 0.35.5');
// Review a brand-source change before regenerating mobile assets.
if (createHash('sha256').update(svg).digest('hex') !== '698bffd13993809e2401d5cb8ff13dc2f7e7536d13195ca216873e10a77604c9') throw new Error('Brand source differs from approved input');
const assets = path.join(app, 'assets');
await sharp(Buffer.from(svg)).resize(1024, 1024).flatten({ background: '#F7F4EE' }).png().toFile(path.join(assets, 'icon.png'));
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(path.join(assets, 'splash.png'));
const foreground = svg.replace(/ {2}<rect width="512" height="512" rx="112" fill="#F7F4EE"\/>\n/, '');
if (foreground === svg) throw new Error('Brand background shape differs');
await sharp(Buffer.from(foreground)).resize(1024, 1024).png().toFile(path.join(assets, 'adaptive-icon.png'));
process.stdout.write('PASS ST244_EXISTING_BRAND_NATIVE_BUILD_ASSETS\n');

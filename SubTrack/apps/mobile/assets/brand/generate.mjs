// Rebuild launcher/splash assets from the shared product glyph and approved tokens.
import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
const geometry = JSON.parse(fs.readFileSync(path.join(directory, 'geometry.json'), 'utf8'));
const tokens = JSON.parse(fs.readFileSync(path.join(directory, '../../../../packages/ui-tokens/src/billing-month.native.json'), 'utf8'));
// Existing workspace tooling, used only when regenerating committed assets.
const { default: sharp } = await import(pathToFileURL(path.join(directory, '../../../../node_modules/.pnpm/sharp@0.35.5_@types+node@24.19.0/node_modules/sharp/dist/index.mjs')).href);
const palette = tokens.color.dark;
const glyph = `<path d="${geometry.track}" stroke="${palette['ink.on-accent']}" stroke-width="${geometry.strokeWidth}" stroke-linecap="square" fill="none"/>`;
const image = (content) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${content}</svg>`);
const tile = `<rect width="64" height="64" rx="18" fill="${palette['action.accent']}"/>${glyph}`;
const base = `<rect width="1024" height="1024" fill="${palette['bg.canvas']}"/>`;
const assets = path.join(directory, '..');
await sharp(image(`${base}<g transform="translate(224 224) scale(9)">${tile}</g>`)).png().toFile(path.join(assets, 'icon.png'));
await sharp(image(`<g transform="translate(256 256) scale(8)">${tile}</g>`)).png().toFile(path.join(assets, 'adaptive-icon.png'));
await sharp(image(`${base}<g transform="translate(352 352) scale(5)">${tile}</g>`)).png().toFile(path.join(assets, 'splash.png'));
fs.writeFileSync(path.join(directory, 'mark.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${geometry.viewBox}">${tile}</svg>\n`);

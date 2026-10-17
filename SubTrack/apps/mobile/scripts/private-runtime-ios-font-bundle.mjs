import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {URL,pathToFileURL} from 'node:url';
import process from 'node:process';

const fonts=JSON.parse(readFileSync(new URL('../assets/fonts/billing-month-fonts.json',import.meta.url),'utf8')).staticInstances;
const readPlist=file=>JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',file],{encoding:'utf8',maxBuffer:1048576,timeout:10000}));
/** Validate the actual compiled bundle before installation, not the source config alone. */
export function verifyIosFontBundle(directory,plistReader=readPlist){
 const root=resolve(directory),stat=lstatSync(root);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());assert.equal(realpathSync(root),root);
 const plist=join(root,'Info.plist'),ps=lstatSync(plist);assert.ok(ps.isFile()&&!ps.isSymbolicLink());
 const config=plistReader(plist);assert.equal(config.CFBundleIdentifier,'se.subtrack.app');
 assert.deepEqual([...config.UIAppFonts].sort(),fonts.map(font=>font.file).sort());
 for(const font of fonts){const file=join(root,font.file),s=lstatSync(file);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=1048576);assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),font.sha256);}
 return true;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){assert.equal(process.argv.length,3);verifyIosFontBundle(process.argv[2]);}

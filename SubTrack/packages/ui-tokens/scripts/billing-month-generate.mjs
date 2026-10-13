import {URL} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
const source=new URL('../src/billing-month.native.json',import.meta.url);
writeFileSync(new URL('../generated/billing-month.native.json',import.meta.url),JSON.stringify(JSON.parse(readFileSync(source,'utf8')),null,2)+'\n');

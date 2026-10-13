/* global require, module, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro and Jest resolver hooks are loaded as CommonJS. */
const path=require('node:path');
const {createJestMoneyResolver}=require('./billing-month-resolver.cjs');
module.exports=createJestMoneyResolver({directory:path.resolve(__dirname,'../../../packages/money/src'),target:path.resolve(__dirname,'../../../packages/money/src/formatter.ts')});

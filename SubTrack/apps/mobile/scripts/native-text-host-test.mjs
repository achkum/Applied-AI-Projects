import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {URL} from 'node:url';

// Use the installed Expo/Babel toolchain, including its real JSX whitespace rules.
const mobileRequire=createRequire(import.meta.url),babel=mobileRequire('@babel/core');
const expoRequire=createRequire(mobileRequire.resolve('babel-preset-expo'));
const jsx=expoRequire('@babel/plugin-transform-react-jsx');
const hosts=new Set(['View','ScrollView','SafeAreaView','Pressable','Modal','KeyboardAvoidingView','TouchableOpacity','TouchableHighlight','TouchableWithoutFeedback','FlatList','SectionList','Svg']);

function rawHostChildren(source,filename='fixture.tsx'){
 const {ast}=babel.transformSync(source,{filename,babelrc:false,configFile:false,ast:true,code:false,parserOpts:{plugins:['typescript','jsx']},plugins:[[jsx,{runtime:'classic'}]]});
 const findings=[];
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.object.name==='React'&&node.callee.property.name==='createElement'){
   const [host,,...children]=node.arguments;
   if(host.type==='Identifier'&&hosts.has(host.name))for(const child of children)if(child.type==='StringLiteral'||child.type==='NumericLiteral')findings.push({host:host.name,line:child.loc?.start.line??node.loc?.start.line,value:child.value});
  }
  for(const [key,value]of Object.entries(node))if(key!=='loc'&&key!=='extra'){
   if(Array.isArray(value))value.forEach(visit);else visit(value);
  }
 }
 visit(ast);return findings;
}

test('compiled inline JSX spaces and numeric children reproduce the native Text host error',()=>{
 assert.deepEqual(rawHostChildren('<ScrollView>{null}   {null}</ScrollView>'),[{host:'ScrollView',line:1,value:'   '}]);
 assert.equal(rawHostChildren('<View>{0}</View>')[0].value,0);
 assert.equal(rawHostChildren('<Pressable>Unexpected caption</Pressable>')[0].value,'Unexpected caption');
});
test('newline formatting and actual Text wrappers remain legal native JSX',()=>{
 assert.deepEqual(rawHostChildren('<ScrollView>\n  {null}\n  {null}\n</ScrollView>'),[]);
 assert.deepEqual(rawHostChildren('<View><Text>Words {12}</Text><AnalyticsText>Words {12}</AnalyticsText></View>'),[]);
});
test('production native product screens and their shared presentation graph compile without raw host text',()=>{
 const files=['onboarding/NativePersonalScreen.tsx','onboarding/NativeCategoryField.tsx','banks/NativePersonalBankScreen.tsx','home/NativePersonalRenewalsScreen.tsx','detection/NativeDetectionInboxScreen.tsx','household/NativeHouseholdScreen.tsx','insights/NativeHomeOverview.tsx','insights/NativeInsightsScreen.tsx','insights/NativeComparisonsScreen.tsx','insights/NativeAnalyticsUI.tsx','billing/NativeBillingMonthScreen.tsx','billing/NativeProductUI.tsx','billing/NativeProductNav.tsx','billing/NativeDatePicker.tsx','billing/BillingIcon.tsx'];
 for(const file of files){const source=readFileSync(new URL(`../src/components/${file}`,import.meta.url),'utf8');assert.deepEqual(rawHostChildren(source,file),[],`${file}: raw native host text`);}
});

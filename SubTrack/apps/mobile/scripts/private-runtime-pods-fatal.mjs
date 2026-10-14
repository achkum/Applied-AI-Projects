const ruby=/^\s*(?:JSON::(?:Ext::)?ParserError|ArgumentError|TypeError|RuntimeError|SyntaxError|NoMethodError|NameError|Pod::DSLError|Pod::Informative)(?:\s*[-:]|\s*$)/;
const parsing=/^\s*(?:Error parsing JSON(?:\s*[-:]|\s*$)|JSON parse invalid(?:\s*[-:]|\s*$)|unexpected token at(?:\s|$))/i;
const legacy=/^\s*JSON::ParserError(?:\s*[-:]|\s*$)/;
const stop=/^\s*(?:\* Try:|\* Get more help|BUILD (?:FAILED|SUCCESSFUL)|Analyzing dependencies|Downloading dependencies|### |```|\[!\] Oh no|Search for existing GitHub issues)/;
function positive(line){return !/\b(?:COMPLETED|PASSED|SUCCESS(?:FUL)?)\b/i.test(line)&&(ruby.test(line)||parsing.test(line));}
/** Private build-text selection only; consumers retain existing secret redaction. */
export function selectPodsFatal(text){
 if(typeof text!=='string'||text.length>4_000_000)return null;
 const lines=text.split(/\r?\n/);
 // eslint-disable-next-line no-control-regex
 const plain=lines.map(line=>line.replace(/\u001b\[[0-9;]*[A-Za-z]/g,''));
 let start=-1,end=lines.length;
 for(let header=0;header<plain.length;header++){
  if(!/^\s*### Error\s*$/.test(plain[header]))continue;
  const limit=Math.min(header+13,plain.length);let opened=false;
  for(let index=header+1;index<limit;index++){
   if(/^\s*```(?:[A-Za-z]+)?\s*$/.test(plain[index])){if(opened)break;opened=true;continue;}
   if(/^\s*### /.test(plain[index]))break;
   if(positive(plain[index])){start=index;end=limit;break;}
  }
  if(start>=0)break;
 }
 if(start<0)start=plain.findIndex(line=>legacy.test(line)&&positive(line));
 if(start<0)return null;
 const block=[];
 for(let index=start;index<Math.min(start+12,end);index++){if(stop.test(plain[index]))break;block.push(lines[index]);}
 return block.join('\n');
}

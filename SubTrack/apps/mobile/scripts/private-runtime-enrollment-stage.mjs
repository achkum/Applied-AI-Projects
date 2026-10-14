const STAGES=Object.freeze(['submit-valid','submit-invalid','start-accepted','start-ignored','config-accepted','config-rejected','entropy-accepted','entropy-rejected','fetch-entered','fetch-rejected','response-accepted','response-other','contract-accepted','contract-rejected','flow-committed','flow-obsolete']);
export function enrollmentStageDiagnostic({phase,log}){
 if(phase!=='flow-identifier'||typeof log!=='string'||log.length>4_000_000)return null;
 // Strip terminal decoration for matching only; never expose source bytes.
 // eslint-disable-next-line no-control-regex
 const lines=log.replace(/\u001b\[[0-9;]*[A-Za-z]/g,'').split(/\r?\n/);
 let calibrated=false;const counts=Object.fromEntries(STAGES.map(stage=>[stage,0]));
 for(const line of lines){
  if(!line.includes('ST244_ENROLLMENT'))continue;
  const marker=line.trim().replace(/^(?:LOG|INFO)\s+/,'');
  if(marker==='ST244_ENROLLMENT calibration=mounted'){calibrated=true;for(const stage of STAGES)counts[stage]=0;continue;}
  const match=/^ST244_ENROLLMENT stage=([a-z-]+)$/.exec(marker);
  if(!match||!STAGES.includes(match[1])||!calibrated)return null;
  counts[match[1]]=Math.min(2,counts[match[1]]+1);
 }
 if(!calibrated)return null;
 return Object.freeze(Object.fromEntries(STAGES.map(stage=>[stage,counts[stage]===0?'unobserved':counts[stage]===1?'one':'multiple'])));
}

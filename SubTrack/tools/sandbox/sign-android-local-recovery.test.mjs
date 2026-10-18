import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath,URL} from 'node:url';

const script=fileURLToPath(new URL('./sign-android-local-recovery.ps1',import.meta.url));
const windows=process.platform==='win32';
const extraction=String.raw`
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($env:ST253_RECOVERY_TEST_SOURCE,[ref]$tokens,[ref]$errors)
if($errors.Count -ne 0){throw 'PARSE'}
function Source-Function([string]$name){$matches=@($ast.FindAll({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq $name},$true));if($matches.Count -ne 1){throw 'FUNCTION'};return $matches[0].Extent.Text}
`;
function run(body,{env={}}={}){
 const output=execFileSync('pwsh',['-NoProfile','-NonInteractive','-Command',extraction+body],{encoding:'utf8',timeout:30000,maxBuffer:65536,env:{...process.env,ST253_RECOVERY_TEST_SOURCE:script,ST253_RECOVERY_TEST_NODE:process.execPath,...env},windowsHide:true});
 assert.equal(output.trim(),'PASS');
}
test('actual PowerShell source parses without invoking any signer or module entrypoint',{skip:!windows},()=>run(`'PASS'`));
test('actual signer requests the one-line password only once and retains certificate and v2 verification',{skip:!windows},()=>run(String.raw`
foreach($name in @('Require','Sign-And-Verify')){Invoke-Expression (Source-Function $name)}
$script:java='synthetic-java';$script:jar='synthetic-jar';$script:calls=[Collections.Generic.List[object]]::new();$script:aclCalls=0
$expected='10c659cae262ad807ae2da9a9c137b581c633ebef2ea3bce86bfe6c41052186c'
function Set-PrivateAcl {param($Path,$Directory);if($Path -cne 'synthetic-signed' -or $Directory){throw 'ACL'};$script:aclCalls++}
function Native {param([string]$Program,[string[]]$Arguments)
  $script:calls.Add(@{Program=$Program;Arguments=$Arguments})
  if($Arguments -ccontains 'verify'){return "Signer #1 certificate SHA-256 digest: $expected"+[Environment]::NewLine+'Number of signers: 1'+[Environment]::NewLine+'Verified using v2 scheme (APK Signature Scheme v2): true'}
}
Sign-And-Verify 'synthetic-key' 'synthetic-password-file' 'synthetic-unsigned' 'synthetic-signed' $expected
if($script:calls.Count -ne 2 -or $script:aclCalls -ne 1){throw 'CALLS'}
$sign=$script:calls[0].Arguments;$verify=$script:calls[1].Arguments
if($sign -ccontains '--key-pass' -or @($sign|Where-Object {$_ -ceq 'file:synthetic-password-file'}).Count -ne 1){throw 'PASSWORD_RETRIEVED_TWICE'}
if($sign[[Array]::IndexOf($sign,'--ks-type')+1] -cne 'PKCS12' -or $sign[[Array]::IndexOf($sign,'--min-sdk-version')+1] -cne '24'){throw 'SIGN_POLICY'}
if($verify -cnotcontains '--print-certs' -or $verify -cnotcontains '--verbose'){throw 'VERIFY_POLICY'}
'PASS'
`));
test('actual executable resolver chooses one executable from multiple Application matches and rejects relative paths',{skip:!windows},()=>run(String.raw`
foreach($name in @('Require','No-Reparse','Resolve-Executable')){Invoke-Expression (Source-Function $name)}
$script:lookup=@([pscustomobject]@{Source=$env:ST253_RECOVERY_TEST_NODE},[pscustomobject]@{Source='not-selected.exe'})
function Get-Command {param($Name,$CommandType,$ErrorAction);return $script:lookup}
$selected=Resolve-Executable 'node';if($selected -isnot [string] -or $selected -cne $env:ST253_RECOVERY_TEST_NODE){throw 'MULTIPLE'}
$script:lookup=@([pscustomobject]@{Source='relative.exe'});$rejected=$false;try{[void](Resolve-Executable 'node')}catch{$rejected=$_.Exception.Message -ceq 'ST253_ANDROID_LOCAL_CUSTODY_UNAVAILABLE'};if(-not $rejected){throw 'RELATIVE'}
'PASS'
`));
test('AST-extracted actual Unpack accepts only complete bounded synthetic backup envelopes and actual Clear-Bytes clears buffers',{skip:!windows},()=>run(String.raw`
foreach($name in @('Require','Clear-Bytes','Unpack')){Invoke-Expression (Source-Function $name)}
$certificate='10c659cae262ad807ae2da9a9c137b581c633ebef2ea3bce86bfe6c41052186c'
function Pack([byte[]]$key,[byte[]]$password){$stream=[IO.MemoryStream]::new();$writer=[IO.BinaryWriter]::new($stream);try{$writer.Write([Text.Encoding]::ASCII.GetBytes('ST250BK1'));$writer.Write([int]$key.Length);$writer.Write($key);$writer.Write([int]$password.Length);$writer.Write($password);$writer.Write([Text.Encoding]::ASCII.GetBytes($certificate));$writer.Flush();return ,$stream.ToArray()}finally{$writer.Dispose();$stream.Dispose()}}
$bytes=Pack ([byte[]](1,2,3)) ([byte[]](4,5));$decoded=Unpack $bytes
if([Convert]::ToHexString($decoded.Key) -cne '010203' -or [Convert]::ToHexString($decoded.Password) -cne '0405'){throw 'VALID'}
Clear-Bytes $decoded.Key;Clear-Bytes $decoded.Password
if(@($decoded.Key|Where-Object {$_ -ne 0}).Count -ne 0 -or @($decoded.Password|Where-Object {$_ -ne 0}).Count -ne 0){throw 'CLEAR'}
$cases=[Collections.Generic.List[byte[]]]::new();$wrong=[byte[]]$bytes.Clone();$wrong[0]=0;$cases.Add($wrong)
$negative=[byte[]]$bytes.Clone();[BitConverter]::GetBytes([int]-1).CopyTo($negative,8);$cases.Add($negative)
$oversize=[byte[]]$bytes.Clone();[BitConverter]::GetBytes([int]65537).CopyTo($oversize,8);$cases.Add($oversize)
$cases.Add([byte[]]$bytes[0..12]);$cases.Add([byte[]]($bytes+[byte]0));$wrongCert=[byte[]]$bytes.Clone();$wrongCert[$wrongCert.Length-1]=48;$cases.Add($wrongCert)
$cases.Add((Pack ([byte[]]@()) ([byte[]](1))));$cases.Add((Pack ([byte[]](1)) ([byte[]]@())))
$large=New-Object byte[] 131073;$cases.Add($large)
foreach($value in $cases){$rejected=$false;try{[void](Unpack $value)}catch{$rejected=$_.Exception.Message -cin @('ST253_ANDROID_LOCAL_BACKUP_PAYLOAD_UNAVAILABLE','ST253_ANDROID_LOCAL_CUSTODY_UNAVAILABLE')};if(-not $rejected){throw 'ACCEPTED_INVALID'};Clear-Bytes $value}
'PASS'
`));
test('real entrypoint rejects each runtime override before creating output or reading public/private tooling',{skip:!windows},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'st253-env-'));
 try{
  const names=['NODE_OPTIONS','NODE_PATH','JAVA_TOOL_OPTIONS','_JAVA_OPTIONS','JDK_JAVA_OPTIONS','CLASSPATH','OPENSSL_CONF','OPENSSL_MODULES','LD_PRELOAD','DYLD_INSERT_LIBRARIES'];
  for(const [index,name]of names.entries()){
   const output=path.join(root,'not-created-'+index),env={...process.env,[name]:'synthetic-override-canary'};
   assert.throws(()=>execFileSync('pwsh',['-NoProfile','-NonInteractive','-File',script,'-Mode','QualifyPublic','-PublicToolsDirectory',root,'-PublicToolsReceiptSha256','0'.repeat(64),'-OutputDirectory',output],{env,encoding:'utf8',timeout:10000,maxBuffer:16384,stdio:['ignore','pipe','pipe'],windowsHide:true}),error=>String(error.stderr).includes('ST253_ANDROID_LOCAL_CUSTODY_UNAVAILABLE'));
   assert.equal(fs.existsSync(output),false);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('AST-extracted actual C# process drains both pipes, sends bounded stdin and kills its owned process on floods and deadline',{skip:!windows},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'st253-bounded-process-'));
 try{run(String.raw`
$definition=@($ast.FindAll({param($node)$node -is [Management.Automation.Language.StringConstantExpressionAst] -and $node.Value.Contains('public static class LocalBoundedProcess')},$true))
if($definition.Count -ne 1){throw 'CLASS'};Add-Type -TypeDefinition $definition[0].Value
$node=$env:ST253_RECOVERY_TEST_NODE;$cwd=$env:ST253_RECOVERY_TEST_CWD
$output=[ST253.LocalBoundedProcess]::Run($node,@('-e','let x=[];process.stdin.on("data",v=>x.push(v));process.stdin.on("end",()=>process.stdout.write(String(Buffer.concat(x).length)))'),$cwd,[byte[]](1,2,3,4),5000)
if($output -cne '4'){throw 'STDIN'}
$categories=@{
 'Unsupported option: --synthetic-private-canary'='ARGUMENT';
 'com.android.apksig.apk.ApkFormatException: synthetic-private-canary'='MANIFEST';
 'Failed to load signer "synthetic-private-canary"'='KEYSTORE';
 'java.lang.NoClassDefFoundError: synthetic-private-canary'='JAVA_DEPENDENCY';
 'java.io.FileNotFoundException: synthetic-private-canary'='IO';
 'unclassified synthetic-private-canary'='EXIT_NONZERO'
}
foreach($message in $categories.Keys){
 $code='process.stderr.write('+($message|ConvertTo-Json -Compress)+');process.exit(2)';$rejected=$false
 try{[void][ST253.LocalBoundedProcess]::Run($node,@('-e',$code),$cwd,$null,5000)}catch{$detail=$_.Exception.ToString();$rejected=$detail.Contains('ST253_ANDROID_LOCAL_PROCESS_UNAVAILABLE category='+$categories[$message]) -and -not $detail.Contains('synthetic-private-canary')}
 if(-not $rejected){throw 'CATEGORY'}
}
foreach($kind in @('stdout','stderr','timeout')){
 $marker=Join-Path $cwd ($kind+'.pid');$code='require("fs").writeFileSync('+($marker|ConvertTo-Json -Compress)+',String(process.pid));'
 if($kind -eq 'stdout'){$code+='process.stdout.write(Buffer.alloc(1048577,65));'}
 if($kind -eq 'stderr'){$code+='process.stderr.write(Buffer.alloc(1048577,66));'}
 $code+='setInterval(()=>{},1000)';$began=[DateTime]::UtcNow;$rejected=$false
 try{[void][ST253.LocalBoundedProcess]::Run($node,@('-e',$code),$cwd,$null,2000)}catch{$rejected=$_.Exception.ToString().Contains('ST253_ANDROID_LOCAL_PROCESS_UNAVAILABLE')}
 if(-not $rejected -or ([DateTime]::UtcNow-$began).TotalSeconds -gt 15 -or -not(Test-Path -LiteralPath $marker)){throw 'BOUND'}
 $ownedPid=[int][IO.File]::ReadAllText($marker);if(Get-Process -Id $ownedPid -ErrorAction SilentlyContinue){throw 'CHILD_RETAINED'}
}
'PASS'
`,{env:{ST253_RECOVERY_TEST_CWD:root}});}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('actual Native wrapper retains closed failure categories and never masks termination uncertainty',{skip:!windows},()=>run(String.raw`
foreach($name in @('Require','No-Reparse','Check-Environment','Native')){Invoke-Expression (Source-Function $name)}
Add-Type 'namespace ST253 {public static class LocalBoundedProcess {public static bool Uncertain=false;public static string Run(string p,string[] a,string c,byte[] i,int t){throw new System.Exception(Uncertain?"ST253_ANDROID_LOCAL_TERMINATION_UNCERTAIN":"ST253_ANDROID_LOCAL_PROCESS_UNAVAILABLE category=ARGUMENT");}}}'
$script:privateCwd=[IO.Path]::GetDirectoryName($env:ST253_RECOVERY_TEST_NODE)
$rejected=$false;try{[void](Native $env:ST253_RECOVERY_TEST_NODE @('unused'))}catch{$rejected=$_.Exception.Message -ceq 'ST253_ANDROID_LOCAL_PROCESS_UNAVAILABLE stage=RECEIPT_VALIDATION category=ARGUMENT'};if(-not $rejected){throw 'CATEGORY_LOST'}
[ST253.LocalBoundedProcess]::Uncertain=$true;$rejected=$false;try{[void](Native $env:ST253_RECOVERY_TEST_NODE @('unused'))}catch{$rejected=$_.Exception.Message -ceq 'ST253_ANDROID_LOCAL_TERMINATION_UNCERTAIN stage=RECEIPT_VALIDATION'};if(-not $rejected){throw 'UNCERTAINTY_LOST'}
'PASS'
`));

# Existing desktop gh authentication only. Prepare verified files; never upload/import/activate VPS.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ReceiptPath,[Parameter(Mandatory)][string]$DestinationRoot)
$ErrorActionPreference='Stop'
$repo='achkum/Applied-AI-Projects'
$module=Join-Path $PSScriptRoot 'draft-transfer-receipt.cjs'
$work=$null;$success=$false
function Assert-PlainPath([string]$Path){$item=Get-Item -LiteralPath $Path -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Path rejected'};$cursor=$item;while($null -ne $cursor){if($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Path rejected'};$cursor=$cursor.Parent}}
function ConvertTo-NativeArgument([string]$Value){
 # Windows CRT argv quoting, including embedded quotes and trailing backslashes.
 $quoted=[regex]::Replace($Value,'(\\*)"','$1$1\"')
 $quoted=[regex]::Replace($quoted,'(\\+)$','$1$1')
 return '"'+$quoted+'"'
}
function Invoke-Private([string]$Command,[string[]]$Arguments,[string]$Output){
 # Explicit UTF8 avoids Windows PowerShell5.1 native redirection's UTF16LE.
 $utf8=[Text.UTF8Encoding]::new($false,$true)
 $info=[Diagnostics.ProcessStartInfo]::new()
 $info.FileName=(Get-Command $Command -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
 $info.Arguments=($Arguments|ForEach-Object {ConvertTo-NativeArgument $_}) -join ' '
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.StandardOutputEncoding=$utf8;$info.StandardErrorEncoding=$utf8
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info
 try{
  if(-not $process.Start()){throw 'Native operation failed'}
  $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  if(-not $process.WaitForExit(1200000)){$process.Kill();$process.WaitForExit();throw 'Native operation failed'}
  $status=$process.ExitCode
  [IO.File]::WriteAllText($Output,$stdout.GetAwaiter().GetResult(),$utf8)
  [IO.File]::WriteAllText((Join-Path $work 'native-private.log'),$stderr.GetAwaiter().GetResult(),$utf8)
  if($status -ne 0){throw 'Native operation failed'}
 }finally{$process.Dispose()}
}
try{
 Assert-PlainPath $DestinationRoot;Assert-PlainPath $ReceiptPath
 $base=(Get-Item -LiteralPath $DestinationRoot).FullName
 if(-not (Get-Item -LiteralPath $base).PSIsContainer){throw 'Directory required'}
 $work=Join-Path $base ('st250-download-'+[guid]::NewGuid().ToString('N'))
 if(Test-Path -LiteralPath $work){throw 'Collision'}
 [IO.Directory]::CreateDirectory($work)|Out-Null
 $acl=[Security.AccessControl.DirectorySecurity]::new();$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl.SetOwner($identity);$acl.SetAccessRuleProtection($true,$false);$rule=[Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule);Set-Acl -LiteralPath $work -AclObject $acl
 Assert-PlainPath $work
 $receiptFile=Join-Path $work 'transfer-receipt.json';Copy-Item -LiteralPath $ReceiptPath -Destination $receiptFile
 $envelopeScript='const fs=require("node:fs"),m=require(process.argv[1]);try{const r=m.transferReceiptEnvelope(JSON.parse(fs.readFileSync(process.argv[2],"utf8")));process.stdout.write(JSON.stringify(r));}catch{process.exitCode=1;}'
 $envelope=Join-Path $work 'envelope-private.json';Invoke-Private 'node' @('-e',$envelopeScript,$module,$receiptFile) $envelope
 $r=Get-Content -Raw -LiteralPath $envelope|ConvertFrom-Json
 $remote=Join-Path $work 'remote-private.json';Invoke-Private 'gh' @('api',"repos/$repo/releases/$($r.releaseId)") $remote
 $remoteScript='const fs=require("node:fs"),m=require(process.argv[1]);try{const r=m.transferReceiptEnvelope(JSON.parse(fs.readFileSync(process.argv[2],"utf8"))),v=JSON.parse(fs.readFileSync(process.argv[3],"utf8"));if(v.id!==r.releaseId||v.draft!==true||v.prerelease!==true||v.tag_name!==r.draftTag||v.target_commitish!==r.defaultTargetHead||!Array.isArray(v.assets)||v.assets.length!==2)throw Error();for(const [id,name,size,digest,type]of [[r.archiveAssetId,"subtrack-sandbox-api-"+r.sourceHead+".tar.gz",r.archiveBytes,r.archiveSha256,"application/gzip"],[r.manifestAssetId,"st250-transfer-"+r.sourceHead+".json",r.manifestBytes,r.manifestSha256,"application/json"]]){const a=v.assets.filter(x=>x.id===id);if(a.length!==1||a[0].name!==name||a[0].size!==size||a[0].digest!=="sha256:"+digest||a[0].state!=="uploaded"||a[0].content_type!==type)throw Error();}}catch{process.exitCode=1;}'
 Invoke-Private 'node' @('-e',$remoteScript,$module,$receiptFile,$remote) (Join-Path $work 'validate-private.log')
 $archiveName="subtrack-sandbox-api-$($r.sourceHead).tar.gz";$manifestName="st250-transfer-$($r.sourceHead).json"
 Invoke-Private 'gh' @('release','download',$r.draftTag,'--repo',$repo,'--pattern',$archiveName,'--pattern',$manifestName,'--dir',$work) (Join-Path $work 'download-private.log')
 $archive=Join-Path $work $archiveName;$manifest=Join-Path $work $manifestName
 foreach($file in @($archive,$manifest)){Assert-PlainPath $file;if((Get-Item -LiteralPath $file).PSIsContainer){throw 'File required'}}
 if((Get-Item -LiteralPath $archive).Length -ne $r.archiveBytes -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $r.archiveSha256){throw 'Archive mismatch'}
 if((Get-Item -LiteralPath $manifest).Length -ne $r.manifestBytes -or (Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $r.manifestSha256){throw 'Manifest mismatch'}
 Invoke-Private 'node' @($module,'validate',$manifest,$receiptFile) (Join-Path $work 'contract-private.json')
 # Re-read mutable remote metadata after the binary downloads and validate it again.
 Invoke-Private 'gh' @('api',"repos/$repo/releases/$($r.releaseId)") $remote
 Invoke-Private 'node' @('-e',$remoteScript,$module,$receiptFile,$remote) (Join-Path $work 'validate-private.log')
 Move-Item -LiteralPath $archive -Destination (Join-Path $work 'api-image.tar.gz')
 Move-Item -LiteralPath $manifest -Destination (Join-Path $work 'transfer-manifest.json')
 foreach($name in @('native-private.log','envelope-private.json','remote-private.json','validate-private.log','download-private.log','contract-private.json')){ $file=Join-Path $work $name;if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file}}
 $success=$true;Write-Output "ST250_VERIFIED_LOCAL_STAGING $work"
}catch{Write-Error 'ST250_DRAFT_DOWNLOAD_FAILURE';exit 1}
finally{if(-not $success -and $null -ne $work -and (Test-Path -LiteralPath $work)){Assert-PlainPath $work;$absolute=(Get-Item -LiteralPath $work).FullName;if([IO.Path]::GetDirectoryName($absolute) -ne $base -or [IO.Path]::GetFileName($absolute) -notmatch '^st250-download-[a-f0-9]{32}$'){throw 'Cleanup boundary rejected'};Remove-Item -LiteralPath $absolute -Recurse -Force}}

[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Download','Stage','Initialize','Backup','VerifyBackup','Sign','ReturnSigned')][string]$Mode,
  [Parameter(Mandatory)][string]$PrimaryCheckout,
  [ValidateSet('apk','tools')][string]$Kind='apk',
  [string]$ReceiptFile,
  [ValidatePattern('^[a-f0-9]{40}$')][string]$SourceHead,
  [ValidatePattern('^[a-f0-9]{40}$')][string]$SigningToolingHead,
  [ValidatePattern('^[1-9][0-9]*-[1-9][0-9]*$')][string]$ToolsRun,
  [ValidatePattern('^[1-9][0-9]*-[1-9][0-9]*$')][string]$ApkRun,
  [ValidatePattern('^sha256:[a-f0-9]{64}$')][string]$ToolsImage,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$SignerCertificateSha256,
  [switch]$FreeDraftConfirmed
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(-not $IsWindows){throw 'ST250_ANDROID_WINDOWS_REQUIRED'}
$transport='openclaw@198.44.116.159'
$remoteRoot='/home/openclaw/subtrack-sandbox'
$context=[Text.Encoding]::UTF8.GetBytes('st250-android-signer-backup-v1/current-user')
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid=[Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$module=Join-Path $PSScriptRoot 'android-transfer-receipt.mjs'
function Require([bool]$Condition){if(-not $Condition){throw 'ST250_ANDROID_CUSTODY_UNAVAILABLE'}}
function Sha([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Clear-Bytes([byte[]]$Bytes){if($null -ne $Bytes){[Array]::Clear($Bytes,0,$Bytes.Length)}}
function No-Reparse([string]$Path){
  $current=[IO.Path]::GetFullPath($Path)
  while($current){
    if(Test-Path -LiteralPath $current){$item=Get-Item -LiteralPath $current -Force;Require (($item.Attributes -band [IO.FileAttributes]::ReparsePoint)-eq 0)}
    $parent=[IO.Path]::GetDirectoryName($current);if($parent -eq $current){break};$current=$parent
  }
}
function Set-PrivateAcl([string]$Path,[bool]$Directory){
  No-Reparse $Path
  if($Directory){$acl=[Security.AccessControl.DirectorySecurity]::new()}else{$acl=[Security.AccessControl.FileSecurity]::new()}
  $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
  foreach($principal in @($sid,$systemSid)){
    if($Directory){$rule=[Security.AccessControl.FileSystemAccessRule]::new($principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow')}
    else{$rule=[Security.AccessControl.FileSystemAccessRule]::new($principal,'FullControl','Allow')}
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
  Check-PrivateAcl $Path
}
function Check-PrivateAcl([string]$Path){
  No-Reparse $Path;$acl=Get-Acl -LiteralPath $Path
  Require ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid.Value)
  Require $acl.AreAccessRulesProtected
  $rules=$acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]);Require ($rules.Count -eq 2)
  foreach($rule in $rules){Require (-not $rule.IsInherited -and $rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -in @($sid.Value,$systemSid.Value) -and $rule.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl)}
}
function New-PrivateDirectory([string]$Path){Require (-not(Test-Path -LiteralPath $Path));No-Reparse $Path;[void][IO.Directory]::CreateDirectory($Path);Set-PrivateAcl $Path $true}
function Write-Private([string]$Path,[byte[]]$Bytes){
  Require (-not(Test-Path -LiteralPath $Path));No-Reparse $Path
  $stream=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  Set-PrivateAcl $Path $false
}
function Native([string]$Program,[string[]]$Arguments){
  # Capture all text privately. Exceptions expose only fixed finite status.
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$Program;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  foreach($argument in $Arguments){$start.ArgumentList.Add($argument)}
  $process=[Diagnostics.Process]::new();$process.StartInfo=$start
  try{
    Require $process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    if(-not $process.WaitForExit(900000)){$process.Kill($true);$process.WaitForExit();throw 'ST250_ANDROID_NATIVE_TIMEOUT'}
    $text=$stdout.GetAwaiter().GetResult();$privateError=$stderr.GetAwaiter().GetResult()
    Require ($process.ExitCode -eq 0 -and $text.Length -le 1048576 -and $privateError.Length -le 1048576)
    return $text
  }finally{$process.Dispose()}
}
function Remote([string]$Command){Native 'ssh' @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3',$transport,$Command)}
function Scp-In([string]$RemoteFile,[string]$LocalFile){
  Require ($RemoteFile -match '^/home/openclaw/subtrack-sandbox/[a-zA-Z0-9/._-]+$')
  Require (-not(Test-Path -LiteralPath $LocalFile));No-Reparse $LocalFile
  [void](Native 'scp' @('-q','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',"${transport}:$RemoteFile",$LocalFile));Set-PrivateAcl $LocalFile $false
}
function Scp-Out([string]$LocalFile,[string]$RemoteFile){
  Require ($RemoteFile -match '^/home/openclaw/subtrack-sandbox/[a-zA-Z0-9/._-]+$');No-Reparse $LocalFile
  [void](Native 'scp' @('-q','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',$LocalFile,"${transport}:$RemoteFile"))
}
function Remove-Owned([string]$Path,[string]$Parent){
  $absolute=[IO.Path]::GetFullPath($Path);$prefix=[IO.Path]::GetFullPath($Parent).TrimEnd('\')+'\'
  Require ($absolute.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase));No-Reparse $absolute
  if(Test-Path -LiteralPath $absolute){Remove-Item -LiteralPath $absolute -Recurse -Force}
  Require (-not(Test-Path -LiteralPath $absolute))
}
$primary=[IO.Path]::GetFullPath($PrimaryCheckout);No-Reparse $primary
$projectFile=Join-Path $primary 'package.json';No-Reparse $projectFile;Require (Test-Path -LiteralPath $projectFile -PathType Leaf)
$project=Get-Content -LiteralPath $projectFile -Raw|ConvertFrom-Json;Require ($project.name -eq 'subtrack' -and $project.private -is [bool] -and $project.private -eq $true)
Require ($primary -notmatch '[\\/]\.codex[\\/]worktrees[\\/]')
$localRoot=Join-Path $primary '.codex-local-task-setup';No-Reparse $localRoot
if(-not(Test-Path -LiteralPath $localRoot)){New-PrivateDirectory $localRoot}else{Require ((Get-Acl -LiteralPath $localRoot).GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid.Value)}
$gitRoot=(Native 'git' @('-C',$primary,'rev-parse','--show-toplevel')).Trim()
$relative=[IO.Path]::GetRelativePath($gitRoot,$localRoot).Replace('\','/');Require (-not $relative.StartsWith('../'))
$null=& git -C $gitRoot check-ignore --quiet -- $relative 2>$null
if($LASTEXITCODE -ne 0){
  $gitDir=(Native 'git' @('-C',$primary,'rev-parse','--absolute-git-dir')).Trim();No-Reparse $gitDir
  $exclude=Join-Path $gitDir 'info/exclude';No-Reparse $exclude
  [IO.File]::AppendAllText($exclude,"`n/$relative/`n",[Text.UTF8Encoding]::new($false))
  $null=& git -C $gitRoot check-ignore --quiet -- "$relative/probe" 2>$null;Require ($LASTEXITCODE -eq 0)
}
$transferRoot=Join-Path $localRoot 'android-transfer'
if(-not(Test-Path -LiteralPath $transferRoot)){New-PrivateDirectory $transferRoot}else{Check-PrivateAcl $transferRoot}
if($Mode -eq 'Download'){
  Require (Test-Path -LiteralPath $ReceiptFile -PathType Leaf);$r=Get-Content -LiteralPath $ReceiptFile -Raw|ConvertFrom-Json
  Require ($r.sourceHead -match '^[a-f0-9]{40}$' -and $r.runId -match '^[1-9][0-9]*-[1-9][0-9]*$')
  $dir=Join-Path $transferRoot "$Kind-$($r.runId)";New-PrivateDirectory $dir
  try{[void](Native 'node' @($module,'download',$Kind,[IO.Path]::GetFullPath($ReceiptFile),$dir));foreach($file in Get-ChildItem -LiteralPath $dir -File){Set-PrivateAcl $file.FullName $false}}
  catch{Remove-Owned $dir $transferRoot;throw 'ST250_ANDROID_DOWNLOAD_UNAVAILABLE'}
  Write-Output 'ST250_ANDROID_DOWNLOAD_VERIFIED';return
}
Require ($SourceHead -match '^[a-f0-9]{40}$' -and $SigningToolingHead -match '^[a-f0-9]{40}$' -and $ToolsRun -match '^[1-9][0-9]*-[1-9][0-9]*$' -and $ApkRun -match '^[1-9][0-9]*-[1-9][0-9]*$' -and $ToolsImage -match '^sha256:[a-f0-9]{64}$')
Require ((Native 'git' @('-C',$PSScriptRoot,'rev-parse','HEAD')).Trim() -eq $SigningToolingHead)
$sourceHashes=@{}
foreach($name in @('sign-android.sh','android-release-receipt.mjs','android-transfer-receipt.mjs','image-import-binding.cjs')){
  [void](Native 'git' @('-C',$PSScriptRoot,'cat-file','-e',"${SigningToolingHead}:SubTrack/tools/sandbox/$name"))
  [void](Native 'git' @('-C',$PSScriptRoot,'diff','--quiet',$SigningToolingHead,'--',":(top)SubTrack/tools/sandbox/$name"))
  $sourceHashes[$name]=Sha (Join-Path $PSScriptRoot $name)
}
$remoteEnv="ST250_SOURCE_HEAD=$SourceHead ST250_SIGNING_TOOLING_HEAD=$SigningToolingHead ST250_ANDROID_TOOLS_RUN=$ToolsRun ST250_ANDROID_APK_RUN=$ApkRun SANDBOX_ANDROID_SIGNING_IMAGE=$ToolsImage ST250_SIGN_SOURCE_SHA256=$($sourceHashes['sign-android.sh']) ST250_RECEIPT_SOURCE_SHA256=$($sourceHashes['android-release-receipt.mjs']) ST250_TRANSFER_SOURCE_SHA256=$($sourceHashes['android-transfer-receipt.mjs']) ST250_IMPORT_SOURCE_SHA256=$($sourceHashes['image-import-binding.cjs'])"
function Sign-Remote([string]$Action,[string]$Extra=''){Require ($Action -in @('import-tools','preflight','initialize','restore-probe','backup-accept','sign'));Remote "env $remoteEnv $Extra bash $remoteRoot/tools/sandbox/sign-android.sh $Action"}
if($Mode -eq 'Stage'){
  [void](Remote "set -eu; test `"`$(id -u):`$(id -g)`" = 996:987; test -d $remoteRoot; test ! -L $remoteRoot; test `"`$(realpath -e $remoteRoot)`" = $remoteRoot; umask 077; mkdir -p $remoteRoot/staging/android $remoteRoot/staging/android-tools $remoteRoot/staging/android-restore; test ! -L $remoteRoot/staging; test ! -L $remoteRoot/staging/android; test ! -L $remoteRoot/staging/android-tools; test ! -L $remoteRoot/staging/android-restore; test ! -e $remoteRoot/staging/android/$ApkRun; test ! -e $remoteRoot/staging/android-tools/$ToolsRun; mkdir -m 700 $remoteRoot/staging/android/$ApkRun $remoteRoot/staging/android-tools/$ToolsRun")
  foreach($entry in @(@('apk',$ApkRun,'android','unsigned.apk'),@('tools',$ToolsRun,'android-tools','tools-image.tar.gz'))){
    $dir=Join-Path $transferRoot "$($entry[0])-$($entry[1])";Check-PrivateAcl $dir
    # Revalidate authenticated remote metadata and downloaded bytes before transfer.
    $verify=Join-Path $transferRoot ('verify-'+[Guid]::NewGuid().ToString('N'));New-PrivateDirectory $verify
    try{[void](Native 'node' @($module,'download',$entry[0],(Join-Path $dir 'receipt.json'),$verify));foreach($name in @('manifest.json','receipt.json',$entry[3])){Require ((Sha (Join-Path $verify $name)) -eq (Sha (Join-Path $dir $name)));Scp-Out (Join-Path $dir $name) "$remoteRoot/staging/$($entry[2])/$($entry[1])/$name"}}
    finally{Remove-Owned $verify $transferRoot}
  }
  foreach($name in @('sign-android.sh','android-release-receipt.mjs','android-transfer-receipt.mjs','image-import-binding.cjs')){
    $temporary="$remoteRoot/staging/android/$ApkRun/source-$name";$destination="$remoteRoot/tools/sandbox/$name";$expected=$sourceHashes[$name]
    Scp-Out (Join-Path $PSScriptRoot $name) $temporary
    [void](Remote "set -eu; test -d $remoteRoot/tools/sandbox; test ! -L $remoteRoot/tools/sandbox; test `"`$(realpath -e $remoteRoot/tools/sandbox)`" = $remoteRoot/tools/sandbox; test `"`$(sha256sum $temporary | cut -d' ' -f1)`" = $expected; if test -e $destination; then test -f $destination; test ! -L $destination; test `"`$(sha256sum $destination | cut -d' ' -f1)`" = $expected; else cp --no-clobber $temporary $destination; chmod 600 $destination; fi; test `"`$(sha256sum $destination | cut -d' ' -f1)`" = $expected; rm -- $temporary")
  }
  [void](Remote "set -eu; chmod 600 $remoteRoot/staging/android/$ApkRun/* $remoteRoot/staging/android-tools/$ToolsRun/*")
  [void](Sign-Remote 'import-tools');[void](Sign-Remote 'preflight');Write-Output 'ST250_ANDROID_VPS_STAGED';return
}
if($Mode -eq 'Initialize'){
  $initialized=Sign-Remote 'initialize';Require ($initialized -match 'ST250_ANDROID_SIGNER_INITIALIZED certificate=([a-f0-9]{64}) backup=pending')
  Write-Output "ST250_ANDROID_SIGNER_INITIALIZED certificate=$($Matches[1]) backup=pending";return
}
Require ($SignerCertificateSha256 -match '^[a-f0-9]{64}$')
$backupRoot=Join-Path $localRoot 'android-signing-backup';if(-not(Test-Path -LiteralPath $backupRoot)){New-PrivateDirectory $backupRoot}else{Check-PrivateAcl $backupRoot}
$backupDir=Join-Path $backupRoot $SignerCertificateSha256
if($Mode -eq 'Backup'){New-PrivateDirectory $backupDir}else{Check-PrivateAcl $backupDir}
$cipherFile=Join-Path $backupDir 'sandbox-signing.dpapi';$recordFile=Join-Path $backupDir 'backup-binding.json'
$temp=Join-Path $backupDir ('temporary-'+[Guid]::NewGuid().ToString('N'));New-PrivateDirectory $temp
$payload=$null;$keyBytes=$null;$passwordBytes=$null;$decoded=$null;$cipher=$null;$remoteRestore=$null;$ownedReturnRelease=$null;$ownedReturnTag=$null;$ownedReturnTarget=$null
function Pack([byte[]]$Key,[byte[]]$Password,[string]$Certificate){
  $memory=[IO.MemoryStream]::new();$writer=[IO.BinaryWriter]::new($memory)
  try{$writer.Write([Text.Encoding]::ASCII.GetBytes('ST250BK1'));$writer.Write([int]$Key.Length);$writer.Write($Key);$writer.Write([int]$Password.Length);$writer.Write($Password);$writer.Write([Text.Encoding]::ASCII.GetBytes($Certificate));$writer.Flush();return ,$memory.ToArray()}
  finally{Clear-Bytes $memory.GetBuffer();$writer.Dispose();$memory.Dispose()}
}
function Unpack([byte[]]$Bytes){
  Require ($Bytes.Length -le 131072);$memory=[IO.MemoryStream]::new($Bytes,$false);$reader=[IO.BinaryReader]::new($memory)
  $k=$null;$p=$null
  try{Require ([Text.Encoding]::ASCII.GetString($reader.ReadBytes(8)) -eq 'ST250BK1');$n=$reader.ReadInt32();Require ($n -gt 0 -and $n -le 65536);$k=$reader.ReadBytes($n);Require ($k.Length -eq $n);$n=$reader.ReadInt32();Require ($n -gt 0 -and $n -le 1024);$p=$reader.ReadBytes($n);Require ($p.Length -eq $n);$c=[Text.Encoding]::ASCII.GetString($reader.ReadBytes(64));Require ($c -eq $SignerCertificateSha256 -and $memory.Position -eq $memory.Length);return @{Key=$k;Password=$p}}
  catch{Clear-Bytes $k;Clear-Bytes $p;throw 'ST250_ANDROID_BACKUP_PAYLOAD_UNAVAILABLE'}
  finally{$reader.Dispose();$memory.Dispose()}
}
try{
  if($Mode -eq 'Backup'){
    [void](Sign-Remote 'preflight')
    Scp-In "$remoteRoot/android-signing/identity.json" (Join-Path $temp 'identity.json')
    [void](Native 'node' @($module,'validate-identity',(Join-Path $temp 'identity.json')))
    $identity=Get-Content -LiteralPath (Join-Path $temp 'identity.json') -Raw|ConvertFrom-Json
    Require ($identity.schema -eq 'st250-android-signer-identity-v1' -and $identity.signerCertificateSha256 -eq $SignerCertificateSha256 -and $identity.alias -eq 'subtrack-sandbox')
    foreach($name in @('sandbox-signing.p12','password')){Scp-In "$remoteRoot/android-signing/$name" (Join-Path $temp $name)}
    $keyBytes=[IO.File]::ReadAllBytes((Join-Path $temp 'sandbox-signing.p12'));$passwordBytes=[IO.File]::ReadAllBytes((Join-Path $temp 'password'))
    Require ($keyBytes.Length -gt 0 -and $keyBytes.Length -le 65536 -and $passwordBytes.Length -eq 65)
    $payload=Pack $keyBytes $passwordBytes $SignerCertificateSha256
    $cipher=[Security.Cryptography.ProtectedData]::Protect($payload,$context,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    Require ($cipher.Length -le 131072);Write-Private $cipherFile $cipher
    Clear-Bytes $cipher;$cipher=[IO.File]::ReadAllBytes($cipherFile)
    $decoded=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$context,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    Require ($decoded.Length -eq $payload.Length);$different=0;for($index=0;$index -lt $decoded.Length;$index++){$different=$different -bor ($decoded[$index] -bxor $payload[$index])};Require ($different -eq 0)
  }else{
    Check-PrivateAcl $cipherFile;Check-PrivateAcl $recordFile
    [void](Native 'node' @($module,'validate-backup',$recordFile))
    $record=Get-Content -LiteralPath $recordFile -Raw|ConvertFrom-Json
    Require ($record.schema -eq 'st250-android-signer-backup-v1' -and $record.signerCertificateSha256 -eq $SignerCertificateSha256 -and $record.ciphertextSha256 -eq (Sha $cipherFile) -and $record.ciphertextBytes -eq (Get-Item -LiteralPath $cipherFile).Length -and $record.backupConfirmed -eq $true -and $record.signingRestoreVerified -eq $true)
    $cipher=[IO.File]::ReadAllBytes($cipherFile);Require ($cipher.Length -le 131072)
    $decoded=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$context,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  }
  Clear-Bytes $keyBytes;Clear-Bytes $passwordBytes
  $restored=Unpack $decoded;$keyBytes=$restored.Key;$passwordBytes=$restored.Password
  if($Mode -in @('Backup','VerifyBackup')){
    # For Backup these files already exist; remove only freshly owned plaintext copies.
    foreach($name in @('sandbox-signing.p12','password')){if(Test-Path -LiteralPath (Join-Path $temp $name)){Remove-Owned (Join-Path $temp $name) $temp}}
    Write-Private (Join-Path $temp 'sandbox-signing.p12') $keyBytes;Write-Private (Join-Path $temp 'password') $passwordBytes
    $restoreId=[Guid]::NewGuid().ToString('N');$remoteRestore="$remoteRoot/staging/android-restore/$restoreId"
    [void](Remote "set -eu; umask 077; test -d $remoteRoot/staging/android-restore; test ! -L $remoteRoot/staging/android-restore; test ! -e $remoteRestore; mkdir -m 700 $remoteRestore")
    Scp-Out (Join-Path $temp 'sandbox-signing.p12') "$remoteRestore/sandbox-signing.p12";Scp-Out (Join-Path $temp 'password') "$remoteRestore/password"
    [void](Remote "chmod 600 $remoteRestore/sandbox-signing.p12 $remoteRestore/password")
    $probe=Sign-Remote 'restore-probe' "ST250_RESTORE_ID=$restoreId"
    Require ($probe -match "ST250_ANDROID_RESTORE_PROBE_PASS certificate=$SignerCertificateSha256")
    Remove-Owned $temp $backupDir
    $record=[ordered]@{schema='st250-android-signer-backup-v1';signerCertificateSha256=$SignerCertificateSha256;ciphertextSha256=(Sha $cipherFile);ciphertextBytes=(Get-Item -LiteralPath $cipherFile).Length;protection='windows-dpapi-current-user';backupGeneration=1;decryptVerified=$true;signingRestoreVerified=$true;temporaryCustodyRemoved=$true;backupConfirmed=$true}
    if($Mode -eq 'Backup'){
      [void](Sign-Remote 'backup-accept' "ST250_RESTORE_ID=$restoreId ST250_BACKUP_CIPHERTEXT_SHA256=$($record.ciphertextSha256) ST250_BACKUP_CIPHERTEXT_BYTES=$($record.ciphertextBytes)")
      Write-Private $recordFile ([Text.Encoding]::UTF8.GetBytes(($record|ConvertTo-Json -Compress)))
    }else{[void](Remote "set -eu; test -f $remoteRoot/android-signing/restore-$restoreId.done; test ! -L $remoteRoot/android-signing/restore-$restoreId.done; rm -- $remoteRoot/android-signing/restore-$restoreId.done")}
    Write-Output "ST250_ANDROID_BACKUP_VERIFIED certificate=$SignerCertificateSha256";return
  }
  if($Mode -eq 'Sign'){
    Remove-Owned $temp $backupDir
    [void](Sign-Remote 'sign' "ST250_BACKUP_CIPHERTEXT_SHA256=$(Sha $cipherFile)")
    Write-Output 'ST250_ANDROID_SIGNED_PREPARATION_HELD';return
  }
  if($Mode -eq 'ReturnSigned'){
    Require $FreeDraftConfirmed.IsPresent
    [void](Remote "set -eu; d=$remoteRoot/staging/android-signed/$ApkRun; test -d `"`$d`"; test ! -L `"`$d`"; test `"`$(realpath -e `"`$d`")`" = $remoteRoot/staging/android-signed/$ApkRun; test `"`$(stat -c '%a:%u:%g' `"`$d`")`" = 700:996:987; for n in signed.apk pending.json; do test -f `"`$d/`$n`"; test ! -L `"`$d/`$n`"; test `"`$(stat -c '%a:%u:%g' `"`$d/`$n`")`" = 600:996:987; done; test `"`$(stat -c '%s' `"`$d/signed.apk`")`" -le 209715200; test `"`$(stat -c '%s' `"`$d/pending.json`")`" -le 16384")
    $returnDir=Join-Path $transferRoot "signed-$ApkRun";New-PrivateDirectory $returnDir
    $signedName="subtrack-sandbox-signed-$SourceHead.apk";$pendingName="st250-android-signed-$SourceHead.json"
    Scp-In "$remoteRoot/staging/android-signed/$ApkRun/signed.apk" (Join-Path $returnDir $signedName)
    Scp-In "$remoteRoot/staging/android-signed/$ApkRun/pending.json" (Join-Path $returnDir $pendingName)
    $pending=Get-Content -LiteralPath (Join-Path $returnDir $pendingName) -Raw|ConvertFrom-Json
    Require (($pending.schema -eq 'st250-android-signed-pending-v1' -or $pending.schema -eq 'st250-android-signed-pending-v2') -and $pending.sourceHead -eq $SourceHead -and $pending.signerCertificateSha256 -eq $SignerCertificateSha256 -and $pending.signedSha256 -eq (Sha (Join-Path $returnDir $signedName)) )
    $receipt=Get-Content -LiteralPath (Join-Path $transferRoot "apk-$ApkRun/receipt.json") -Raw|ConvertFrom-Json
    Require ($pending.unsignedSha256 -eq $receipt.unsignedSha256)
    [void](Native 'node' @($module,'validate-pending',(Join-Path $returnDir $pendingName),(Join-Path $transferRoot "apk-$ApkRun/manifest.json"),$SignerCertificateSha256,(Join-Path $returnDir $signedName),(Join-Path $transferRoot "apk-$ApkRun/unsigned.apk")))
    # Owned VPS return copy is removed after verified desktop receipt; signer persists.
    [void](Remote "set -eu; d=$remoteRoot/staging/android-signed/$ApkRun; test ! -L `"`$d`"; test `"`$(realpath -e `"`$d`")`" = $remoteRoot/staging/android-signed/$ApkRun; test `"`$(sha256sum `"`$d/signed.apk`" | cut -d' ' -f1)`" = $($pending.signedSha256); rm -- `"`$d/signed.apk`" `"`$d/pending.json`"; rmdir `"`$d`"; test ! -e `"`$d`"")
    $tag="st250-android-signed-stage-$SourceHead-$ApkRun"
    # Collision is refused; this command never publishes or overwrites a draft.
    foreach($endpoint in @("repos/achkum/Applied-AI-Projects/releases/tags/$tag","repos/achkum/Applied-AI-Projects/git/ref/tags/$tag")){
      $collision=& gh api $endpoint 2>&1;Require ($LASTEXITCODE -ne 0 -and ($collision -join "`n") -match 'HTTP 404')
    }
    $bodyFile=Join-Path $temp 'return-release.json'
    Write-Private $bodyFile ([Text.Encoding]::UTF8.GetBytes((@{tag_name=$tag;target_commitish=$receipt.defaultTargetHead;draft=$true;prerelease=$true;make_latest='false';name=$tag;body='Private signed testing candidate return; runtime measured; manifest unverified; retention <=7days; never publish.'}|ConvertTo-Json -Compress)))
    $created=Native 'gh' @('api','repos/achkum/Applied-AI-Projects/releases','--method','POST','--input',$bodyFile)|ConvertFrom-Json
    Require ($created.id -gt 0 -and $created.draft -eq $true -and $created.tag_name -eq $tag)
    $ownedReturnRelease=$created.id;$ownedReturnTag=$tag;$ownedReturnTarget=$receipt.defaultTargetHead
    foreach($entry in @(@($signedName,'application/vnd.android.package-archive'),@($pendingName,'application/json'))){
      [void](Native 'gh' @('api',"https://uploads.github.com/repos/achkum/Applied-AI-Projects/releases/$ownedReturnRelease/assets?name=$($entry[0])",'--method','POST','--header',"Content-Type: $($entry[1])",'--input',(Join-Path $returnDir $entry[0])))
    }
    $remote=Native 'gh' @('api',"repos/achkum/Applied-AI-Projects/releases/tags/$tag")|ConvertFrom-Json
    Require ($remote.draft -eq $true -and $remote.prerelease -eq $true -and $remote.target_commitish -eq $receipt.defaultTargetHead -and $remote.assets.Count -eq 2)
    foreach($name in @($signedName,$pendingName)){$a=@($remote.assets|Where-Object name -eq $name);Require ($a.Count -eq 1 -and $a[0].state -eq 'uploaded' -and $a[0].size -eq (Get-Item -LiteralPath (Join-Path $returnDir $name)).Length -and $a[0].digest -eq "sha256:$(Sha (Join-Path $returnDir $name))")}
    $releaseId=$remote.id;Remove-Owned $returnDir $transferRoot;Remove-Owned $temp $backupDir;$ownedReturnRelease=$null
    Write-Output "ST250_ANDROID_SIGNED_RETURN_DRAFT releaseId=$releaseId manifest=unverified runtime=measured";return
  }
}catch{
  if($null -ne $ownedReturnRelease){
    $owned=Native 'gh' @('api',"repos/achkum/Applied-AI-Projects/releases/$ownedReturnRelease")|ConvertFrom-Json
    Require ($owned.draft -eq $true -and $owned.tag_name -eq $ownedReturnTag -and $owned.target_commitish -eq $ownedReturnTarget)
    foreach($asset in $owned.assets){Require ($asset.name -in @("subtrack-sandbox-signed-$SourceHead.apk","st250-android-signed-$SourceHead.json"))}
    [void](Native 'gh' @('api',"repos/achkum/Applied-AI-Projects/releases/$ownedReturnRelease",'--method','DELETE'))
    $absence=& gh api "repos/achkum/Applied-AI-Projects/releases/$ownedReturnRelease" 2>&1;Require ($LASTEXITCODE -ne 0 -and ($absence -join "`n") -match 'HTTP 404')
  }
  throw 'ST250_ANDROID_DESKTOP_CUSTODY_UNAVAILABLE'
}
finally{
  foreach($bytes in @($payload,$keyBytes,$passwordBytes,$decoded,$cipher)){if($null -ne $bytes){Clear-Bytes $bytes}}
  if(Test-Path -LiteralPath $temp){Remove-Owned $temp $backupDir}
  if($null -ne $remoteRestore){
    [void](Remote "set -eu; d=$remoteRestore; if test -e `"`$d`"; then test ! -L `"`$d`"; test `"`$(realpath -e `"`$d`")`" = $remoteRestore; test `"`$(stat -c '%a:%u:%g' `"`$d`")`" = 700:996:987; for n in sandbox-signing.p12 password; do if test -e `"`$d/`$n`"; then test -f `"`$d/`$n`"; test ! -L `"`$d/`$n`"; rm -- `"`$d/`$n`"; fi; done; rmdir `"`$d`"; fi; test ! -e `"`$d`"")
  }
}

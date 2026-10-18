[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('QualifyPublic','SignReserved')][string]$Mode,
  [Parameter(Mandatory)][string]$PublicToolsDirectory,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$PublicToolsReceiptSha256,
  [Parameter(Mandatory)][string]$OutputDirectory,
  [string]$QualificationFile,
  [string]$CommandFile,
  [string]$ManifestFile,
  [string]$UnsignedApk,
  [string]$PrimaryCheckout
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(-not $IsWindows -or [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne [Runtime.InteropServices.Architecture]::X64){throw 'ST253_ANDROID_LOCAL_WINDOWS_REQUIRED'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid=[Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$context=[Text.Encoding]::UTF8.GetBytes('st250-android-signer-backup-v1/current-user')
$certificate='10c659cae262ad807ae2da9a9c137b581c633ebef2ea3bce86bfe6c41052186c'
$jarPin='3716d9311e55d2b0918a2fd9d54ba9e406c5f6abeea700b287f11259bc163dec'
$jdkPin='e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0'
$receiptModule=Join-Path $PSScriptRoot 'android-local-signing-receipt.mjs'
$transferModule=Join-Path $PSScriptRoot 'android-transfer-receipt.mjs'
function Require([bool]$Condition){if(-not $Condition){throw 'ST253_ANDROID_LOCAL_CUSTODY_UNAVAILABLE'}}
function Clear-Bytes([byte[]]$Bytes){if($null -ne $Bytes){[Array]::Clear($Bytes,0,$Bytes.Length)}}
function Sha([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Json-Bytes($Value){[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 40 -Compress))}
function No-Reparse([string]$Path){
  $current=[IO.Path]::GetFullPath($Path)
  while($current){
    if(Test-Path -LiteralPath $current){$item=Get-Item -LiteralPath $current -Force;Require (($item.Attributes -band [IO.FileAttributes]::ReparsePoint)-eq 0)}
    $parent=[IO.Path]::GetDirectoryName($current);if($parent -eq $current){break};$current=$parent
  }
}
function Check-PrivateAcl([string]$Path){
  No-Reparse $Path;$acl=Get-Acl -LiteralPath $Path
  Require ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid.Value -and $acl.AreAccessRulesProtected)
  $rules=$acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]);Require ($rules.Count -eq 2)
  foreach($rule in $rules){Require (-not $rule.IsInherited -and $rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -in @($sid.Value,$systemSid.Value) -and $rule.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl)}
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
  Set-Acl -LiteralPath $Path -AclObject $acl;Check-PrivateAcl $Path
}
function New-PrivateDirectory([string]$Path){Require (-not(Test-Path -LiteralPath $Path));No-Reparse $Path;[void][IO.Directory]::CreateDirectory($Path);Set-PrivateAcl $Path $true}
function Write-Private([string]$Path,[byte[]]$Bytes){
  Require (-not(Test-Path -LiteralPath $Path));No-Reparse $Path
  $stream=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  Set-PrivateAcl $Path $false
}
function Read-Small([string]$Path,[int]$Limit=65536){
  No-Reparse $Path;$item=Get-Item -LiteralPath $Path -Force
  Require (-not $item.PSIsContainer -and $item.Length -gt 0 -and $item.Length -le $Limit)
  return [IO.File]::ReadAllText($item.FullName,[Text.Encoding]::UTF8)
}
function Check-Environment {
  foreach($name in @('NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_REDIRECT_WARNINGS','JAVA_TOOL_OPTIONS','_JAVA_OPTIONS','JDK_JAVA_OPTIONS','CLASSPATH','OPENSSL_CONF','OPENSSL_MODULES','SSL_CERT_FILE','SSL_CERT_DIR','LD_PRELOAD','DYLD_INSERT_LIBRARIES','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_REPLACE_REF_BASE','GIT_CONFIG_COUNT','GIT_CONFIG_PARAMETERS')){
    Require ($null -eq [Environment]::GetEnvironmentVariable($name))
  }
}
function Resolve-Executable([string]$Name){
  $selected=Get-Command $Name -CommandType Application -ErrorAction Stop|Select-Object -First 1
  Require ($null -ne $selected -and [IO.Path]::IsPathFullyQualified($selected.Source) -and [IO.Path]::GetExtension($selected.Source) -ieq '.exe')
  No-Reparse $selected.Source;return $selected.Source
}
# Both pipes are drained concurrently into bounded buffers. Overflow/timeout kills
# the owned process tree; arbitrary native output never reaches the console.
if(-not ('ST253.LocalBoundedProcess' -as [type])){
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
namespace ST253 {
 public static class LocalBoundedProcess {
  public sealed class ClosedFailure:Exception {
   public string Category {get;}
   public ClosedFailure(string category):base("ST253_ANDROID_LOCAL_PROCESS_UNAVAILABLE category="+category){Category=category;}
  }
  public static string ExitCategory(byte[] bytes) {
   string text;try{text=new System.Text.UTF8Encoding(false,true).GetString(bytes??Array.Empty<byte>());}catch{return "OUTPUT_ENCODING";}
   // Recognize fixed public diagnostics from the pinned apksigner/JDK only;
   // filenames, option values, aliases and password text never leave this method.
   if(System.Text.RegularExpressions.Regex.IsMatch(text,@"(?im)(?:^|\b)(?:java\.lang\.)?(?:NoClassDefFoundError|ClassNotFoundException|UnsatisfiedLinkError|UnsupportedClassVersionError)\b|^Error: (?:Could not create the Java Virtual Machine|Unable to access jarfile|Could not find or load main class)"))return "JAVA_DEPENDENCY";
   if(System.Text.RegularExpressions.Regex.IsMatch(text,@"(?im)^(?:Unsupported (?:option|command|value)|Missing input APK|com\.android\.apksigner\.(?:ParameterException|OptionsParser\$OptionsException))\b"))return "ARGUMENT";
   if(System.Text.RegularExpressions.Regex.IsMatch(text,@"(?im)^Failed to load signer |^Failed to obtain key with alias |(?:java\.security\.(?:UnrecoverableKeyException|KeyStoreException|InvalidKeyException))\b|^No (?:keystore passwords|key passwords|passwords)\b"))return "KEYSTORE";
   if(System.Text.RegularExpressions.Regex.IsMatch(text,@"(?im)(?:com\.android\.apksig\.apk\.(?:ApkFormatException|MinSdkVersionException))\b|^Failed to determine APK's minimum supported platform version\b|^Malformed Android binary resource\b"))return "MANIFEST";
   if(System.Text.RegularExpressions.Regex.IsMatch(text,@"(?im)(?:java\.io\.(?:FileNotFoundException|IOException)|java\.nio\.file\.(?:AccessDeniedException|NoSuchFileException))\b"))return "IO";
   return "EXIT_NONZERO";
  }
  static async Task<byte[]> Drain(Stream stream, int limit, Process process) {
   using var target=new MemoryStream(); var block=new byte[4096];
   try { int count; while((count=await stream.ReadAsync(block,0,block.Length))!=0) {
    if(target.Length+count>limit) { try {process.Kill(true);} catch {} throw new ClosedFailure("OUTPUT_LIMIT"); }
    target.Write(block,0,count);
   } return target.ToArray(); } finally {Array.Clear(block,0,block.Length);var backing=target.GetBuffer();Array.Clear(backing,0,backing.Length);}
  }
  public static string Run(string executable,string[] arguments,string cwd,byte[] input,int timeout) {
   using var process=new Process(); var start=process.StartInfo;
   start.FileName=executable;start.UseShellExecute=false;start.CreateNoWindow=true;
   start.WorkingDirectory=cwd;start.RedirectStandardOutput=true;start.RedirectStandardError=true;start.RedirectStandardInput=true;
   foreach(var argument in arguments)start.ArgumentList.Add(argument);
   byte[] output=null,error=null; bool started=false;
   try {
    if(!process.Start())throw new ClosedFailure("SPAWN");started=true;
    var stdout=Drain(process.StandardOutput.BaseStream,1048576,process);
    var stderr=Drain(process.StandardError.BaseStream,1048576,process);
    using var cancellation=new CancellationTokenSource(timeout);
    var writer=Task.Run(async ()=>{if(input!=null)await process.StandardInput.BaseStream.WriteAsync(input.AsMemory(),cancellation.Token);process.StandardInput.Close();});
    process.WaitForExitAsync(cancellation.Token).GetAwaiter().GetResult();
    writer.WaitAsync(cancellation.Token).GetAwaiter().GetResult();
    output=stdout.WaitAsync(cancellation.Token).GetAwaiter().GetResult();error=stderr.WaitAsync(cancellation.Token).GetAwaiter().GetResult();
    if(process.ExitCode!=0)throw new ClosedFailure(ExitCategory(error));
    return new System.Text.UTF8Encoding(false,true).GetString(output);
   } catch(Exception problem) {
    try {if(started&&!process.HasExited){process.Kill(true);if(!process.WaitForExit(10000))throw new Exception("TERMINATION");}}catch {throw new Exception("ST253_ANDROID_LOCAL_TERMINATION_UNCERTAIN");}
    string category=problem is ClosedFailure closed?closed.Category:!started?"SPAWN":problem is OperationCanceledException?"TIMEOUT":problem is System.Text.DecoderFallbackException?"OUTPUT_ENCODING":problem is IOException?"IO":"OTHER";
    throw new ClosedFailure(category);
   } finally {if(output!=null)Array.Clear(output,0,output.Length);if(error!=null)Array.Clear(error,0,error.Length);}
  }
 }
}
'@
}
function Native([string]$Program,[string[]]$Arguments,[byte[]]$InputBytes=$null,[int]$Timeout=120000){
  Check-Environment;No-Reparse $Program
  $stage='OTHER'
  if([IO.Path]::GetFileName($Program) -ieq 'node.exe'){$stage='RECEIPT_VALIDATION'}
  elseif([IO.Path]::GetFileName($Program) -ieq 'keytool.exe'){$stage=if($Arguments -ccontains '-genkeypair'){'DISPOSABLE_KEY'}elseif($Arguments -ccontains '-exportcert'){'CERTIFICATE_EXPORT'}else{'KEY_IDENTITY'}}
  elseif([IO.Path]::GetFileName($Program) -ieq 'java.exe'){$stage=if($Arguments -ccontains 'sign'){'SIGN'}elseif($Arguments -ccontains 'verify'){'VERIFY'}else{'JAVA'}}
  elseif([IO.Path]::GetFileName($Program) -ieq 'ssh.exe'){$stage='RESERVATION'}
  elseif([IO.Path]::GetFileName($Program) -ieq 'git.exe'){$stage='EXECUTION_SOURCE'}
  try{return [ST253.LocalBoundedProcess]::Run($Program,$Arguments,$script:privateCwd,$InputBytes,$Timeout)}
  catch{
    $category='OTHER';$uncertain=$false;$failure=$_.Exception
    while($null -ne $failure){
      if($failure.Message -ceq 'ST253_ANDROID_LOCAL_TERMINATION_UNCERTAIN'){$uncertain=$true}
      if($failure.Message -cmatch '^ST253_ANDROID_LOCAL_PROCESS_UNAVAILABLE category=(SPAWN|TIMEOUT|OUTPUT_LIMIT|OUTPUT_ENCODING|ARGUMENT|MANIFEST|KEYSTORE|JAVA_DEPENDENCY|IO|EXIT_NONZERO|OTHER)$'){$category=$Matches[1]}
      $failure=$failure.InnerException
    }
    if($uncertain){throw "ST253_ANDROID_LOCAL_TERMINATION_UNCERTAIN stage=$stage"}
    throw "ST253_ANDROID_LOCAL_PROCESS_UNAVAILABLE stage=$stage category=$category"
  }
}
function Validate-Record([string]$Kind,[string[]]$Files){
  # Paths/public hashes are argv; capabilities never are.
  Require ($Kind -cin @('public','qualification','execution'))
  $verb=if($Kind -ceq 'public'){'public-tools'}else{$Kind}
  [void](Native $script:node (@($receiptModule,$verb)+$Files))
}
function Check-ExecutionSource($Binding){
  Require ($Binding.executionHead -cmatch '^[a-f0-9]{40}$')
  $git=Resolve-Executable 'git'
  $head=(Native $git @('-C',$PSScriptRoot,'--no-replace-objects','rev-parse','HEAD')).Trim();Require ($head -ceq $Binding.executionHead)
  $root=(Native $git @('-C',$PSScriptRoot,'--no-replace-objects','rev-parse','--show-toplevel')).Trim();No-Reparse $root
  $names=@{'reservation'='android-local-signing-reservation.mjs';'receipt'='android-local-signing-receipt.mjs';'transfer'='android-transfer-receipt.mjs';'release'='android-release-receipt.mjs';'import'='image-import-binding.cjs';'signer'='sign-android.sh'}
  foreach($name in @($names.Values)+@('sign-android-local-recovery.ps1')){
    $file=Join-Path $PSScriptRoot $name;No-Reparse $file
    $relative=[IO.Path]::GetRelativePath($root,$file).Replace([IO.Path]::DirectorySeparatorChar,'/')
    Require (-not $relative.StartsWith('../'))
    $actual=(Native $git @('-C',$root,'--no-replace-objects','hash-object','--no-filters','--',$file)).Trim()
    $expected=(Native $git @('-C',$root,'--no-replace-objects','rev-parse',"${head}:$relative")).Trim();Require ($actual -ceq $expected)
  }
  foreach($key in $names.Keys){Require ((Sha (Join-Path $PSScriptRoot $names[$key])) -ceq $Binding.selection.sourceHashes[$key])}
}
function Qualify-Tools {
  $script:publicRoot=[IO.Path]::GetFullPath($PublicToolsDirectory);No-Reparse $script:publicRoot
  $script:publicRecord=Join-Path $script:publicRoot 'public-tools.json';Require ((Sha $script:publicRecord) -ceq $PublicToolsReceiptSha256)
  Validate-Record 'public' @($script:publicRecord,$PublicToolsReceiptSha256)
  $script:portfolio=(Read-Small $script:publicRecord)|ConvertFrom-Json -AsHashtable
  Require ($script:portfolio.jdkArchiveSha256 -ceq $jdkPin -and $script:portfolio.apksignerJarSha256 -ceq $jarPin)
  $script:jdk=Join-Path $script:publicRoot $script:portfolio.jdkRoot;No-Reparse $script:jdk
  $found=@{}
  foreach($file in Get-ChildItem -LiteralPath $script:jdk -Recurse -Force){
    No-Reparse $file.FullName
    if($file.PSIsContainer){continue}
    $relative=[IO.Path]::GetRelativePath($script:jdk,$file.FullName).Replace([IO.Path]::DirectorySeparatorChar,'/')
    Require ($script:portfolio.jdkFiles.ContainsKey($relative) -and -not $found.ContainsKey($relative))
    $expected=$script:portfolio.jdkFiles[$relative];Require ($file.Length -eq $expected.bytes -and (Sha $file.FullName) -ceq $expected.sha256);$found[$relative]=$true
  }
  Require ($found.Count -eq 492 -and $found.Count -eq $script:portfolio.jdkFiles.Count)
  $script:jar=Join-Path $script:publicRoot 'apksigner.jar';Require ((Sha $script:jar) -ceq $jarPin)
  $script:java=Join-Path $script:jdk 'bin/java.exe';$script:keytool=Join-Path $script:jdk 'bin/keytool.exe'
}
function Remove-SecretCustody([string]$Path,[string]$Parent){
  $absolute=[IO.Path]::GetFullPath($Path);$parentPath=[IO.Path]::GetFullPath($Parent)
  Require ([IO.Path]::GetDirectoryName($absolute) -ceq $parentPath);No-Reparse $absolute;Check-PrivateAcl $absolute
  # No recursive removal: the exact owned leaf roster is inspected first.
  $allowed=@('synthetic.p12','password','certificate.der','synthetic-unsigned.apk','synthetic-signed.apk','sandbox-signing.p12')
  foreach($file in Get-ChildItem -LiteralPath $absolute -Force){Require (-not $file.PSIsContainer -and $file.Name -cin $allowed);Check-PrivateAcl $file.FullName}
  foreach($file in Get-ChildItem -LiteralPath $absolute -Force){Remove-Item -LiteralPath $file.FullName -Force}
  Require (@(Get-ChildItem -LiteralPath $absolute -Force).Count -eq 0);Remove-Item -LiteralPath $absolute -Force
  Require (-not(Test-Path -LiteralPath $absolute))
}
function Sign-And-Verify([string]$Key,[string]$Password,[string]$Unsigned,[string]$Signed,[string]$ExpectedCertificate){
  # SignerParams reuses the store password for the key when --key-pass is omitted.
  # PasswordRetriever reads repeated references to one file as successive lines.
  [void](Native $script:java @('-Xms16m','-Xmx256m','-jar',$script:jar,'sign','--ks',$Key,'--ks-type','PKCS12','--ks-key-alias','subtrack-sandbox','--ks-pass',"file:$Password",'--min-sdk-version','24','--v4-signing-enabled','false','--out',$Signed,$Unsigned))
  Set-PrivateAcl $Signed $false
  $verified=Native $script:java @('-Xms16m','-Xmx256m','-jar',$script:jar,'verify','--min-sdk-version','24','--verbose','--print-certs',$Signed)
  $certs=[regex]::Matches($verified,'(?m)^Signer #[0-9]+ certificate SHA-256 digest: ([a-f0-9]{64})\r?$')
  Require ($certs.Count -eq 1 -and $certs[0].Groups[1].Value -ceq $ExpectedCertificate)
  Require ($verified -match '(?m)^Number of signers: 1\r?$' -and $verified -match '(?m)^Verified using v2 scheme .*: true\r?$')
}
function New-SyntheticManifest {
  # Minimal Android binary XML, rather than text pretending to be an APK
  # manifest. Only a disposable package attribute exists; this is not an app.
  $strings=@('manifest','package','se.subtrack.disposable.qualification')
  $pool=[IO.MemoryStream]::new();$poolWriter=[IO.BinaryWriter]::new($pool);$offsets=[Collections.Generic.List[uint32]]::new()
  try{
    foreach($value in $strings){$offsets.Add([uint32]$pool.Position);$utf8=[Text.Encoding]::UTF8.GetBytes($value);$poolWriter.Write([byte]$value.Length);$poolWriter.Write([byte]$utf8.Length);$poolWriter.Write($utf8);$poolWriter.Write([byte]0)}
    while($pool.Position%4){$poolWriter.Write([byte]0)};$poolWriter.Flush();$stringBytes=$pool.ToArray()
  }finally{$poolWriter.Dispose();$pool.Dispose()}
  $stream=[IO.MemoryStream]::new();$writer=[IO.BinaryWriter]::new($stream)
  try{
    $poolSize=[uint32](28+4*$strings.Count+$stringBytes.Length)
    $writer.Write([uint16]3);$writer.Write([uint16]8);$writer.Write([uint32](8+$poolSize+56+24))
    $writer.Write([uint16]1);$writer.Write([uint16]28);$writer.Write($poolSize);$writer.Write([uint32]$strings.Count);$writer.Write([uint32]0);$writer.Write([uint32]256);$writer.Write([uint32](28+4*$strings.Count));$writer.Write([uint32]0)
    foreach($offset in $offsets){$writer.Write($offset)};$writer.Write($stringBytes)
    $writer.Write([uint16]258);$writer.Write([uint16]16);$writer.Write([uint32]56);$writer.Write([uint32]1);$writer.Write([uint32]::MaxValue)
    $writer.Write([uint32]::MaxValue);$writer.Write([uint32]0);$writer.Write([uint16]20);$writer.Write([uint16]20);$writer.Write([uint16]1);$writer.Write([uint16]0);$writer.Write([uint16]0);$writer.Write([uint16]0)
    $writer.Write([uint32]::MaxValue);$writer.Write([uint32]1);$writer.Write([uint32]2);$writer.Write([uint16]8);$writer.Write([byte]0);$writer.Write([byte]3);$writer.Write([uint32]2)
    $writer.Write([uint16]259);$writer.Write([uint16]16);$writer.Write([uint32]24);$writer.Write([uint32]1);$writer.Write([uint32]::MaxValue);$writer.Write([uint32]::MaxValue);$writer.Write([uint32]0);$writer.Flush()
    return ,$stream.ToArray()
  }finally{$writer.Dispose();$stream.Dispose()}
}
function Remote-Command([string]$Verb,$Value){
  Require ($Verb -cin @('observe','begin-attempt','record-local'))
  $bytes=Json-Bytes $Value;Require ($bytes.Length -le 65536)
  try{$text=Native $script:ssh @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3','openclaw@198.44.116.159',"umask 077; node /home/openclaw/subtrack-sandbox/tools/sandbox/android-local-signing-reservation.mjs $Verb") $bytes;Require ($text.Length -le 65536);return $text|ConvertFrom-Json -AsHashtable}finally{Clear-Bytes $bytes}
}
function Unpack([byte[]]$Bytes){
  Require ($Bytes.Length -le 131072);$memory=[IO.MemoryStream]::new($Bytes,$false);$reader=[IO.BinaryReader]::new($memory)
  $k=$null;$p=$null
  try{Require ([Text.Encoding]::ASCII.GetString($reader.ReadBytes(8)) -eq 'ST250BK1');$n=$reader.ReadInt32();Require ($n -gt 0 -and $n -le 65536);$k=$reader.ReadBytes($n);Require ($k.Length -eq $n);$n=$reader.ReadInt32();Require ($n -gt 0 -and $n -le 1024);$p=$reader.ReadBytes($n);Require ($p.Length -eq $n);$c=[Text.Encoding]::ASCII.GetString($reader.ReadBytes(64));Require ($c -eq $certificate -and $memory.Position -eq $memory.Length);return @{Key=$k;Password=$p}}
  catch{Clear-Bytes $k;Clear-Bytes $p;throw 'ST253_ANDROID_LOCAL_BACKUP_PAYLOAD_UNAVAILABLE'}
  finally{$reader.Dispose();$memory.Dispose()}
}
Check-Environment
$script:node=Resolve-Executable 'node'
$output=[IO.Path]::GetFullPath($OutputDirectory);New-PrivateDirectory $output;$script:privateCwd=$output
$secret=Join-Path $output ('custody-'+[Guid]::NewGuid().ToString('N'));New-PrivateDirectory $secret
$buffers=[Collections.Generic.List[byte[]]]::new();$cleanup=$false;$ready=$false;$result=$null
try{
  Qualify-Tools
  if($Mode -eq 'QualifyPublic'){
    $password=[Text.Encoding]::ASCII.GetBytes(([Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))).ToLowerInvariant()+"`n");$buffers.Add($password)
    $passwordFile=Join-Path $secret 'password';Write-Private $passwordFile $password
    $key=Join-Path $secret 'synthetic.p12';$der=Join-Path $secret 'certificate.der'
    [void](Native $script:keytool @('-J-Xms16m','-J-Xmx128m','-genkeypair','-alias','subtrack-sandbox','-keyalg','RSA','-keysize','3072','-sigalg','SHA256withRSA','-validity','1','-dname','CN=Disposable SubTrack qualification','-storetype','PKCS12','-keystore',$key,'-storepass:file',$passwordFile,'-keypass:file',$passwordFile,'-noprompt'))
    Set-PrivateAcl $key $false
    [void](Native $script:keytool @('-exportcert','-alias','subtrack-sandbox','-keystore',$key,'-storetype','PKCS12','-storepass:file',$passwordFile,'-file',$der));Set-PrivateAcl $der $false
    $unsigned=Join-Path $secret 'synthetic-unsigned.apk';$signed=Join-Path $secret 'synthetic-signed.apk'
    $stream=[IO.FileStream]::new($unsigned,[IO.FileMode]::CreateNew);try{$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$true);try{foreach($name in @('AndroidManifest.xml','qualification.txt')){$entry=$zip.CreateEntry($name);$entryStream=$entry.Open();try{$content=if($name -ceq 'AndroidManifest.xml'){New-SyntheticManifest}else{[Text.Encoding]::UTF8.GetBytes('Disposable signing qualification; not an installable application.')};$entryStream.Write($content,0,$content.Length)}finally{$entryStream.Dispose()}}}finally{$zip.Dispose()}}finally{$stream.Dispose()};Set-PrivateAcl $unsigned $false
    $syntheticCertificate=Sha $der;Sign-And-Verify $key $passwordFile $unsigned $signed $syntheticCertificate
    $result=[ordered]@{schema='st253-android-local-public-qualification-v1';platform='win32';architecture='x64';publicToolsReceiptSha256=$PublicToolsReceiptSha256;jdkArchiveSha256=$jdkPin;javaSha256=$script:portfolio.jdkFiles['bin/java.exe'].sha256;keytoolSha256=$script:portfolio.jdkFiles['bin/keytool.exe'].sha256;apksignerJarSha256=$jarPin;unsignedSha256=(Sha $unsigned);signedSha256=(Sha $signed);syntheticCertificateSha256=$syntheticCertificate;signatureVerified=$true;temporaryCustodyRemoved=$true}
  }else{
    Require ($QualificationFile -and $CommandFile -and $ManifestFile -and $UnsignedApk -and $PrimaryCheckout)
    Validate-Record 'qualification' @($QualificationFile,$script:publicRecord)
    $script:ssh=Resolve-Executable 'ssh'
    Check-PrivateAcl $CommandFile;$command=(Read-Small $CommandFile)|ConvertFrom-Json -AsHashtable
    Require ($command.Count -eq 3 -and $command.schema -ceq 'st253-android-local-command-v1' -and $command.operationId -cmatch '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' -and $command.capability -cmatch '^[a-f0-9]{64}$')
    $observed=Remote-Command 'observe' $command;Require ($observed.schema -ceq 'st253-android-local-observation-v1' -and $observed.state -ceq 'RESERVED' -and $observed.attempt -eq 0)
    $binding=$observed.binding;Require ($binding.publicToolsReceiptSha256 -ceq $PublicToolsReceiptSha256 -and $binding.signerCertificateSha256 -ceq $certificate -and (Sha $ManifestFile) -ceq $binding.apkManifestSha256 -and (Sha $UnsignedApk) -ceq $binding.unsignedSha256)
    Check-ExecutionSource $binding
    $manifest=(Read-Small $ManifestFile 16384)|ConvertFrom-Json -AsHashtable;Require ($manifest.sourceHead -ceq $binding.sourceHead -and $manifest.versionCode -eq $binding.versionCode -and $manifest.runtimeEnabled -eq $true)
    $primary=[IO.Path]::GetFullPath($PrimaryCheckout);No-Reparse $primary;Require ($primary -notmatch '[\\/]\.codex[\\/]worktrees[\\/]')
    $project=(Read-Small (Join-Path $primary 'package.json'))|ConvertFrom-Json -AsHashtable;Require ($project.name -ceq 'subtrack' -and $project.private -eq $true)
    $expectedOutput=Join-Path $primary ".codex-local-task-setup/android-local-signing/$($command.operationId)"
    Require ($output -ceq [IO.Path]::GetFullPath($expectedOutput))
    $inputRoot=Join-Path $primary ".codex-local-task-setup/android-transfer/apk-$($binding.apkRun)"
    Require ([IO.Path]::GetFullPath($ManifestFile) -ceq [IO.Path]::GetFullPath((Join-Path $inputRoot 'manifest.json')) -and [IO.Path]::GetFullPath($UnsignedApk) -ceq [IO.Path]::GetFullPath((Join-Path $inputRoot 'unsigned.apk')))
    No-Reparse $ManifestFile;No-Reparse $UnsignedApk;Check-PrivateAcl $inputRoot;Check-PrivateAcl $QualificationFile
    # Claim the single attempt before any original backup/key read. Uncertainty
    # leaves the remote mutex held; another invocation cannot repeat this step.
    $claimed=Remote-Command 'begin-attempt' $command;Require ($claimed.state -ceq 'ATTEMPT_CLAIMED' -and $claimed.attempt -eq 1 -and $claimed.reservationSha256 -ceq $observed.reservationSha256 -and [Convert]::ToHexString((Json-Bytes $claimed.binding)) -ceq [Convert]::ToHexString((Json-Bytes $binding)))
    $backup=Join-Path $primary ".codex-local-task-setup/android-signing-backup/$certificate";Check-PrivateAcl $backup
    $cipherFile=Join-Path $backup 'sandbox-signing.dpapi';$backupRecord=Join-Path $backup 'backup-binding.json';Check-PrivateAcl $cipherFile;Check-PrivateAcl $backupRecord
    [void](Native $script:node @($transferModule,'validate-backup',$backupRecord));$record=(Read-Small $backupRecord)|ConvertFrom-Json -AsHashtable
    Require ($record.signerCertificateSha256 -ceq $certificate -and $record.ciphertextSha256 -ceq $binding.backupCiphertextSha256 -and (Sha $cipherFile) -ceq $record.ciphertextSha256 -and (Get-Item -LiteralPath $cipherFile).Length -eq $record.ciphertextBytes -and $record.backupConfirmed -eq $true -and $record.signingRestoreVerified -eq $true)
    $cipher=[IO.File]::ReadAllBytes($cipherFile);$buffers.Add($cipher);Require ($cipher.Length -le 131072)
    $decoded=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$context,[Security.Cryptography.DataProtectionScope]::CurrentUser);$buffers.Add($decoded)
    $restored=Unpack $decoded;$buffers.Add($restored.Key);$buffers.Add($restored.Password)
    $key=Join-Path $secret 'sandbox-signing.p12';$passwordFile=Join-Path $secret 'password';Write-Private $key $restored.Key;Write-Private $passwordFile $restored.Password
    $der=Join-Path $secret 'certificate.der'
    [void](Native $script:keytool @('-exportcert','-alias','subtrack-sandbox','-keystore',$key,'-storetype','PKCS12','-storepass:file',$passwordFile,'-file',$der));Set-PrivateAcl $der $false;Require ((Sha $der) -ceq $certificate)
    $listing=Native $script:keytool @('-J-Duser.language=en','-J-Duser.country=US','-list','-v','-keystore',$key,'-storetype','PKCS12','-storepass:file',$passwordFile)
    Require ($listing -match 'Your keystore contains 1 entry' -and $listing -match 'Alias name: subtrack-sandbox' -and $listing -match '3072-bit RSA key' -and $listing -match 'Entry type: PrivateKeyEntry')
    $signed=Join-Path $output 'signed.apk';Sign-And-Verify $key $passwordFile $UnsignedApk $signed $certificate
    $pending=[ordered]@{schema='st250-android-signed-pending-v2';sourceHead=$binding.sourceHead;signerCertificateSha256=$certificate;unsignedSha256=$binding.unsignedSha256;signedSha256=(Sha $signed);bytes=(Get-Item -LiteralPath $signed).Length;runtimeEnabled=$true;embeddedConfigSha256=$binding.embeddedConfigSha256;hermesSha256=$binding.hermesSha256}
    $pendingFile=Join-Path $output 'signed-pending.json';Write-Private $pendingFile (Json-Bytes $pending)
    [void](Native $script:node @($transferModule,'validate-pending',$pendingFile,$ManifestFile,$certificate,$signed,$UnsignedApk))
    $result=[ordered]@{schema='st253-android-local-signing-execution-v1';operationId=$command.operationId;reservationSha256=$observed.reservationSha256;bindingSha256=([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData((Json-Bytes $binding)))).ToLowerInvariant();sourceHead=$binding.sourceHead;executionHead=$binding.executionHead;platform='win32';architecture='x64';publicToolsReceiptSha256=$PublicToolsReceiptSha256;jdkArchiveSha256=$jdkPin;javaSha256=$script:portfolio.jdkFiles['bin/java.exe'].sha256;keytoolSha256=$script:portfolio.jdkFiles['bin/keytool.exe'].sha256;apksignerJarSha256=$jarPin;syntheticQualificationSha256=(Sha $QualificationFile);unsignedSha256=$binding.unsignedSha256;signedSha256=$pending.signedSha256;pendingSha256=(Sha $pendingFile);signerCertificateSha256=$certificate;attempt=1;signatureVerified=$true;temporaryCustodyRemoved=$true;secretBuffersCleared=$true;alignmentVerified=$false}
  }
  $ready=$true
}finally{
  foreach($buffer in $buffers){Clear-Bytes $buffer};Clear-Bytes $context
  Remove-SecretCustody $secret $output;$cleanup=$true
}
Require ($ready -and $cleanup)
if($Mode -eq 'QualifyPublic'){
  $file=Join-Path $output 'public-qualification.json';Write-Private $file (Json-Bytes $result);Validate-Record 'qualification' @($file,$script:publicRecord)
  Write-Output 'ST253_ANDROID_LOCAL_PUBLIC_QUALIFICATION_PASS originalSignerAccessed=false alignmentVerified=false'
}else{
  $observationFile=Join-Path $output 'reservation-observation.json';Write-Private $observationFile (Json-Bytes $observed)
  $file=Join-Path $output 'execution.json';Write-Private $file (Json-Bytes $result);Validate-Record 'execution' @($file,$observationFile,$script:publicRecord)
  $recordCommand=[ordered]@{schema=$command.schema;operationId=$command.operationId;capability=$command.capability;execution=$result}
  $recorded=Remote-Command 'record-local' $recordCommand;Require ($recorded.state -ceq 'SIGNED_LOCAL')
  Write-Output 'ST253_ANDROID_LOCAL_SIGNED_HELD alignmentVerified=false independentUbuntuVerificationRequired=true'
}

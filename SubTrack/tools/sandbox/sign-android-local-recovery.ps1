[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('QualifyPublic','StageInputs','SignReserved')][string]$Mode,
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
  Require ($Verb -cin @('observe','begin-attempt','record-local','prepare-inputs','stage-inputs'))
  $bytes=Json-Bytes $Value;Require ($bytes.Length -le 65536)
  try{$text=Native $script:ssh @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3','openclaw@198.44.116.159',"umask 077; node /home/openclaw/subtrack-sandbox/tools/sandbox/android-local-signing-reservation.mjs $Verb") $bytes;Require ($text.Length -le 65536);return $text|ConvertFrom-Json -AsHashtable}finally{Clear-Bytes $bytes}
}
function Validate-StageCommand($Command){
  Require ($Command -is [Collections.IDictionary] -and $Command.Count -eq 3 -and $Command.schema -ceq 'st253-android-local-stage-inputs-v1' -and $Command.stageId -cmatch '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
  $selection=$Command.selection
  $fields=@('executionHead','sourceHead','apkRun','toolsRun','toolsSourceHead','signingToolingHead','signerExecutionHead','publicToolsReceiptSha256','executionSourceSha256','sourceHashes')
  Require ($selection -is [Collections.IDictionary] -and $selection.Count -eq $fields.Count)
  foreach($name in $fields){Require $selection.Contains($name)}
  foreach($name in @('executionHead','sourceHead','toolsSourceHead','signingToolingHead','signerExecutionHead')){Require ($selection[$name] -is [string] -and $selection[$name] -cmatch '^[a-f0-9]{40}$')}
  foreach($name in @('apkRun','toolsRun')){Require ($selection[$name] -is [string] -and $selection[$name] -cmatch '^[1-9][0-9]*-[1-9][0-9]*$')}
  foreach($name in @('publicToolsReceiptSha256','executionSourceSha256')){Require ($selection[$name] -is [string] -and $selection[$name] -cmatch '^[a-f0-9]{64}$')}
  Require ($selection.sourceHashes -is [Collections.IDictionary] -and $selection.sourceHashes.Count -eq 6)
  foreach($name in @('reservation','receipt','transfer','release','import','signer')){Require ($selection.sourceHashes.Contains($name) -and $selection.sourceHashes[$name] -is [string] -and $selection.sourceHashes[$name] -cmatch '^[a-f0-9]{64}$')}
}
function Stage-FileTransfer([string]$Source,[string]$Destination){
  # Both endpoints are constructed by Stage-Inputs from validated finite paths;
  # capabilities, passwords and backup material are never transfer arguments.
  [void](Native $script:scp @('-q','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3','--',$Source,$Destination))
}
function Stage-Upload([string]$Source,[string]$StageId,[string]$Name){
  Require ($StageId -cmatch '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' -and $Name -cin @('manifest.json','receipt.json','unsigned.apk','tools-reuse.json'))
  Check-PrivateAcl $Source;$hash=Sha $Source;$size=(Get-Item -LiteralPath $Source -Force).Length;$limit=if($Name -ceq 'unsigned.apk'){209715200}else{16384};Require ($size -gt 0 -and $size -le $limit)
  $directory="/home/openclaw/subtrack-sandbox/staging/android-local-inputs/$StageId";$file="$directory/$Name"
  $sshArgs=@('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3','openclaw@198.44.116.159')
  $guard='set -eu; test "$(id -u):$(id -g)" = 996:987; d='+$directory+'; test -d "$d"; test ! -L "$d"; test "$(realpath -e "$d")" = '+$directory+'; test "$(stat -c %a:%u:%g "$d")" = 700:996:987; f='+$file+'; '
  $bytes=$null
  try{
    $stream=[IO.FileStream]::new($Source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try{$bytes=[byte[]]::new([int]$size);$offset=0;while($offset -lt $bytes.Length){$count=$stream.Read($bytes,$offset,$bytes.Length-$offset);Require ($count -gt 0);$offset+=$count};Require ($stream.ReadByte() -eq -1 -and $stream.Length -eq $size)}finally{$stream.Dispose()}
    Require (([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))).ToLowerInvariant() -ceq $hash);Check-PrivateAcl $Source;Require ((Sha $Source) -ceq $hash)
    # Noclobber creates the one allowed leaf atomically; SCP's separate absent
    # check cannot guarantee exclusivity. Interrupted files are retained/held.
    [void](Native $script:ssh ($sshArgs+@($guard+'test ! -e "$f"; test ! -L "$f"; set -C; umask 077; cat > "$f"')) $bytes)
    [void](Native $script:ssh ($sshArgs+@($guard+'test -f "$f"; test ! -L "$f"; test "$(realpath -e "$f")" = '+$file+'; test "$(stat -c %a:%u:%g:%h "$f")" = 600:996:987:1; test "$(stat -c %s "$f")" = '+$size+'; test "$(sha256sum "$f" | cut -d " " -f1)" = '+$hash)))
  }finally{Clear-Bytes $bytes}
}
function Check-RemoteStageSource($Selection){
  $root='/home/openclaw/subtrack-sandbox/tools/sandbox'
  $sources=@{'reservation'='android-local-signing-reservation.mjs';'receipt'='android-local-signing-receipt.mjs';'transfer'='android-transfer-receipt.mjs';'release'='android-release-receipt.mjs';'import'='image-import-binding.cjs';'signer'='sign-android.sh'}
  $guards=[Collections.Generic.List[string]]::new();$guards.Add('set -eu; test "$(id -u):$(id -g)" = 996:987')
  foreach($directory in @('/home','/home/openclaw','/home/openclaw/subtrack-sandbox','/home/openclaw/subtrack-sandbox/tools',$root)){$guards.Add('test -d '+$directory+'; test ! -L '+$directory+'; test "$(realpath -e '+$directory+')" = '+$directory)}
  foreach($key in @('reservation','receipt','transfer','release','import','signer','handoff')){
    $name=if($key -ceq 'handoff'){'android-local-signing-source.json'}else{$sources[$key]};$hash=if($key -ceq 'handoff'){$Selection.executionSourceSha256}else{$Selection.sourceHashes[$key]}
    Require ($hash -cmatch '^[a-f0-9]{64}$')
    $file="$root/$name";$guards.Add('f='+$file+'; test -f "$f"; test ! -L "$f"; test "$(realpath -e "$f")" = '+$file+'; test "$(stat -c %a:%u:%g "$f")" = 600:996:987; test "$(stat -c %h "$f")" = 1; test "$(sha256sum "$f" | cut -d " " -f1)" = '+$hash)
  }
  [void](Native $script:ssh @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3','openclaw@198.44.116.159',($guards -join '; ')))
}
function Write-GitDockerfile([string]$Head,[string]$Destination){
  Require ($Head -cmatch '^[a-f0-9]{40}$')
  $git=Resolve-Executable 'git';$object="${Head}:SubTrack/infra/sandbox/Dockerfile.android-signing"
  $size=(Native $git @('-C',$PSScriptRoot,'--no-replace-objects','cat-file','-s',$object)).Trim();Require ($size -cmatch '^[1-9][0-9]*$' -and [int64]$size -le 65536)
  $text=Native $git @('-C',$PSScriptRoot,'--no-replace-objects','show',$object)
  $bytes=[Text.UTF8Encoding]::new($false,$true).GetBytes($text)
  try{Require ($bytes.Length -eq [int]$size);Write-Private $Destination $bytes;Require ((Sha $Destination) -ceq 'd2867b142a15cb44ce58361baa188e93da1c8c95fda7f7f5c41c6a00f0813e31')}finally{Clear-Bytes $bytes}
}
function Remove-StageWork([string]$Work,[string]$Parent){
  Require ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Work)) -ceq [IO.Path]::GetFullPath($Parent));Check-PrivateAcl $Work
  $roster=@{'verified-apk'=@('manifest.json','receipt.json','unsigned.apk');'retained-metadata'=@('manifest.json','receipt.json','import-binding.json')}
  $leaves=@('apk-Dockerfile','tools-Dockerfile','tools-reuse.json')
  foreach($item in Get-ChildItem -LiteralPath $Work -Force){
    Check-PrivateAcl $item.FullName
    if($item.PSIsContainer){Require $roster.Contains($item.Name);foreach($file in Get-ChildItem -LiteralPath $item.FullName -Force){Require (-not $file.PSIsContainer -and $file.Name -cin $roster[$item.Name]);Check-PrivateAcl $file.FullName}}
    else{Require ($item.Name -cin $leaves)}
  }
  foreach($item in Get-ChildItem -LiteralPath $Work -Force){if($item.PSIsContainer){foreach($file in Get-ChildItem -LiteralPath $item.FullName -Force){Remove-Item -LiteralPath $file.FullName -Force};Remove-Item -LiteralPath $item.FullName -Force}else{Remove-Item -LiteralPath $item.FullName -Force}}
  Require (@(Get-ChildItem -LiteralPath $Work -Force).Count -eq 0);Remove-Item -LiteralPath $Work -Force
}
function Stage-Inputs($Command,[string]$Primary,[string]$Output){
  Validate-StageCommand $Command;$selection=$Command.selection
  Require ($selection.publicToolsReceiptSha256 -ceq $PublicToolsReceiptSha256)
  Require ($null -eq [Environment]::GetEnvironmentVariable('GH_HOST') -or [Environment]::GetEnvironmentVariable('GH_HOST') -ceq 'github.com')
  $primaryPath=[IO.Path]::GetFullPath($Primary);No-Reparse $primaryPath;Require ($primaryPath -notmatch '[\\/]\.codex[\\/]worktrees[\\/]')
  $project=(Read-Small (Join-Path $primaryPath 'package.json'))|ConvertFrom-Json -AsHashtable;Require ($project.name -ceq 'subtrack' -and $project.private -eq $true)
  Require ($Output -ceq [IO.Path]::GetFullPath((Join-Path $primaryPath ".codex-local-task-setup/android-local-inputs-stage/$($Command.stageId)")))
  Check-ExecutionSource @{executionHead=$selection.executionHead;selection=$selection}
  $apkLocal=Join-Path $primaryPath ".codex-local-task-setup/android-transfer/apk-$($selection.apkRun)";$toolsLocal=Join-Path $primaryPath ".codex-local-task-setup/android-transfer/tools-$($selection.toolsRun)"
  Check-PrivateAcl $apkLocal;Check-PrivateAcl $toolsLocal
  foreach($name in @('manifest.json','receipt.json','unsigned.apk')){Check-PrivateAcl (Join-Path $apkLocal $name)}
  foreach($name in @('manifest.json','receipt.json','tools-image.tar.gz')){Check-PrivateAcl (Join-Path $toolsLocal $name)}
  $work=Join-Path $Output ('stage-work-'+[Guid]::NewGuid().ToString('N'));New-PrivateDirectory $work
  try{
    $verified=Join-Path $work 'verified-apk';New-PrivateDirectory $verified
    [void](Native $script:node @($transferModule,'download','apk',(Join-Path $apkLocal 'receipt.json'),$verified) $null 660000)
    foreach($name in @('manifest.json','receipt.json','unsigned.apk')){$file=Join-Path $verified $name;Set-PrivateAcl $file $false;Require ((Sha $file) -ceq (Sha (Join-Path $apkLocal $name)))}
    $manifest=(Read-Small (Join-Path $verified 'manifest.json') 16384)|ConvertFrom-Json -AsHashtable;Require ($manifest.sourceHead -ceq $selection.sourceHead -and $manifest.runId -ceq $selection.apkRun -and $manifest.runtimeEnabled -eq $true)
    $apkDockerfile=Join-Path $work 'apk-Dockerfile';$toolsDockerfile=Join-Path $work 'tools-Dockerfile';Write-GitDockerfile $selection.sourceHead $apkDockerfile;Write-GitDockerfile $selection.toolsSourceHead $toolsDockerfile
    # The reviewed current receiver and matching source handoff must already be
    # installed exclusively by the operator. This mode never installs/overwrites
    # original tooling or calls the legacy Docker preflight/import commands.
    $selectionHash=([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData((Json-Bytes $selection)))).ToLowerInvariant()
    Check-RemoteStageSource $selection
    $prepared=Remote-Command 'prepare-inputs' $Command
    Require ($prepared.Count -eq 5 -and $prepared.schema -ceq 'st253-android-local-inputs-prepared-v1' -and $prepared.stageId -ceq $Command.stageId -and $prepared.selectionSha256 -ceq $selectionHash -and $prepared.filesOnly -eq $true -and $prepared.legacyPreflightPassed -eq $false)
    $metadata=Join-Path $work 'retained-metadata';New-PrivateDirectory $metadata
    $remoteTools="/home/openclaw/subtrack-sandbox/staging/android-tools/$($selection.toolsRun)"
    $readGuard='set -eu; test "$(id -u):$(id -g)" = 996:987; d='+$remoteTools+'; test -d "$d"; test ! -L "$d"; test "$(realpath -e "$d")" = '+$remoteTools+'; test "$(stat -c %a:%u:%g "$d")" = 700:996:987; for n in manifest.json receipt.json import-binding.json; do f="$d/$n"; test -f "$f"; test ! -L "$f"; test "$(stat -c %a:%u:%g "$f")" = 600:996:987; test "$(stat -c %s "$f")" -gt 0; test "$(stat -c %s "$f")" -le 16384; done'
    [void](Native $script:ssh @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3','openclaw@198.44.116.159',$readGuard))
    foreach($name in @('manifest.json','receipt.json','import-binding.json')){$file=Join-Path $metadata $name;Stage-FileTransfer "openclaw@198.44.116.159:${remoteTools}/$name" $file;Set-PrivateAcl $file $false;[void](Read-Small $file 16384)}
    foreach($name in @('manifest.json','receipt.json')){Require ((Sha (Join-Path $metadata $name)) -ceq (Sha (Join-Path $toolsLocal $name)))}
    $proof=Join-Path $work 'tools-reuse.json';[void](Native $script:node @($transferModule,'tools-reuse',$toolsLocal,(Join-Path $metadata 'import-binding.json'),$selection.sourceHead,$selection.signerExecutionHead,$selection.signingToolingHead,$apkDockerfile,$toolsDockerfile,$proof));Set-PrivateAcl $proof $false
    $reuse=(Read-Small $proof 16384)|ConvertFrom-Json -AsHashtable;Require ($reuse.toolsSourceHead -ceq $selection.toolsSourceHead -and $reuse.toolsRun -ceq $selection.toolsRun)
    foreach($name in @('manifest.json','receipt.json','unsigned.apk','tools-reuse.json')){$file=if($name -ceq 'tools-reuse.json'){$proof}else{Join-Path $verified $name};Stage-Upload $file $Command.stageId $name}
    $staged=Remote-Command 'stage-inputs' $Command
    Require ($staged.Count -eq 11 -and $staged.schema -ceq 'st253-android-local-inputs-staged-v1' -and $staged.stageId -ceq $Command.stageId -and $staged.selectionSha256 -ceq $selectionHash -and $staged.apkRun -ceq $selection.apkRun -and $staged.sourceHead -ceq $selection.sourceHead -and $staged.filesOnly -eq $true -and $staged.legacyPreflightPassed -eq $false)
    foreach($pair in @(@('manifestSha256','manifest.json'),@('receiptSha256','receipt.json'),@('unsignedSha256','unsigned.apk'),@('toolsReuseSha256','tools-reuse.json'))){$file=if($pair[1] -ceq 'tools-reuse.json'){$proof}else{Join-Path $verified $pair[1]};Require ($staged[$pair[0]] -ceq (Sha $file))}
    return $staged
  }finally{Remove-StageWork $work $Output}
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
  }elseif($Mode -eq 'StageInputs'){
    Require ($QualificationFile -and $CommandFile -and $PrimaryCheckout)
    Validate-Record 'qualification' @($QualificationFile,$script:publicRecord)
    Check-PrivateAcl $QualificationFile;Check-PrivateAcl $CommandFile
    $script:ssh=Resolve-Executable 'ssh';$script:scp=Resolve-Executable 'scp'
    $stageCommand=(Read-Small $CommandFile)|ConvertFrom-Json -AsHashtable
    $result=Stage-Inputs $stageCommand $PrimaryCheckout $output
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
}elseif($Mode -eq 'StageInputs'){
  Write-Private (Join-Path $output 'inputs-staged.json') (Json-Bytes $result)
  Write-Output 'ST253_ANDROID_LOCAL_INPUTS_STAGED filesOnly=true legacyPreflightPassed=false signerAccessed=false'
}else{
  $observationFile=Join-Path $output 'reservation-observation.json';Write-Private $observationFile (Json-Bytes $observed)
  $file=Join-Path $output 'execution.json';Write-Private $file (Json-Bytes $result);Validate-Record 'execution' @($file,$observationFile,$script:publicRecord)
  $recordCommand=[ordered]@{schema=$command.schema;operationId=$command.operationId;capability=$command.capability;execution=$result}
  $recorded=Remote-Command 'record-local' $recordCommand;Require ($recorded.state -ceq 'SIGNED_LOCAL')
  Write-Output 'ST253_ANDROID_LOCAL_SIGNED_HELD alignmentVerified=false independentUbuntuVerificationRequired=true'
}

set -Eeuo pipefail
root=/home/openclaw/subtrack-sandbox
[[ "$(id -u):$(id -g)" == 996:987 ]]
image=sha256:27260d8c3eb24c5473f26f5e4873e6eb18e306806bd81f185a24fb96b5c34e49
[[ "$(docker image inspect --format '{{index .Config.Labels "se.subtrack.android.source"}}' "$image")" == 1655c14f4ae25ce5e8d6f5c38b1033589532aebe ]]
source_file=$root/staging/38584003112-1/sign-android-fixed-candidate.sh
[[ -f "$source_file" && ! -L "$source_file" && "$(realpath -e "$source_file")" == "$source_file" && "$(sha256sum "$source_file" | cut -d' ' -f1)" == 9d4c09b1651f240b77a00edbb2ccc7e5ff4c9d1fc059c5112b0ad36dc561b191 ]]
mode="$(node - "$source_file" <<'NODE'
const fs=require('fs'),s=fs.readFileSync(process.argv[2],'utf8'),line=s.split('\n').find(l=>l.includes('apksigner sign --ks '));if(!line||!line.includes('--ks-type PKCS12')||!line.includes('--ks-pass file:/key/password')||!s.includes('-storepass:file /key/password -keypass:file /key/password'))process.exit(1);process.stdout.write(line.includes('--key-pass')?'explicit':'same-keystore');
NODE
)"
private="$(mktemp -d "$root/staging/password-sequence-proof.XXXXXXXX")";chmod 700 "$private"
cleanup(){ [[ "$private" == "$root"/staging/password-sequence-proof.* && "$(realpath -e "$private")" == "$private" && ! -L "$private" ]] || return 1;for id in $(docker ps -aq --filter "label=se.subtrack.android.password-probe=$private");do docker rm -f "$id" >/dev/null 2>&1;done;rm -rf -- "$private"; }
trap cleanup EXIT
cat > "$private/SignerPasswordProbe.java" <<'JAVA'
import com.android.apksigner.PasswordRetriever;
import com.android.apksigner.SignerParams;
import java.nio.file.*;
public class SignerPasswordProbe {
 static SignerParams signer(boolean explicit){var s=new SignerParams();s.setName("synthetic");s.setKeystoreFile("/tmp/fixture.p12");s.setKeystoreType("PKCS12");s.setKeystoreKeyAlias("fixture");s.setKeystorePasswordSpec("file:/tmp/password");if(explicit)s.setKeyPasswordSpec("file:/tmp/password");return s;}
 public static void main(String[] args)throws Exception{
  Files.writeString(Path.of("/tmp/password"),"synthetic-fixture-password\n");
  var p=new ProcessBuilder("keytool","-genkeypair","-alias","fixture","-keyalg","RSA","-keysize","2048","-validity","1","-dname","CN=Synthetic Fixture","-storetype","PKCS12","-keystore","/tmp/fixture.p12","-storepass","synthetic-fixture-password","-keypass","synthetic-fixture-password").redirectErrorStream(true).redirectOutput(Path.of("/tmp/keytool.log").toFile()).start();if(p.waitFor()!=0)throw new Exception("fixture");
  boolean eof=false;try(var r=new PasswordRetriever()){try{signer(true).loadPrivateKeyAndCerts(r);}catch(java.io.IOException e){eof=e.getMessage().contains("end of file");}}
  boolean defaultPass=false;try(var r=new PasswordRetriever()){var s=signer(args.length==1&&args[0].equals("explicit"));s.loadPrivateKeyAndCerts(r);defaultPass=s.getPrivateKey()!=null&&s.getCerts().size()==1;}
  if(!eof||!defaultPass)throw new Exception("proof");System.out.println("ST250_SYNTHETIC_PASSWORD_PROOF same_file_second_read_eof=true default_same_password_loads=true");
 }
}
JAVA
chmod 600 "$private/SignerPasswordProbe.java"
if ! timeout --kill-after=5s 60s docker run --rm --label "se.subtrack.android.password-probe=$private" --user 996:996 --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus .5 --pids-limit 64 --tmpfs /tmp:rw,nosuid,nodev,noexec,size=128m,uid=996,gid=996 --mount "type=bind,src=$private/SignerPasswordProbe.java,dst=/probe/SignerPasswordProbe.java,readonly" --entrypoint java "$image" -cp /opt/android/build-tools/36.0.0/lib/apksigner.jar /probe/SignerPasswordProbe.java "$mode" > "$private/probe.log" 2>&1;then printf 'ST250_SYNTHETIC_PASSWORD_PROOF_FAILED\n';exit 1;fi
grep -Fx 'ST250_SYNTHETIC_PASSWORD_PROOF same_file_second_read_eof=true default_same_password_loads=true' "$private/probe.log"
[[ -z "$(docker ps -aq --filter "label=se.subtrack.android.password-probe=$private")" ]]
printf 'ST250_SYNTHETIC_PASSWORD_PROBE_CLEANUP confirmed=true\n'
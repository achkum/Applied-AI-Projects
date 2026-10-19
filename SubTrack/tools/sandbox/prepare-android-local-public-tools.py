"""ST-253 public bytes only. No Java execution, signer, backup, SSH or network.

The checksum below was independently read from the publisher's HTTPS checksum
asset on 2026-10-18; it is deliberately not supplied by the caller. The retained
tools envelope is pinned to the previously authenticated original transfer.
Output is preparation evidence, never a signing/alignment/restore qualification.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
import zipfile

JDK_URL = 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.zip.sha256.txt'
JDK_SHA = 'e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0'
JDK_ROOT = 'jdk-17.0.20.1+1'
MANIFEST_SHA = 'da11808d968908408cbea9ba30b75a5bffc6f61935df02db60b87fb011892694'
RECEIPT_SHA = '194c0a7954cd66b8d702dd6c97bd3b22087649e0619fde3ed9747dcac4519f64'
JAR_SHA = '3716d9311e55d2b0918a2fd9d54ba9e406c5f6abeea700b287f11259bc163dec'
JAR_PATH = 'opt/android/build-tools/36.0.0/lib/apksigner.jar'
CHUNK = 65536
MAX_RAW = 2147483648
MAX_LAYER = 536870912
MAX_JDK = 536870912
MAX_JAR = 33554432
# Node24 preload/search/trust/output overrides can read, execute or write outside
# the finite public validation operation. Reject even an empty supplied override.
NODE_OVERRIDES = ('NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS',
                  'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_COMPILE_CACHE',
                  'NODE_V8_COVERAGE', 'NODE_REDIRECT_WARNINGS',
                  'OPENSSL_CONF', 'SSL_CERT_FILE', 'SSL_CERT_DIR')


def require(condition):
    if not condition:
        raise ValueError('ST253_PUBLIC_TOOLS_UNAVAILABLE')


def safe_path(path):
    path = Path(os.path.abspath(path))
    for part in [path, *path.parents]:
        if part.exists() or part.is_symlink():
            info = part.lstat()
            require(not stat.S_ISLNK(info.st_mode) and not (getattr(info, 'st_file_attributes', 0) & 1024))
    return path


def identity(info):
    # Windows Python path.stat ctime is creation time while fstat ctime may be
    # last-write time. birthtime is the consistent creation identity on both.
    stamp = info.st_birthtime_ns if os.name == 'nt' else info.st_ctime_ns
    # Windows path stat also synthesizes executable bits from '.exe'; fstat does
    # not. These are not Windows ACLs. Keep real file type, never those fake bits.
    mode = stat.S_IFMT(info.st_mode) if os.name == 'nt' else info.st_mode
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, stamp, mode)


def regular(path, maximum):
    path = safe_path(path)
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= maximum)
    return path, identity(before)


def unchanged(path, before):
    require(identity(safe_path(path).lstat()) == before)


def directory_identity(path):
    info = safe_path(path).lstat()
    require(stat.S_ISDIR(info.st_mode))
    # Directory size/mtime change as files are created; object identity must not.
    return (info.st_dev, info.st_ino, getattr(info, 'st_birthtime_ns', None),
            info.st_uid, info.st_gid, stat.S_IFMT(info.st_mode))


def copy_bytes(source, destination, maximum):
    digest, total = hashlib.sha256(), 0
    while True:
        block = source.read(CHUNK)
        if not block:
            break
        total += len(block)
        require(total <= maximum)
        digest.update(block)
        if destination is not None:
            destination.write(block)
    return total, digest.hexdigest()


def hash_file(path, maximum):
    path, before = regular(path, maximum)
    with path.open('rb') as stream:
        require(identity(os.fstat(stream.fileno())) == before)
        measured = copy_bytes(stream, None, maximum)
        require(identity(os.fstat(stream.fileno())) == before)
    unchanged(path, before)
    return measured


def member_name(name, linux_read_only=False):
    require(isinstance(name, str) and len(name) <= 512 and '\\' not in name and '\x00' not in name)
    require(not name.startswith('/') and not re.search(r'[\x00-\x1f]', name))
    require(linux_read_only or ':' not in name)
    trimmed = name.rstrip('/')
    require(trimmed and all(part not in ('', '.', '..') for part in trimmed.split('/')))
    require(str(PurePosixPath(trimmed)) == trimmed)
    return trimmed


def canonical_tools(directory, raw_file):
    """Existing canonical validator verifies envelope, archive and all image layers."""
    require(not any(key in os.environ for key in NODE_OVERRIDES))
    module = Path(__file__).with_name('android-transfer-receipt.mjs').resolve()
    program = """import {pathToFileURL} from 'node:url';
const [module,dir,raw]=process.argv.slice(2),m=await import(pathToFileURL(module));
const custody=await m.toolsCustody(dir);await m.inspectToolTarFile(raw,custody.manifest);
process.stdout.write(JSON.stringify({manifest:custody.manifest}));"""
    # Only Node parses public bytes. No downloaded executable is ever launched.
    result = subprocess.run(['node', '--input-type=module', '-e', program, 'st253-public-tools', str(module), str(directory), str(raw_file)],
                            capture_output=True, timeout=180, check=False)
    require(result.returncode == 0 and len(result.stdout) <= 16384 and len(result.stderr) <= 65536)
    value = json.loads(result.stdout)
    require(set(value) == {'manifest'})
    return value['manifest']


def extract_jar(raw_file, destination, expected):
    """Read layers; write only one exact regular JAR, never image filesystem paths."""
    found = 0
    with tarfile.open(raw_file, 'r:') as outer:
        roster = outer.getmembers()
        require(len(roster) <= 256)
        members = {}
        for item in roster:
            name = member_name(item.name)
            require(name not in members and (item.isfile() or item.isdir()))
            members[name] = item
        metadata = members.get('manifest.json')
        require(metadata is not None and metadata.isfile() and metadata.size <= 1048576)
        portfolio = json.load(outer.extractfile(metadata))
        require(isinstance(portfolio, list) and len(portfolio) == 1)
        layers = portfolio[0]['Layers']
        require(1 <= len(layers) <= 16 and len(set(layers)) == len(layers))
        ancestors = {str(parent) for parent in PurePosixPath(JAR_PATH).parents if str(parent) != '.'}
        for layer in layers:
            entry = members.get(member_name(layer))
            require(entry is not None and entry.isfile() and 0 < entry.size <= MAX_LAYER)
            with outer.extractfile(entry) as source:
                with tempfile.TemporaryFile() as expanded:
                    # Docker save layers may be gzip or plain tar, both already canonically bound.
                    first = source.read(2)
                    source.seek(0)
                    codec = gzip.GzipFile(fileobj=source) if first == b'\x1f\x8b' else source
                    try:
                        copy_bytes(codec, expanded, MAX_LAYER)
                    finally:
                        if codec is not source:
                            codec.close()
                    expanded.seek(0)
                    with tarfile.open(fileobj=expanded, mode='r:') as archive:
                        seen = set()
                        for count, item in enumerate(archive):
                            require(count < 100000)
                            # Common tar './' root entries are harmless; no path is extracted.
                            name = item.name[2:] if item.name.startswith('./') else item.name
                            if name.rstrip('/') in ('', '.'):
                                require(item.isdir())
                                continue
                            # Public Linux layers contain legitimate dpkg ':amd64'
                            # names. They are read only; no such path is written.
                            name = member_name(name, linux_read_only=True)
                            require(name not in seen)
                            seen.add(name)
                            parent, _, base = name.rpartition('/')
                            if base.startswith('.wh.') and (parent in ancestors or parent == '' or name == JAR_PATH):
                                require(False)
                            if name in ancestors:
                                require(item.isdir())
                            if name == JAR_PATH:
                                require(item.isfile() and 0 < item.size <= MAX_JAR and found == 0)
                                with archive.extractfile(item) as stream, destination.open('xb') as output:
                                    size, actual = copy_bytes(stream, output, MAX_JAR)
                                require(size == item.size and actual == expected)
                                found += 1
    require(found == 1)


def extract_jdk(archive, output):
    seen, required, total = set(), {'bin/java.exe', 'bin/keytool.exe', 'bin/jarsigner.exe', 'bin/server/jvm.dll', 'lib/modules', 'release'}, 0
    files = {}
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        require(0 < len(entries) <= 2000)
        for item in entries:
            name = member_name(item.filename)
            require(name not in seen and name.split('/')[0] == JDK_ROOT)
            seen.add(name)
            require(not item.flag_bits & 1 and item.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED))
            mode = item.external_attr >> 16
            require(stat.S_IFMT(mode) in (0, stat.S_IFREG, stat.S_IFDIR))
            for part in name.split('/'):
                require(not part.endswith(('.', ' ')) and not re.match(r'(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', part))
            total += item.file_size
            require(total <= MAX_JDK and 0 <= item.file_size <= 268435456)
            target = output.joinpath(*name.split('/'))
            if item.is_dir():
                require(item.file_size == 0)
                target.mkdir(parents=True, exist_ok=True)
            else:
                require(item.file_size > 0)
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(item) as stream, target.open('xb') as destination:
                    size, digest = copy_bytes(stream, destination, 268435456)
                require(size == item.file_size)
                files[name.removeprefix(JDK_ROOT + '/')] = {'sha256': digest, 'bytes': size}
    require(required <= files.keys())
    release = (output / JDK_ROOT / 'release').read_text(encoding='utf8')
    for marker in ('IMPLEMENTOR="Eclipse Adoptium"', 'JAVA_VERSION="17.0.20.1"', 'OS_NAME="Windows"', 'OS_ARCH="x86_64"'):
        require(marker in release)
    return files


def prepare(tools, jdk_zip, destination):
    tools, destination = safe_path(tools), safe_path(destination)
    require(tools.is_dir() and destination.parent.is_dir() and not destination.exists())
    manifest_path, manifest_before = regular(tools / 'manifest.json', 16384)
    receipt_path, receipt_before = regular(tools / 'receipt.json', 16384)
    require(hash_file(manifest_path, 16384)[1] == MANIFEST_SHA and hash_file(receipt_path, 16384)[1] == RECEIPT_SHA)
    manifest = json.loads(manifest_path.read_bytes())
    archive, archive_before = regular(tools / 'tools-image.tar.gz', 1073741824)
    require(hash_file(archive, 1073741824) == (manifest['archiveBytes'], manifest['archiveSha256']))
    jdk_zip, jdk_before = regular(jdk_zip, 536870912)
    require(hash_file(jdk_zip, 536870912)[1] == JDK_SHA)
    created_identity = None
    # Work and output share an existing caller-chosen parent; old paths are never removed.
    with tempfile.TemporaryDirectory(prefix='.st253-public-tools-', dir=destination.parent) as temporary:
        work, raw = Path(temporary), Path(temporary) / 'tools.tar'
        with gzip.open(archive, 'rb') as source, raw.open('xb') as output:
            size, digest = copy_bytes(source, output, MAX_RAW)
        require((size, digest) == (manifest['rawTarBytes'], manifest['rawTarSha256']))
        validated = canonical_tools(tools, raw)
        require(validated == manifest and manifest['apksignerJarSha256'] == JAR_SHA)
        public = work / 'public'
        public.mkdir()
        extract_jar(raw, public / 'apksigner.jar', JAR_SHA)
        # Extract a freshly hash-verified owned snapshot, not a mutable caller path.
        jdk_snapshot = work / 'jdk.zip'
        with jdk_zip.open('rb') as source, jdk_snapshot.open('xb') as output:
            _, jdk_digest = copy_bytes(source, output, MAX_JDK)
        require(jdk_digest == JDK_SHA)
        files = extract_jdk(jdk_snapshot, public)
        for path, original in ((manifest_path, manifest_before), (receipt_path, receipt_before), (archive, archive_before), (jdk_zip, jdk_before)):
            unchanged(path, original)
        record = {'schema': 'st253-android-local-public-tools-v1', 'qualification': 'public-bytes-only',
                  'toolsManifestSha256': MANIFEST_SHA, 'toolsReceiptSha256': RECEIPT_SHA,
                  'toolsSourceHead': manifest['sourceHead'], 'toolsRunId': manifest['runId'], 'toolsImageId': manifest['imageId'],
                  'apksignerJarSha256': JAR_SHA, 'jdkPublisherChecksumUrl': JDK_URL, 'jdkArchiveSha256': JDK_SHA,
                  'jdkRoot': JDK_ROOT, 'jdkFiles': files, 'javaExecuted': False, 'signerAccessed': False,
                  'remoteOperationPerformed': False, 'alignmentVerified': False, 'signingQualified': False}
        try:
            destination.mkdir(mode=0o700)
            created_identity = directory_identity(destination)
            # Exclusive files, not rename-over-existing or copytree merge semantics.
            for path in public.rglob('*'):
                target = destination / path.relative_to(public)
                if path.is_dir():
                    target.mkdir(exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with path.open('rb') as source, target.open('xb') as output:
                        expected = copy_bytes(source, output, MAX_JDK)
                    require(hash_file(target, MAX_JDK) == expected)
            with (destination / 'public-tools.json').open('x', encoding='utf8', newline='\n') as receipt:
                receipt.write(json.dumps(record, separators=(',', ':')))
                receipt.flush()
                os.fsync(receipt.fileno())
            return record
        except BaseException:
            # Never remove an unknown/existing path. If cleanup fails, no success receipt is returned.
            if created_identity is not None:
                require(directory_identity(destination) == created_identity)
                shutil.rmtree(destination)
                require(not destination.exists())
            raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tools_directory')
    parser.add_argument('jdk_zip')
    parser.add_argument('new_output_directory')
    args = parser.parse_args()
    try:
        value = prepare(args.tools_directory, args.jdk_zip, args.new_output_directory)
        print(json.dumps({'schema': value['schema'], 'qualification': value['qualification'], 'signingQualified': False}))
    except Exception:
        raise SystemExit('ST253_PUBLIC_TOOLS_UNAVAILABLE') from None

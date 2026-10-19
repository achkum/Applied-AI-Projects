"""Synthetic public archives only; no backup, executable, network or SSH use."""
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

SPEC = importlib.util.spec_from_file_location('public_tools', Path(__file__).with_name('prepare-android-local-public-tools.py'))
tools = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tools)
sha = lambda value: hashlib.sha256(value).hexdigest()
encode = lambda value: json.dumps(value, separators=(',', ':')).encode()


def tar(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, content, kind in entries:
            item = tarfile.TarInfo(name)
            item.type = kind
            item.size = len(content) if kind == tarfile.REGTYPE else 0
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                item.linkname = 'foreign'
            archive.addfile(item, io.BytesIO(content) if kind == tarfile.REGTYPE else None)
    return output.getvalue()


class PreparationTests(unittest.TestCase):
    def test_compiled_pins_are_exact_sha256_with_no_cli_override(self):
        for value in (tools.JDK_SHA, tools.MANIFEST_SHA, tools.RECEIPT_SHA, tools.JAR_SHA):
            self.assertRegex(value, r'^[a-f0-9]{64}$')

    def test_node_preload_search_trust_and_output_overrides_never_execute_canary(self):
        canary, invoked = self.root / 'canary.cjs', self.root / 'canary-executed'
        canary.write_text("require('node:fs').writeFileSync(" + json.dumps(str(invoked)) + ", 'must not execute');", encoding='utf8')
        for key in tools.NODE_OVERRIDES:
            for value in (('--require=' + str(canary)) if key == 'NODE_OPTIONS' else str(canary), ''):
                with self.subTest(key=key, empty=not value), patch.dict(os.environ, {key: value}), patch.object(tools.subprocess, 'run') as process:
                    with self.assertRaises(ValueError):
                        self.prepare()
                    process.assert_not_called()
                    self.assertFalse(invoked.exists())
                    self.assertFalse(self.output.exists())
        self.assertEqual(list(self.root.glob('.st253-public-tools-*')), [])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.directory = self.root / 'tools'
        self.directory.mkdir()
        self.output = self.root / 'prepared'
        self.jdk = self.root / 'jdk.zip'
        release = b'IMPLEMENTOR="Eclipse Adoptium"\nJAVA_VERSION="17.0.20.1"\nOS_NAME="Windows"\nOS_ARCH="x86_64"\n'
        with zipfile.ZipFile(self.jdk, 'w') as archive:
            for name in ('bin/java.exe', 'bin/keytool.exe', 'bin/jarsigner.exe', 'bin/server/jvm.dll', 'lib/modules', 'release'):
                archive.writestr(f'{tools.JDK_ROOT}/{name}', release if name == 'release' else b'not executable synthetic public bytes')
        self.jar = b'not executable synthetic jar'
        self.make_tools([(tools.JAR_PATH, self.jar, tarfile.REGTYPE)])

    def make_tools(self, entries):
        layer = tar(entries)
        head, run = 'a' * 40, '1234-1'
        config = encode({'os': 'linux', 'architecture': 'amd64', 'config': {'User': '996:996', 'Entrypoint': ['/opt/android/build-tools/36.0.0/apksigner'], 'Labels': {'se.subtrack.android.source': head, 'se.subtrack.android.run': run}}, 'rootfs': {'diff_ids': ['sha256:' + sha(layer)]}})
        config_name = sha(config) + '.json'
        raw = tar([('manifest.json', encode([{'Config': config_name, 'RepoTags': [], 'Layers': ['layer.tar']}]), tarfile.REGTYPE), (config_name, config, tarfile.REGTYPE), ('layer.tar', layer, tarfile.REGTYPE)])
        payload = gzip.compress(raw)
        common = {'sourceHead': head, 'runId': run, 'defaultTargetHead': 'b' * 40, 'draftTag': f'st250-android-tools-stage-{head}-{run}'}
        manifest = {'schema': 'st250-android-tools-manifest-v1', **common, 'imageId': 'sha256:' + sha(config), 'baseImage': 'eclipse-temurin@sha256:8d242405506ad1085e39f1ca80ec76f0812f61073efe76129607e39f043ccbb9', 'dockerfileSha256': 'd2867b142a15cb44ce58361baa188e93da1c8c95fda7f7f5c41c6a00f0813e31', 'sdkArchiveSha256': '5d9ac77fb6ff43d9da518a337b4fcf8f9097113df531d99ccefe80ef7ce8250b', 'apksignerJarSha256': sha(self.jar), 'zipalignSha256': 'c' * 64, 'archiveSha256': sha(payload), 'rawTarSha256': sha(raw), 'archiveBytes': len(payload), 'rawTarBytes': len(raw), 'runtimeUid': 996, 'runtimeGid': 996, 'buildToolsVersion': '36.0.0', 'toolsQualified': True}
        manifest_bytes = encode(manifest)
        receipt = {'schema': 'st250-android-tools-draft-transfer-receipt-v1', **common, 'releaseId': 1, 'draft': True, 'imageId': manifest['imageId'], 'archiveSha256': sha(payload), 'archiveBytes': len(payload), 'archiveAssetId': 2, 'manifestSha256': sha(manifest_bytes), 'manifestBytes': len(manifest_bytes), 'manifestAssetId': 3, 'manifestSchema': manifest['schema'], 'toolsQualified': True, 'uploadVerified': True, 'localCleanupConfirmed': True, 'remoteCustody': 'draft-retained'}
        (self.directory / 'manifest.json').write_bytes(manifest_bytes)
        (self.directory / 'receipt.json').write_bytes(encode(receipt))
        (self.directory / 'tools-image.tar.gz').write_bytes(payload)

    def pins(self):
        # Test-only substitution of compiled constants. The CLI has no pin overrides.
        return patch.multiple(tools, MANIFEST_SHA=sha((self.directory / 'manifest.json').read_bytes()), RECEIPT_SHA=sha((self.directory / 'receipt.json').read_bytes()), JDK_SHA=sha(self.jdk.read_bytes()), JAR_SHA=sha(self.jar))

    def prepare(self):
        with self.pins():
            return tools.prepare(self.directory, self.jdk, self.output)

    def test_real_canonical_validator_and_exclusive_preparation(self):
        record = self.prepare()
        self.assertEqual((self.output / 'apksigner.jar').read_bytes(), self.jar)
        self.assertEqual(record['qualification'], 'public-bytes-only')
        self.assertFalse(record['javaExecuted'] or record['signerAccessed'] or record['signingQualified'] or record['remoteOperationPerformed'] or record['alignmentVerified'])
        self.assertEqual(record, json.loads((self.output / 'public-tools.json').read_bytes()))
        self.assertEqual(len(record['jdkFiles']), 6)
        prior = (self.output / 'public-tools.json').read_bytes()
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertEqual(prior, (self.output / 'public-tools.json').read_bytes())

    def test_official_jdk_or_retained_envelope_pin_mismatch_prevents_output(self):
        with self.assertRaises(ValueError):
            tools.prepare(self.directory, self.jdk, self.output)
        with self.pins(), patch.object(tools, 'JDK_SHA', '0' * 64), self.assertRaises(ValueError):
            tools.prepare(self.directory, self.jdk, self.output)
        self.assertFalse(self.output.exists())

    def test_canonical_receipt_rejects_self_consistent_false_cleanup(self):
        receipt_file = self.directory / 'receipt.json'
        receipt = json.loads(receipt_file.read_bytes())
        receipt['localCleanupConfirmed'] = False
        receipt_file.write_bytes(encode(receipt))
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_jar_link_duplicate_wrong_bytes_and_ancestor_whiteout_are_denied(self):
        variants = [[(tools.JAR_PATH, b'', tarfile.SYMTYPE)], [(tools.JAR_PATH, b'', tarfile.LNKTYPE)], [(tools.JAR_PATH, self.jar, tarfile.REGTYPE)] * 2, [(tools.JAR_PATH, b'foreign', tarfile.REGTYPE)], [(tools.JAR_PATH, self.jar, tarfile.REGTYPE), ('opt/android/.wh..wh..opq', b'', tarfile.REGTYPE)], [('../foreign', b'x', tarfile.REGTYPE)], [('opt/android', b'', tarfile.SYMTYPE), (tools.JAR_PATH, self.jar, tarfile.REGTYPE)]]
        for entries in variants:
            with self.subTest(entries=entries):
                self.make_tools(entries)
                with self.assertRaises(ValueError):
                    self.prepare()
                self.assertFalse(self.output.exists())

    def test_jdk_traversal_absolute_duplicate_link_device_and_missing_runtime_are_denied(self):
        for name in ('../foreign', '/foreign', f'{tools.JDK_ROOT}/../foreign', f'{tools.JDK_ROOT}/bin/CON', f'{tools.JDK_ROOT}/bad:stream'):
            with self.subTest(name=name), zipfile.ZipFile(self.jdk, 'w') as archive:
                archive.writestr(name, b'foreign')
            with self.assertRaises(ValueError):
                self.prepare()
            self.assertFalse(self.output.exists())
        with zipfile.ZipFile(self.jdk, 'w') as archive:
            item = zipfile.ZipInfo(f'{tools.JDK_ROOT}/bin/java.exe')
            item.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(item, b'foreign')
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertFalse(self.output.exists())
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(self.jdk, 'w') as archive:
                archive.writestr(f'{tools.JDK_ROOT}/release', b'first')
                archive.writestr(f'{tools.JDK_ROOT}/release', b'duplicate')
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_missing_required_runtime_bytes_and_wrong_publisher_release_are_denied(self):
        for missing in (True, False):
            with self.subTest(missing=missing), zipfile.ZipFile(self.jdk, 'w') as archive:
                for name in ('bin/java.exe', 'bin/keytool.exe', 'bin/jarsigner.exe', 'bin/server/jvm.dll', 'lib/modules', 'release'):
                    if missing and name == 'bin/keytool.exe':
                        continue
                    archive.writestr(f'{tools.JDK_ROOT}/{name}', b'foreign release' if name == 'release' else b'synthetic')
            with self.assertRaises(ValueError):
                self.prepare()
            self.assertFalse(self.output.exists())

    def test_quotas_fail_closed_and_own_partial_output_is_removed(self):
        with self.pins(), patch.object(tools, 'MAX_RAW', 512), self.assertRaises(ValueError):
            tools.prepare(self.directory, self.jdk, self.output)
        with self.pins(), patch.object(tools, 'MAX_JDK', 1), self.assertRaises(ValueError):
            tools.prepare(self.directory, self.jdk, self.output)
        actual_hash = tools.hash_file
        def fail_output(path, maximum):
            if self.output in Path(path).parents:
                raise OSError('synthetic write verification failure')
            return actual_hash(path, maximum)
        with patch.object(tools, 'hash_file', side_effect=fail_output), self.assertRaises(OSError):
            self.prepare()
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.root.glob('.st253-public-tools-*')), [])

    def test_input_change_is_denied_before_output(self):
        original = tools.canonical_tools
        def mutate(directory, raw):
            validated = original(directory, raw)
            with (directory / 'receipt.json').open('ab') as stream:
                stream.write(b' ')
            return validated
        with patch.object(tools, 'canonical_tools', side_effect=mutate), self.assertRaises(ValueError):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_replaced_real_output_directory_is_never_recursively_removed(self):
        actual_hash = tools.hash_file
        moved = self.root / 'original-output-retained'
        foreign = self.output / 'foreign-marker'
        def replace_output(path, maximum):
            if self.output in Path(path).parents:
                self.output.rename(moved)
                self.output.mkdir()
                foreign.write_bytes(b'unknown directory must survive')
                raise OSError('synthetic verification failure after real-directory swap')
            return actual_hash(path, maximum)
        with patch.object(tools, 'hash_file', side_effect=replace_output), self.assertRaises(ValueError):
            self.prepare()
        self.assertEqual(foreign.read_bytes(), b'unknown directory must survive')
        self.assertTrue(moved.is_dir())
        self.assertFalse((self.output / 'public-tools.json').exists())
        self.assertFalse((moved / 'public-tools.json').exists())
        self.assertEqual(list(self.root.glob('.st253-public-tools-*')), [])


if __name__ == '__main__':
    unittest.main()

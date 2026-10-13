import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const plugin = require('../plugins/private-runtime-ca.cjs');
const root = mkdtempSync(join(tmpdir(), 'subtrack-ca-test-'));
const previous = process.env.SUBTRACK_PRIVATE_DEVICE_PROOF;
try {
  delete process.env.SUBTRACK_PRIVATE_DEVICE_PROOF;
  const config = { name: 'SubTrack' };
  assert.equal(
    plugin(config),
    config,
    'normal builds never install proof trust',
  );
  process.env.SUBTRACK_PRIVATE_DEVICE_PROOF = 'true';
  delete process.env.SUBTRACK_PRIVATE_CA_CERT;
  assert.throws(() => plugin(config), /absolute CA certificate path/);
  process.env.SUBTRACK_PRIVATE_CA_CERT = 'relative.pem';
  assert.throws(() => plugin(config), /absolute CA certificate path/);
  const key = join(root, 'key.pem');
  const cert = join(root, 'ca.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=SubTrack ephemeral synthetic proof CA',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-keyout',
      key,
      '-out',
      cert,
    ],
    { stdio: 'ignore' },
  );
  const android = join(root, 'android');
  mkdirSync(join(android, 'app/src/main'), { recursive: true });
  writeFileSync(
    join(android, 'app/src/main/AndroidManifest.xml'),
    '<manifest />',
  );
  plugin.writeDebugTrust(android, cert);
  assert.equal(
    readFileSync(join(android, 'app/src/main/AndroidManifest.xml'), 'utf8'),
    '<manifest />',
  );
  assert.equal(
    existsSync(join(android, 'app/src/main/res/raw/subtrack_private_ca.pem')),
    false,
  );
  assert.equal(existsSync(join(android, 'app/src/release')), false);
  const trust = readFileSync(
    join(android, 'app/src/debug/res/xml/subtrack_private_network.xml'),
    'utf8',
  );
  assert.match(trust, /<debug-overrides>/);
  assert.match(trust, /cleartextTrafficPermitted="false"/);
  assert.match(trust, /<domain includeSubdomains="false">localhost<\/domain>/);
  assert.equal(trust.includes('10.0.2.2'), false);
  assert.equal(
    readFileSync(
      join(android, 'app/src/debug/res/raw/subtrack_private_ca.pem'),
      'utf8',
    ),
    readFileSync(cert, 'utf8'),
  );
  assert.throws(() => plugin.writeDebugTrust(android, cert), /Conflicting/);
  assert.throws(() => plugin.writeDebugTrust(join(root, 'bad'), key));
  console.log(
    'Private native CA: inactive production config, fail-closed inputs, debug-only trust and conflict rejection PASS',
  );
} finally {
  if (previous === undefined) delete process.env.SUBTRACK_PRIVATE_DEVICE_PROOF;
  else process.env.SUBTRACK_PRIVATE_DEVICE_PROOF = previous;
  delete process.env.SUBTRACK_PRIVATE_CA_CERT;
  rmSync(root, { recursive: true, force: true });
}

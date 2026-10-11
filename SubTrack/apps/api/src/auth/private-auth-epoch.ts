import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, timingSafeEqual, type KeyObject } from 'node:crypto';
import { lstatSync, openSync, readFileSync, closeSync, writeFileSync, unlinkSync } from 'node:fs';

const FAILURE = 'Private authentication unavailable';
const TUPLE = Object.freeze({ database: 'st237_private_https_profile', origin: 'https://localhost:3443',
  login: 'subtrack_dev_auth_login', epoch: 'st237_private_https_v1' });
const LABELS = ['bootstrap.idempotencyKey', 'bootstrap.originKey', 'enrollment.binding', 'enrollment.idempotency',
  'enrollment.authority', 'enrollment.request', 'enrollment.nonce', 'enrollment.otp', 'enrollment.proof',
  'enrollment.person', 'enrollment.session', 'simulator.simulatorHmacKey'] as const;
const ENROLLMENT = ['binding', 'idempotency', 'authority', 'request', 'nonce', 'otp', 'proof', 'person', 'session'] as const;
const B64 = /^[A-Za-z0-9_-]+$/;
const HEX = /^[a-f0-9]{64}$/;
type Bundle = { version: 1; database: string; origin: string; login: string; epoch: string;
  keys: Record<string, string>; accessPrivatePkcs8Der: string; accessPublicSpkiDer: string; manifestHash: string };
export type PrivateAuthEpoch = Readonly<typeof TUPLE & { manifestHash: string;
  bootstrapKeys: Readonly<{ idempotencyKey: Uint8Array; originKey: Uint8Array }>;
  enrollmentKeys: Readonly<Record<typeof ENROLLMENT[number], Uint8Array>>;
  simulatorHmacKey: Uint8Array;
  accessKeyPair: Readonly<{ privateKey: KeyObject; publicKey: KeyObject }> }>;

function fail(): never { throw new Error(FAILURE); }
function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
  return value as Record<string, unknown>;
}
function decode(value: unknown, length?: number): Buffer {
  if (typeof value !== 'string' || !B64.test(value)) fail();
  const bytes = Buffer.from(value, 'base64url');
  if (!bytes.length || bytes.toString('base64url') !== value || length !== undefined && bytes.length !== length) fail();
  return bytes;
}
function frame(hash: ReturnType<typeof createHash>, label: string, value: Uint8Array): void {
  const name = Buffer.from(label, 'utf8');
  if (!name.length || name.length > 65535 || !value.length || value.length > 0xffffffff) fail();
  const header = Buffer.alloc(6);
  header.writeUInt16BE(name.length, 0);
  header.writeUInt32BE(value.length, 2);
  hash.update(header.subarray(0, 2)).update(name).update(header.subarray(2)).update(value);
}
function validate(raw: unknown): PrivateAuthEpoch {
  const b = exactObject(raw, ['version', 'database', 'origin', 'login', 'epoch', 'keys',
    'accessPrivatePkcs8Der', 'accessPublicSpkiDer', 'manifestHash']);
  if (b.version !== 1 || b.database !== TUPLE.database || b.origin !== TUPLE.origin ||
    b.login !== TUPLE.login || b.epoch !== TUPLE.epoch || typeof b.manifestHash !== 'string' || !HEX.test(b.manifestHash)) fail();
  const encoded = exactObject(b.keys, LABELS);
  const keys = LABELS.map(label => decode(encoded[label], 32));
  for (let i = 0; i < keys.length; i++) {
    if (keys[i]!.every(byte => byte === 0)) fail();
    for (let j = i + 1; j < keys.length; j++) if (timingSafeEqual(keys[i]!, keys[j]!)) fail();
  }
  const privateDer = decode(b.accessPrivatePkcs8Der);
  const publicDer = decode(b.accessPublicSpkiDer);
  const privateKey = createPrivateKey({ key: privateDer, format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey({ key: publicDer, format: 'der', type: 'spki' });
  if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519' ||
    !createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).equals(publicDer) ||
    !publicKey.export({ format: 'der', type: 'spki' }).equals(publicDer)) fail();
  const hash = createHash('sha256').update('subtrack:st237:private-auth-manifest:v1\0', 'ascii');
  for (const label of ['database', 'origin', 'login', 'epoch'] as const) frame(hash, label, Buffer.from(TUPLE[label], 'utf8'));
  LABELS.forEach((label, index) => frame(hash, label, keys[index]!));
  frame(hash, 'access.ed25519PublicSpkiDer', publicDer);
  const manifestHash = hash.digest('hex');
  if (manifestHash !== b.manifestHash) fail();
  const enrollmentKeys = Object.fromEntries(ENROLLMENT.map((name, index) => [name, Uint8Array.from(keys[index + 2]!)])) as Record<typeof ENROLLMENT[number], Uint8Array>;
  return Object.freeze({ ...TUPLE, manifestHash,
    bootstrapKeys: Object.freeze({ idempotencyKey: Uint8Array.from(keys[0]!), originKey: Uint8Array.from(keys[1]!) }),
    enrollmentKeys: Object.freeze(enrollmentKeys), simulatorHmacKey: Uint8Array.from(keys[11]!),
    accessKeyPair: Object.freeze({ privateKey, publicKey }) });
}
/** Creates the single disposable private bundle. Existing files are never replaced or regenerated. */
export function provisionPrivateAuthEpoch(filePath: string): PrivateAuthEpoch {
  if (process.env.NODE_ENV !== 'development' || typeof filePath !== 'string' || !filePath) fail();
  const pair = generateKeyPairSync('ed25519');
  const keys = Object.fromEntries(LABELS.map(label => [label, randomBytes(32).toString('base64url')]));
  const raw: Bundle = { version: 1, ...TUPLE, keys,
    accessPrivatePkcs8Der: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
    accessPublicSpkiDer: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), manifestHash: '0'.repeat(64) };
  // The calculated digest is independent of JSON serialization and is checked again by the normal loader.
  const hash = createHash('sha256').update('subtrack:st237:private-auth-manifest:v1\0', 'ascii');
  for (const label of ['database', 'origin', 'login', 'epoch'] as const) frame(hash, label, Buffer.from(TUPLE[label], 'utf8'));
  LABELS.forEach(label => frame(hash, label, decode(keys[label], 32)));
  frame(hash, 'access.ed25519PublicSpkiDer', decode(raw.accessPublicSpkiDer));
  raw.manifestHash = hash.digest('hex');
  const validated = validate(raw);
  let fd: number | undefined;
  try {
    fd = openSync(filePath, 'wx', 0o600);
    writeFileSync(fd, JSON.stringify(raw), { encoding: 'utf8' });
    closeSync(fd); fd = undefined;
    return loadPrivateAuthEpoch(filePath);
  } catch { if (fd !== undefined) { closeSync(fd); unlinkSync(filePath); } fail(); }
  finally { void validated; }
}
/** Reopens, checks custody, and independently recomputes the manifest on every startup. */
export function loadPrivateAuthEpoch(filePath: string): PrivateAuthEpoch {
  try {
    if (process.env.NODE_ENV !== 'development' || typeof filePath !== 'string' || !filePath) fail();
    const stat = lstatSync(filePath);
    if (!stat.isFile() || process.platform !== 'win32' &&
      ((stat.mode & 0o077) !== 0 || typeof process.getuid === 'function' && stat.uid !== process.getuid()) ||
      stat.size < 500 || stat.size > 10000) fail();
    const text = readFileSync(filePath, 'utf8');
    const raw: unknown = JSON.parse(text);
    if (JSON.stringify(raw) !== text) fail();
    return validate(raw);
  } catch { return fail(); }
}

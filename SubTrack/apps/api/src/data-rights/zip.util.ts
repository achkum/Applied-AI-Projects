import { deflateRawSync } from 'node:zlib';

// Minimal ZIP builder — no external dependencies.
// Produces a ZIP 2.0 archive with DEFLATE-compressed entries.

// ─── CRC-32 table ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[((c ^ (buf[i] ?? 0)) & 0xff) >>> 0]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ─── DOS time/date (zeroed — no last-modified semantics needed) ──────────────

const DOS_TIME = 0x0000;
const DOS_DATE = 0x0000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function u16le(n: number): Buffer {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32le(n: number): Buffer {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n, 0);
  return b;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 6 });
    const checksum = crc32(entry.data);
    const uncompressedSize = entry.data.length;
    const compressedSize = compressed.length;

    // ── Local file header ───────────────────────────────────────────────────
    const localHeader = Buffer.concat([
      u32le(0x04034b50),   // signature PK\x03\x04
      u16le(20),           // version needed: 2.0
      u16le(0),            // flags
      u16le(8),            // compression: DEFLATE
      u16le(DOS_TIME),
      u16le(DOS_DATE),
      u32le(checksum),
      u32le(compressedSize),
      u32le(uncompressedSize),
      u16le(nameBytes.length),
      u16le(0),            // extra field length
      nameBytes,
    ]);

    localParts.push(localHeader, compressed);
    const entrySize = localHeader.length + compressed.length;

    // ── Central directory header ────────────────────────────────────────────
    const centralHeader = Buffer.concat([
      u32le(0x02014b50),   // signature PK\x01\x02
      u16le(0x031e),       // version made by: UNIX + 3.0
      u16le(20),           // version needed
      u16le(0),            // flags
      u16le(8),            // compression: DEFLATE
      u16le(DOS_TIME),
      u16le(DOS_DATE),
      u32le(checksum),
      u32le(compressedSize),
      u32le(uncompressedSize),
      u16le(nameBytes.length),
      u16le(0),            // extra length
      u16le(0),            // comment length
      u16le(0),            // disk number start
      u16le(0),            // internal attributes
      u32le(0o100644 << 16), // external attributes: regular file 644
      u32le(localOffset),
      nameBytes,
    ]);

    centralParts.push(centralHeader);
    localOffset += entrySize;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const centralDirSize = centralDirBuf.length;
  const centralDirOffset = localOffset;

  // ── End of central directory record ────────────────────────────────────────
  const eocd = Buffer.concat([
    u32le(0x06054b50),   // signature PK\x05\x06
    u16le(0),            // disk number
    u16le(0),            // disk with CD start
    u16le(entries.length),
    u16le(entries.length),
    u32le(centralDirSize),
    u32le(centralDirOffset),
    u16le(0),            // comment length
  ]);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

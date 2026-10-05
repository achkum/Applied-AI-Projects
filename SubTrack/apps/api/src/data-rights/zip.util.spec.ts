import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildZip } from './zip.util';

describe('buildZip', () => {
  it('writes unsigned UNIX mode attributes and a consistent, valid DEFLATE entry', () => {
    const name = 'export.json';
    const payload = Buffer.from('{"subscriptions":[]}', 'utf8');
    const archive = buildZip([{ name, data: payload }]);

    const centralOffset = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(centralOffset).toBeGreaterThanOrEqual(0);

    const localOffset = archive.readUInt32LE(centralOffset + 42);
    expect(archive.readUInt32LE(localOffset)).toBe(0x04034b50);
    expect(archive.readUInt16LE(localOffset + 8)).toBe(8);
    expect(archive.readUInt16LE(centralOffset + 10)).toBe(8);

    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const checksum = archive.readUInt32LE(centralOffset + 16);
    const localName = archive.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    const centralNameLength = archive.readUInt16LE(centralOffset + 28);
    const centralName = archive.subarray(centralOffset + 46, centralOffset + 46 + centralNameLength);
    const localDataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = archive.subarray(localDataOffset, localDataOffset + compressedSize);
    const inflated = inflateRawSync(compressedData);

    expect(archive.readUInt32LE(centralOffset + 38)).toBe((0o100644 << 16) >>> 0);
    expect(archive.readUInt16LE(localOffset + 26)).toBe(centralNameLength);
    expect(localName).toEqual(Buffer.from(name, 'utf8'));
    expect(centralName).toEqual(localName);
    expect(archive.readUInt32LE(localOffset + 14)).toBe(checksum);
    expect(archive.readUInt32LE(localOffset + 18)).toBe(compressedSize);
    expect(archive.readUInt32LE(localOffset + 22)).toBe(uncompressedSize);
    expect(checksum).toBe(0xeee55c2e);
    expect(inflated).toEqual(payload);
    expect(inflated.length).toBe(uncompressedSize);
  });
});

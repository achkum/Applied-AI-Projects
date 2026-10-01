import { Injectable } from '@nestjs/common';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import type { KeyObject } from 'node:crypto';

const ACCESS_TOKEN_TTL_S = 15 * 60; // 15 minutes

export interface JwtClaims {
  sub: string; // identityId
  sid: string; // sessionId
  iat: number;
  exp: number;
}

function toBase64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Issues and verifies EdDSA (Ed25519) JWTs.
 *
 * Key material: if JWT_PRIVATE_KEY_PEM is set, loads that key (PKCS#8 PEM).
 * Otherwise, generates a fresh random key pair at startup — suitable for
 * single-process dev but NOT for horizontal scaling.
 */
@Injectable()
export class JwtService {
  private readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;

  constructor() {
    const pem = process.env['JWT_PRIVATE_KEY_PEM'];
    if (pem) {
      this.privateKey = createPrivateKey(pem);
      this.publicKey = createPublicKey(this.privateKey);
    } else {
      const pair = generateKeyPairSync('ed25519');
      this.privateKey = pair.privateKey;
      this.publicKey = pair.publicKey;
    }
  }

  issue(identityId: string, sessionId: string): string {
    const now = Math.floor(Date.now() / 1_000);
    const header = toBase64url(
      Buffer.from(JSON.stringify({ alg: 'EdDSA', crv: 'Ed25519', typ: 'JWT' })),
    );
    const payload = toBase64url(
      Buffer.from(
        JSON.stringify({
          sub: identityId,
          sid: sessionId,
          iat: now,
          exp: now + ACCESS_TOKEN_TTL_S,
        }),
      ),
    );
    const message = Buffer.from(`${header}.${payload}`);
    const sig = sign(null, message, this.privateKey);
    return `${header}.${payload}.${toBase64url(sig)}`;
  }

  verify(token: string): JwtClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed JWT: expected 3 dot-separated parts.');
    }
    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const sigB64 = parts[2]!;

    const message = Buffer.from(`${headerB64}.${payloadB64}`);
    const sig = fromBase64url(sigB64);
    const valid = verify(null, message, this.publicKey, sig);
    if (!valid) {
      throw new Error('JWT signature verification failed.');
    }

    const claims = JSON.parse(fromBase64url(payloadB64).toString('utf8')) as JwtClaims;
    const now = Math.floor(Date.now() / 1_000);
    if (claims.exp <= now) {
      throw new Error('JWT has expired.');
    }
    return claims;
  }
}

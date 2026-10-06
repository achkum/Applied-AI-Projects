import { BadRequestException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { IncomingMessage } from 'node:http';
import { TLSSocket } from 'node:tls';

export type V2BrowserEvidence = Readonly<{
  origin: string;
  isHttps: boolean;
  explicitLoopbackDevelopment: boolean;
  bindingCookie: string | null;
}>;

const unavailable = (): Error => new Error('Browser request unavailable');
const loopback = (host: string): boolean => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

function rawValues(request: IncomingMessage, name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name.toLowerCase()) {
      const value = request.rawHeaders[index + 1];
      if (value === undefined) throw unavailable();
      values.push(value);
    }
  }
  return values;
}

function validCanonicalOrigin(value: string): boolean {
  if (!value || value !== value.trim() || value === 'null' || value.includes('*')) return false;
  try {
    const url = new URL(value);
    return url.origin === value && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function bindingCookie(request: IncomingMessage, name: string): string | null {
  const headers = rawValues(request, 'cookie');
  let found: string | null = null;
  let count = 0;
  for (const header of headers) {
    for (const rawPart of header.split(';')) {
      const part = rawPart.replace(/^[\t ]+/, '');
      const equal = part.indexOf('=');
      const candidateName = equal < 0 ? part : part.slice(0, equal);
      if (candidateName !== name && candidateName.trim() !== name) continue;
      count++;
      if (equal < 0 || candidateName !== name) throw unavailable();
      const value = part.slice(equal + 1);
      if (!/^[\x21-\x7e]+$/.test(value) || /[;,"'\\]/.test(value)) throw unavailable();
      found = value;
    }
  }
  if (count > 1) throw unavailable();
  return found;
}

/** Extracts transport observations from Node's raw request and direct socket only. */
export function extractV2BrowserEvidence(
  request: IncomingMessage,
  config: Readonly<{ allowedOrigins: readonly string[]; bindingCookieName: string; allowLoopbackHttpDevelopment: boolean }>,
): V2BrowserEvidence {
  try {
    const origins = rawValues(request, 'origin');
    if (origins.length !== 1 || !validCanonicalOrigin(origins[0]!)) throw unavailable();
    const origin = origins[0]!;
    if (!config.allowedOrigins.includes(origin)) throw unavailable();
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw unavailable();
    const encrypted = request.socket instanceof TLSSocket;
    const peer = request.socket.remoteAddress;
    const explicitDevelopment = url.protocol === 'http:' && config.allowLoopbackHttpDevelopment &&
      loopback(url.hostname) && typeof peer === 'string' && (peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1');
    if ((url.protocol === 'https:' && !encrypted) || (url.protocol === 'http:' && (!explicitDevelopment || encrypted))) throw unavailable();
    return Object.freeze({ origin, isHttps: encrypted, explicitLoopbackDevelopment: explicitDevelopment, bindingCookie: bindingCookie(request, config.bindingCookieName) });
  } catch {
    throw unavailable();
  }
}

/** Adds private request context; it does not authenticate or authorize the request. */
export function v2BrowserContextMiddleware(config: Readonly<{ allowedOrigins: readonly string[]; bindingCookieName: string; allowLoopbackHttpDevelopment: boolean }>) {
  return (request: Request & { v2BrowserEvidence?: V2BrowserEvidence }, _response: Response, next: NextFunction): void => {
    try {
      request.v2BrowserEvidence = extractV2BrowserEvidence(request, config);
      next();
    } catch {
      next(new BadRequestException('Browser request unavailable'));
    }
  };
}

/** Namespace policy is applied before routing so responses and errors share it. */
export function v2NoStoreMiddleware(request: Request, response: Response, next: NextFunction): void {
  if (request.path === '/v2' || request.path.startsWith('/v2/')) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
  }
  next();
}

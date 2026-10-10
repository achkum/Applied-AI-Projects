import { UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { RequestContext } from '../../database/request-transaction';
import type {
  PrincipalResolver,
  VerifiedPrincipal,
} from './principal-resolver';

const principalKey = Symbol('verified principal');
const contextKey = Symbol('verified request context');
type GuardRequest = { rawHeaders?: unknown } & Record<symbol, unknown>;

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException('Unauthorized');
}

function attachment<T>(request: object, key: symbol): T {
  try {
    if (!Object.prototype.hasOwnProperty.call(request, key))
      throw unauthorized();
    return (request as Record<symbol, unknown>)[key] as T;
  } catch {
    throw unauthorized();
  }
}

export function getVerifiedPrincipal(
  request: object,
): Readonly<VerifiedPrincipal> {
  return attachment(request, principalKey);
}

export function getVerifiedRequestContext(
  request: object,
): Readonly<RequestContext> {
  return attachment(request, contextKey);
}

function clear(request: GuardRequest): void {
  // Attempt both removals even if an in-process caller has damaged one property.
  const principalRemoved = Reflect.deleteProperty(request, principalKey);
  const contextRemoved = Reflect.deleteProperty(request, contextKey);
  if (!principalRemoved || !contextRemoved) throw unauthorized();
}

function rawBearer(rawHeaders: unknown): string {
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0)
    throw unauthorized();
  let authorization: string | undefined;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name: unknown = rawHeaders[index];
    const value: unknown = rawHeaders[index + 1];
    if (typeof name !== 'string' || typeof value !== 'string')
      throw unauthorized();
    if (name.toLowerCase() === 'authorization') {
      if (authorization !== undefined) throw unauthorized();
      authorization = value;
    }
    if (name.toLowerCase() === 'cookie') {
      for (const cookie of value.split(';')) {
        const cookieName = cookie
          .split('=', 1)[0]!
          .replace(/^[ \t]+|[ \t]+$/g, '');
        if (cookieName === 'st_v2_access' || cookieName === 'st_v2_refresh')
          throw unauthorized();
      }
    }
  }
  if (authorization === undefined) throw unauthorized();
  const match = /^[ \t]*Bearer +[ \t]*([^\s,]+)[ \t]*$/i.exec(authorization);
  if (!match) throw unauthorized();
  return match[1]!;
}

/** Internal only: the separately contracted consumer owns production registration. */
export class AuthenticatedPrincipalGuard implements CanActivate {
  constructor(private readonly resolver: Pick<PrincipalResolver, 'resolve'>) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    let request: GuardRequest | undefined;
    try {
      if (execution.getType() !== 'http') throw unauthorized();
      request = execution.switchToHttp().getRequest<GuardRequest>();
      clear(request);
      const resolved = await this.resolver.resolve(
        rawBearer(request.rawHeaders),
      );
      const principal = Object.freeze({
        identityId: resolved.identityId,
        sessionId: resolved.sessionId,
      });
      const context = Object.freeze({ userId: principal.identityId });
      Object.defineProperty(request, principalKey, {
        value: principal,
        configurable: true,
      });
      Object.defineProperty(request, contextKey, {
        value: context,
        configurable: true,
      });
      return true;
    } catch {
      if (request) {
        try {
          clear(request);
        } catch {
          /* No internal failure detail is exposed. */
        }
      }
      throw unauthorized();
    }
  }
}

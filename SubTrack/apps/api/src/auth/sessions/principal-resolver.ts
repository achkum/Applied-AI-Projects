import { UnauthorizedException } from '@nestjs/common';
import type { RequestContext } from '../../database/request-transaction';
import type { JwtService } from './jwt.service';

export interface CurrentSessionOwnerSnapshot {
  session: {
    id: string;
    identityId: string;
    revokedAt: Date | null;
  } | null;
  identity: {
    id: string;
    deletedAt: Date | null;
  } | null;
}

export interface SessionOwnerReader {
  readCurrentSessionOwner(
    sessionId: string,
    context: Readonly<RequestContext>,
  ): Promise<CurrentSessionOwnerSnapshot | null>;
}

export interface VerifiedPrincipal {
  readonly identityId: string;
  readonly sessionId: string;
}

const UNAUTHORIZED = 'Unauthorized';

/** Internal core only. The reader must return one current-consistent scoped snapshot. */
export class PrincipalResolver {
  constructor(
    private readonly jwt: Pick<JwtService, 'verify'>,
    private readonly reader: SessionOwnerReader,
  ) {}

  async resolve(token: string): Promise<Readonly<VerifiedPrincipal>> {
    try {
      const claims = this.jwt.verify(token);
      const context = Object.freeze({ userId: claims.sub });
      const snapshot = await this.reader.readCurrentSessionOwner(
        claims.sid,
        context,
      );
      if (
        !snapshot ||
        !snapshot.session ||
        !snapshot.identity ||
        snapshot.session.id !== claims.sid ||
        snapshot.session.identityId !== claims.sub ||
        snapshot.session.revokedAt !== null ||
        snapshot.identity.id !== claims.sub ||
        snapshot.identity.deletedAt !== null
      ) {
        throw new Error();
      }
      return Object.freeze({
        identityId: snapshot.identity.id,
        sessionId: snapshot.session.id,
      });
    } catch {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
  }
}

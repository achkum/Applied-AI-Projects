import { Injectable, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { IdentityProvider, IdentityResult } from './identity-provider.interface';

export interface RegisterOrLoginResult {
  /** Whether this was a new registration or an existing login. */
  action: 'registered' | 'logged_in';
  identityId: string;
}

@Injectable()
export class IdentityProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: IdentityProvider,
  ) {}

  /**
   * Verify a provider token and register or log in the resulting identity.
   * If a row with the same personnummerHmac already exists → log_in (AC3).
   * Otherwise → create new Identity row with only safe fields (AC2).
   */
  async verifyAndRegister(token: string): Promise<RegisterOrLoginResult> {
    let result: IdentityResult;
    try {
      result = await this.provider.verify(token);
    } catch (err) {
      throw new UnprocessableEntityException(
        err instanceof Error ? err.message : 'Identity verification failed.',
      );
    }

    // Check for existing identity by HMAC (deduplication — AC3)
    const existing = await this.prisma.identity.findFirst({
      where: { externalId: result.personnummerHmac },
      select: { id: true },
    });

    if (existing) {
      return { action: 'logged_in', identityId: existing.id };
    }

    // Persist new identity — only method, name (externalId=HMAC), verifiedAt (AC2)
    // Raw personnummer is not persisted; name is safe to store per PRODUCT_SPEC §F1.2.
    const created = await this.prisma.identity.create({
      data: {
        externalId: result.personnummerHmac,
        authMethod: result.method === 'BANKID' ? 'BANKID' : 'MOCK',
        // email/phone are null until separately provided
      },
      select: { id: true },
    });

    return { action: 'registered', identityId: created.id };
  }
}

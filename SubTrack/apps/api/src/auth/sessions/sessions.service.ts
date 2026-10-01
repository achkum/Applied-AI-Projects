import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { JwtService } from './jwt.service';
import type { DeviceInfo, SessionTokenPair } from './sessions.dto';

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Create a new session after successful OTP/BankID authentication. */
  async createSession(identityId: string, deviceName: string): Promise<SessionTokenPair> {
    const refreshToken = generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        identityId,
        deviceName,
        refreshTokenHash: hashRefreshToken(refreshToken),
        familyId: randomUUID(),
        generation: 0,
      },
    });

    return {
      accessToken: this.jwt.issue(identityId, session.id),
      refreshToken,
    };
  }

  /**
   * Rotate a refresh token.
   *
   * AC2: presenting a revoked token revokes the entire family and requires
   * reauthentication.
   */
  async refresh(incomingToken: string): Promise<SessionTokenPair> {
    const hash = hashRefreshToken(incomingToken);
    const existing = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (existing.revokedAt !== null) {
      // Reuse of a revoked token: revoke the entire family (AC2).
      await this.prisma.session.updateMany({
        where: { familyId: existing.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Refresh token reuse detected. All sessions in this family have been revoked.',
      );
    }

    const now = new Date();
    const newRefreshToken = generateRefreshToken();

    const [, newSession] = await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: existing.id },
        data: { revokedAt: now },
      }),
      this.prisma.session.create({
        data: {
          identityId: existing.identityId,
          deviceName: existing.deviceName,
          refreshTokenHash: hashRefreshToken(newRefreshToken),
          familyId: existing.familyId,
          generation: existing.generation + 1,
          lastUsedAt: now,
        },
      }),
    ]);

    return {
      accessToken: this.jwt.issue(newSession.identityId, newSession.id),
      refreshToken: newRefreshToken,
    };
  }

  /** List active (non-revoked) sessions for a user. AC4: only own devices. */
  async listDevices(callerId: string): Promise<DeviceInfo[]> {
    return this.prisma.session.findMany({
      where: { identityId: callerId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
    });
  }

  /** Revoke a specific session. AC3: revoke one device without affecting others. */
  async revokeDevice(sessionId: string, callerId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, identityId: true, revokedAt: true },
    });

    if (!session || session.identityId !== callerId) {
      throw new NotFoundException('Session not found.');
    }

    if (session.revokedAt !== null) {
      return; // Already revoked — idempotent.
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }
}

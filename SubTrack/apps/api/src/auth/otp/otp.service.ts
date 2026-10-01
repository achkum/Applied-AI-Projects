import { Injectable, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { devInboxSend } from './dev-inbox';

const OTP_TTL_MS        = 10 * 60 * 1_000; // 10 minutes
const RESEND_COOLDOWN_S = 30;               // minimum seconds between sends
const MAX_SENDS_PER_HR  = 6;               // 1 initial + 5 resends
const MAX_ATTEMPTS      = 5;               // wrong-code attempts before lockout
const LOCK_DURATION_MS  = 15 * 60 * 1_000; // 15 minutes lockout

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(code: string, salt: string): string {
  return createHash('sha256').update(code + salt).digest('hex');
}

function freshSalt(): string {
  return randomBytes(16).toString('hex');
}

@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Request a new OTP for an identifier.
   * Creates a new challenge or increments the resend counter on an existing one.
   */
  async requestOtp(identifier: string, nodeEnv: string): Promise<void> {
    if (nodeEnv === 'production') {
      // Real SMTP/SMS delivery not implemented; dev adapter only.
      throw new Error('Real OTP delivery is not configured for production yet.');
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - 60 * 60 * 1_000);

    // Find the most recent non-expired challenge for this identifier.
    const existing = await this.prisma.otpChallenge.findFirst({
      where: {
        identifier,
        expiresAt: { gt: now },
        verifiedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      // Resend cooldown: reject if last send was < 30s ago
      const secondsSinceLast =
        (now.getTime() - existing.lastSentAt.getTime()) / 1_000;
      if (secondsSinceLast < RESEND_COOLDOWN_S) {
        throw new BadRequestException(
          `OTP was sent recently. Please wait ${Math.ceil(RESEND_COOLDOWN_S - secondsSinceLast)} seconds before requesting again.`,
        );
      }

      // Hourly send limit: sum of send_count across all challenges in the window
      const hourlySends = await this.prisma.otpChallenge.aggregate({
        _sum: { sendCount: true },
        where: { identifier, createdAt: { gte: windowStart } },
      });
      const totalSends = hourlySends._sum.sendCount ?? 0;
      if (totalSends >= MAX_SENDS_PER_HR) {
        throw new BadRequestException(
          'OTP send limit reached. Please try again in an hour.',
        );
      }

      // Refresh the code and extend expiry
      const salt = freshSalt();
      const code = generateCode();
      await this.prisma.otpChallenge.update({
        where: { id: existing.id },
        data: {
          codeHash:    hashCode(code, salt),
          salt,
          expiresAt:   new Date(now.getTime() + OTP_TTL_MS),
          sendCount:   { increment: 1 },
          lastSentAt:  now,
          attemptCount: 0,
          lockedUntil: null,
        },
      });
      devInboxSend(identifier, code);
      return;
    }

    // No active challenge — create a new one
    const salt = freshSalt();
    const code = generateCode();
    await this.prisma.otpChallenge.create({
      data: {
        identifier,
        codeHash:  hashCode(code, salt),
        salt,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        sendCount: 1,
        lastSentAt: now,
      },
    });
    devInboxSend(identifier, code);
  }

  /**
   * Verify a submitted OTP code.
   * Returns true on success; throws BadRequest/UnprocessableEntity on failure.
   */
  async verifyOtp(identifier: string, code: string): Promise<{ verified: true }> {
    const now = new Date();

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        identifier,
        verifiedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new UnprocessableEntityException('No pending OTP challenge found for this identifier.');
    }

    // Lockout check
    if (challenge.lockedUntil && challenge.lockedUntil > now) {
      const remainingS = Math.ceil(
        (challenge.lockedUntil.getTime() - now.getTime()) / 1_000,
      );
      throw new BadRequestException(
        `Identifier is locked due to too many failed attempts. Try again in ${remainingS} seconds.`,
      );
    }

    // Expiry check
    if (challenge.expiresAt <= now) {
      throw new UnprocessableEntityException('OTP has expired. Please request a new one.');
    }

    // Verify code
    const expected = hashCode(code, challenge.salt);
    if (expected !== challenge.codeHash) {
      const newAttempts = challenge.attemptCount + 1;
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptCount: newAttempts,
          ...(newAttempts >= MAX_ATTEMPTS
            ? { lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) }
            : {}),
        },
      });
      if (newAttempts >= MAX_ATTEMPTS) {
        throw new BadRequestException(
          'Too many failed attempts. Identifier is locked for 15 minutes.',
        );
      }
      throw new BadRequestException('Invalid OTP code.');
    }

    // Mark as verified — code is consumed
    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { verifiedAt: now },
    });

    return { verified: true };
  }
}

-- Migration: 0002_otp_challenge
-- Creates the otp_challenge table used by the OTP authentication service.
-- No FK to identity: challenges are created before an identity exists.
-- Not RLS-protected: accessed only via service-role connection.

CREATE TABLE "otp_challenge" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "identifier"    VARCHAR(320) NOT NULL,
  "code_hash"     CHAR(64)     NOT NULL,
  "salt"          CHAR(32)     NOT NULL,
  "expires_at"    TIMESTAMPTZ  NOT NULL,
  "send_count"    INTEGER      NOT NULL DEFAULT 1,
  "last_sent_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "attempt_count" INTEGER      NOT NULL DEFAULT 0,
  "locked_until"  TIMESTAMPTZ,
  "verified_at"   TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "otp_challenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otp_challenge_identifier_idx" ON "otp_challenge" ("identifier");
CREATE INDEX "otp_challenge_created_at_idx" ON "otp_challenge" ("created_at");

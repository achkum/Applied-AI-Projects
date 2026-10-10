-- BUG-008b generated baseline. Prisma 6.19.2:
-- pnpm exec prisma migrate diff --from-empty --to-schema-datamodel=prisma/schema.prisma --script
-- Accepted Phase A schema SHA256 EE08405408AD04D5917263FEDE3FF09604EAFEFD40ED37DD1811669D92E20AEC.
-- Generated body SHA256 before this header 4A4849B4010C4E6FF55DFC5DB42958839C1A7D6471FBE56441BD1A644C57F50B.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "auth_method" AS ENUM ('BANKID', 'OTP', 'MOCK');

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('ADMIN', 'MEMBER', 'DEPENDANT');

-- CreateEnum
CREATE TYPE "invitation_channel" AS ENUM ('LINK', 'CODE', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "consent_scope_type" AS ENUM ('HOUSEHOLD');

-- CreateEnum
CREATE TYPE "subscription_cadence" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('DETECTED', 'TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "subscription_source" AS ENUM ('DETECTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "bank_provider" AS ENUM ('TINK_SANDBOX', 'SYNTHETIC', 'TINK_LIVE');

-- CreateEnum
CREATE TYPE "bank_connection_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('PENDING', 'BOOKED');

-- CreateEnum
CREATE TYPE "catalogue_plan_source" AS ENUM ('SEED', 'SCRAPER', 'MANUAL');

-- CreateEnum
CREATE TYPE "charge_matched_by" AS ENUM ('ENGINE', 'USER');

-- CreateTable
CREATE TABLE "identity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_id" VARCHAR(255),
    "auth_method" "auth_method" NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "device_name" VARCHAR(120) NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_member" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "role" "member_role" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "household_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "invitee_id" UUID,
    "channel" "invitation_channel" NOT NULL,
    "recipient" VARCHAR(320),
    "token_hash" VARCHAR(64),
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "scope_id" UUID NOT NULL,
    "scope_type" "consent_scope_type" NOT NULL,
    "open_book" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" VARCHAR(320) NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "salt" CHAR(32) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID NOT NULL,
    "household_id" UUID,
    "event_type" VARCHAR(80) NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "merchant_id" UUID,
    "catalog_plan_id" UUID,
    "paying_account_id" UUID,
    "custom_name" VARCHAR(120),
    "category_code" VARCHAR(50) NOT NULL,
    "cadence" "subscription_cadence" NOT NULL,
    "expected_amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'DETECTED',
    "source" "subscription_source" NOT NULL,
    "confidence" DECIMAL(5,4),
    "detection_reasons" JSONB,
    "next_charge_date" DATE,
    "always_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_share" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "shared_by" UUID NOT NULL,
    "shared_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "subscription_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_connection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "provider" "bank_provider" NOT NULL,
    "provider_connection_id" VARCHAR(255),
    "institution_id" VARCHAR(255) NOT NULL,
    "institution_name" VARCHAR(120) NOT NULL,
    "status" "bank_connection_status" NOT NULL,
    "consent_expires_at" TIMESTAMPTZ(6),
    "encrypted_credentials" BYTEA,
    "last_synced_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "provider_account_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "account_type" NOT NULL,
    "iban_last4" CHAR(4),
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_transaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "provider_transaction_id" VARCHAR(255) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "original_amount_minor" BIGINT,
    "original_currency" CHAR(3),
    "transaction_date" DATE NOT NULL,
    "booked_at" TIMESTAMPTZ(6),
    "value_date" DATE,
    "status" "transaction_status" NOT NULL,
    "raw_description" VARCHAR(500) NOT NULL,
    "merchant_id" UUID,
    "provider_category" VARCHAR(120),
    "is_refund" BOOLEAN NOT NULL,
    "dedupe_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "raw_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "canonical_name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "category_code" VARCHAR(50) NOT NULL,
    "aliases" JSONB NOT NULL,
    "logo_url" VARCHAR(255),
    "website" VARCHAR(255),
    "country" CHAR(2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "plan_name" VARCHAR(120) NOT NULL,
    "cadence" "subscription_cadence" NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "market" VARCHAR(10) NOT NULL,
    "features" JSONB,
    "source_url" VARCHAR(255),
    "verified_at" TIMESTAMPTZ(6),
    "source" "catalogue_plan_source" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalogue_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_charge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "raw_transaction_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "charged_at" DATE NOT NULL,
    "matched_by" "charge_matched_by",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_charge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_external_id_key" ON "identity"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_email_key" ON "identity"("email");

-- CreateIndex
CREATE UNIQUE INDEX "identity_phone_key" ON "identity"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "session_refresh_token_hash_key" ON "session"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "session_identity_id_idx" ON "session"("identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "household_member_household_id_identity_id_key" ON "household_member"("household_id", "identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_hash_key" ON "invitation"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "consent_identity_id_scope_id_scope_type_key" ON "consent"("identity_id", "scope_id", "scope_type");

-- CreateIndex
CREATE INDEX "otp_challenge_identifier_idx" ON "otp_challenge"("identifier");

-- CreateIndex
CREATE INDEX "otp_challenge_created_at_idx" ON "otp_challenge"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "audit_log_household_id_idx" ON "audit_log"("household_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "subscription_identity_id_idx" ON "subscription"("identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_id_identity_id_key" ON "subscription"("id", "identity_id");

-- CreateIndex
CREATE INDEX "subscription_share_subscription_id_idx" ON "subscription_share"("subscription_id");

-- CreateIndex
CREATE INDEX "subscription_share_household_id_idx" ON "subscription_share"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_connection_id_identity_id_key" ON "bank_connection"("id", "identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_connection_identity_id_provider_provider_connection_id_key" ON "bank_connection"("identity_id", "provider", "provider_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_account_id_identity_id_key" ON "bank_account"("id", "identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_account_connection_id_provider_account_id_key" ON "bank_account"("connection_id", "provider_account_id");

-- CreateIndex
CREATE INDEX "raw_transaction_account_id_transaction_date_idx" ON "raw_transaction"("account_id", "transaction_date");

-- CreateIndex
CREATE UNIQUE INDEX "raw_transaction_id_identity_id_key" ON "raw_transaction"("id", "identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_transaction_account_id_provider_transaction_id_key" ON "raw_transaction"("account_id", "provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_slug_key" ON "merchant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_charge_raw_transaction_id_key" ON "subscription_charge"("raw_transaction_id");

-- CreateIndex
CREATE INDEX "subscription_charge_subscription_id_charged_at_idx" ON "subscription_charge"("subscription_id", "charged_at");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_identity_fkey" FOREIGN KEY ("identity_id") REFERENCES "identity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "identity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_catalog_plan_id_fkey" FOREIGN KEY ("catalog_plan_id") REFERENCES "catalogue_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_paying_account_id_identity_id_fkey" FOREIGN KEY ("paying_account_id", "identity_id") REFERENCES "bank_account"("id", "identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_share" ADD CONSTRAINT "subscription_share_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_share" ADD CONSTRAINT "subscription_share_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_share" ADD CONSTRAINT "subscription_share_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connection" ADD CONSTRAINT "bank_connection_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_connection_id_identity_id_fkey" FOREIGN KEY ("connection_id", "identity_id") REFERENCES "bank_connection"("id", "identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_transaction" ADD CONSTRAINT "raw_transaction_account_id_identity_id_fkey" FOREIGN KEY ("account_id", "identity_id") REFERENCES "bank_account"("id", "identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_transaction" ADD CONSTRAINT "raw_transaction_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_transaction" ADD CONSTRAINT "raw_transaction_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_plan" ADD CONSTRAINT "catalogue_plan_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_charge" ADD CONSTRAINT "subscription_charge_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_charge" ADD CONSTRAINT "subscription_charge_subscription_id_identity_id_fkey" FOREIGN KEY ("subscription_id", "identity_id") REFERENCES "subscription"("id", "identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_charge" ADD CONSTRAINT "subscription_charge_raw_transaction_id_identity_id_fkey" FOREIGN KEY ("raw_transaction_id", "identity_id") REFERENCES "raw_transaction"("id", "identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

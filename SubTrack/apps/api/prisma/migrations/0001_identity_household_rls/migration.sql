-- Migration: 0001_identity_household_rls
-- Creates five core tables with Row-Level Security policies enforcing the
-- SubTrack privacy model (ASSUMPTIONS.md A1–A3).
--
-- RLS pattern: every protected table has a policy that reads the session
-- variable app.current_user_id (set per-request via SET LOCAL before any DML).
-- See ADR-0003 for the per-request transaction strategy.

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

CREATE TYPE "auth_method" AS ENUM ('BANKID', 'OTP', 'MOCK');
CREATE TYPE "member_role" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "invitation_channel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');
CREATE TYPE "consent_scope_type" AS ENUM ('HOUSEHOLD');

-- ---------------------------------------------------------------------------
-- IDENTITY
-- ---------------------------------------------------------------------------

CREATE TABLE "identity" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "external_id" VARCHAR(255) UNIQUE,
    "auth_method" "auth_method" NOT NULL,
    "email"       VARCHAR(320) UNIQUE,
    "phone"       VARCHAR(20)  UNIQUE,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "deleted_at"  TIMESTAMPTZ(6),
    CONSTRAINT "identity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "identity" ENABLE ROW LEVEL SECURITY;
-- A user may read/write only their own identity row.
CREATE POLICY "identity_self"
    ON "identity"
    USING (id = current_setting('app.current_user_id')::uuid);

-- ---------------------------------------------------------------------------
-- HOUSEHOLD
-- ---------------------------------------------------------------------------

CREATE TABLE "household" (
    "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
    "name"       VARCHAR(120)  NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "household_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "household" ENABLE ROW LEVEL SECURITY;
-- Visible to all current members of the household.
CREATE POLICY "household_members_can_read"
    ON "household"
    USING (
        id IN (
            SELECT household_id FROM household_member
            WHERE identity_id = current_setting('app.current_user_id')::uuid
              AND left_at IS NULL
        )
    );

-- ---------------------------------------------------------------------------
-- HOUSEHOLD_MEMBER
-- ---------------------------------------------------------------------------

CREATE TABLE "household_member" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID         NOT NULL,
    "identity_id"  UUID         NOT NULL,
    "role"         "member_role" NOT NULL DEFAULT 'MEMBER',
    "joined_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "left_at"      TIMESTAMPTZ(6),
    CONSTRAINT "household_member_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "household_member_household_id_fkey"
        FOREIGN KEY ("household_id") REFERENCES "household"("id"),
    CONSTRAINT "household_member_identity_id_fkey"
        FOREIGN KEY ("identity_id") REFERENCES "identity"("id"),
    -- Prisma @unique enforces no duplicate (household_id, identity_id) pairs.
    -- The partial index below enforces at most one *active* membership per user.
    CONSTRAINT "household_member_household_id_identity_id_key"
        UNIQUE ("household_id", "identity_id")
);

-- Partial unique index: a user may only be an active member of one household.
CREATE UNIQUE INDEX "household_member_active_membership_idx"
    ON "household_member" ("identity_id")
    WHERE left_at IS NULL;

ALTER TABLE "household_member" ENABLE ROW LEVEL SECURITY;
-- A member can see their own household's roster; only admins may update roles.
CREATE POLICY "household_member_read"
    ON "household_member"
    FOR SELECT
    USING (
        household_id IN (
            SELECT household_id FROM household_member
            WHERE identity_id = current_setting('app.current_user_id')::uuid
              AND left_at IS NULL
        )
    );
CREATE POLICY "household_member_write_self"
    ON "household_member"
    FOR INSERT
    WITH CHECK (
        identity_id = current_setting('app.current_user_id')::uuid
    );
CREATE POLICY "household_member_update_admin"
    ON "household_member"
    FOR UPDATE
    USING (
        household_id IN (
            SELECT household_id FROM household_member
            WHERE identity_id = current_setting('app.current_user_id')::uuid
              AND role = 'ADMIN'
              AND left_at IS NULL
        )
    );

-- ---------------------------------------------------------------------------
-- INVITATION
-- ---------------------------------------------------------------------------

CREATE TABLE "invitation" (
    "id"           UUID               NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID               NOT NULL,
    "inviter_id"   UUID               NOT NULL,
    "invitee_id"   UUID,
    "channel"      "invitation_channel" NOT NULL,
    "recipient"    VARCHAR(320)       NOT NULL,
    "status"       "invitation_status" NOT NULL DEFAULT 'PENDING',
    "expires_at"   TIMESTAMPTZ(6)     NOT NULL,
    "created_at"   TIMESTAMPTZ(6)     NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ(6)     NOT NULL DEFAULT NOW(),
    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invitation_household_id_fkey"
        FOREIGN KEY ("household_id") REFERENCES "household"("id"),
    CONSTRAINT "invitation_inviter_id_fkey"
        FOREIGN KEY ("inviter_id") REFERENCES "identity"("id"),
    CONSTRAINT "invitation_invitee_id_fkey"
        FOREIGN KEY ("invitee_id") REFERENCES "identity"("id")
);

ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;
-- Inviter sees their outgoing invitations; invitee sees theirs; admins see all for their household.
CREATE POLICY "invitation_access"
    ON "invitation"
    USING (
        inviter_id  = current_setting('app.current_user_id')::uuid
        OR invitee_id = current_setting('app.current_user_id')::uuid
        OR household_id IN (
            SELECT household_id FROM household_member
            WHERE identity_id = current_setting('app.current_user_id')::uuid
              AND role = 'ADMIN'
              AND left_at IS NULL
        )
    );

-- ---------------------------------------------------------------------------
-- CONSENT
-- ---------------------------------------------------------------------------

CREATE TABLE "consent" (
    "id"          UUID               NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID               NOT NULL,
    "scope_id"    UUID               NOT NULL,
    "scope_type"  "consent_scope_type" NOT NULL,
    "open_book"   BOOLEAN            NOT NULL DEFAULT FALSE,
    "created_at"  TIMESTAMPTZ(6)     NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ(6)     NOT NULL DEFAULT NOW(),
    CONSTRAINT "consent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consent_identity_id_fkey"
        FOREIGN KEY ("identity_id") REFERENCES "identity"("id"),
    CONSTRAINT "consent_identity_id_scope_id_scope_type_key"
        UNIQUE ("identity_id", "scope_id", "scope_type")
);

ALTER TABLE "consent" ENABLE ROW LEVEL SECURITY;
-- Each user may only read/write their own consent rows — not shared with household peers.
CREATE POLICY "consent_self"
    ON "consent"
    USING (identity_id = current_setting('app.current_user_id')::uuid);

-- ---------------------------------------------------------------------------
-- AUDIT_LOG
-- ---------------------------------------------------------------------------

CREATE TABLE "audit_log" (
    "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
    "actor_id"     UUID          NOT NULL,
    "household_id" UUID,
    "event_type"   VARCHAR(80)   NOT NULL,
    "payload"      JSONB,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_log_actor_id_fkey"
        FOREIGN KEY ("actor_id") REFERENCES "identity"("id"),
    CONSTRAINT "audit_log_household_id_fkey"
        FOREIGN KEY ("household_id") REFERENCES "household"("id")
);

CREATE INDEX "audit_log_actor_id_idx"      ON "audit_log" ("actor_id");
CREATE INDEX "audit_log_household_id_idx"  ON "audit_log" ("household_id");
CREATE INDEX "audit_log_created_at_idx"    ON "audit_log" ("created_at");

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated user may append their own entries.
CREATE POLICY "audit_log_insert"
    ON "audit_log"
    FOR INSERT
    WITH CHECK (actor_id = current_setting('app.current_user_id')::uuid);

-- SELECT: own entries + all entries for households where requester is an admin.
CREATE POLICY "audit_log_select"
    ON "audit_log"
    FOR SELECT
    USING (
        actor_id = current_setting('app.current_user_id')::uuid
        OR (
            household_id IS NOT NULL
            AND household_id IN (
                SELECT household_id FROM household_member
                WHERE identity_id = current_setting('app.current_user_id')::uuid
                  AND role = 'ADMIN'
                  AND left_at IS NULL
            )
        )
    );

-- UPDATE and DELETE are denied for all roles — audit_log is append-only.
-- No UPDATE/DELETE policy means Postgres denies these operations under RLS.

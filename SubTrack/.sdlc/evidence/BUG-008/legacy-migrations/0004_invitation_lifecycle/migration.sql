-- Migration: 0004_invitation_lifecycle
-- Extends the invitation table for the full ST-047 lifecycle:
--   • Adds LINK and CODE channels (LINK = shareable URL token, CODE = short-code token)
--   • Adds token_hash column (SHA-256 hex of the raw 32-byte opaque token)
--   • Makes recipient nullable (LINK/CODE invites have no specific recipient)
--
-- Token model: the service generates 32 random bytes, hex-encodes the raw token
-- for the invitee, and stores only SHA-256(raw_token) in token_hash.
-- Preview/accept/decline look up by token_hash — the raw token is never stored.
--
-- Branch note: depends on 0003_household_dependant_role (ST-046 branch).
-- Renumber as needed on merge to main.

-- ---------------------------------------------------------------------------
-- 1. Extend invitation_channel enum
-- ---------------------------------------------------------------------------
-- ALTER TYPE ... ADD VALUE is irreversible in PostgreSQL (cannot be rolled back
-- inside a transaction), but is safe to apply idempotently when using
-- IF NOT EXISTS (pg >= 14.3). Listed explicitly for clarity.

ALTER TYPE "invitation_channel" ADD VALUE IF NOT EXISTS 'LINK';
ALTER TYPE "invitation_channel" ADD VALUE IF NOT EXISTS 'CODE';

-- ---------------------------------------------------------------------------
-- 2. Extend invitation table
-- ---------------------------------------------------------------------------

-- Make recipient nullable: LINK/CODE invitations have no specific email/phone.
ALTER TABLE "invitation"
    ALTER COLUMN "recipient" DROP NOT NULL;

-- Add token_hash: SHA-256 hex of the raw invite token. Unique so lookup by
-- hash is safe (no two active tokens can collide).
ALTER TABLE "invitation"
    ADD COLUMN IF NOT EXISTS "token_hash" VARCHAR(64) UNIQUE;

-- Index for preview/accept/decline lookups by token hash.
CREATE INDEX IF NOT EXISTS "invitation_token_hash_idx"
    ON "invitation" ("token_hash")
    WHERE "token_hash" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS addendum
-- ---------------------------------------------------------------------------
-- The base invitation_access policy (created in 0001_identity_household_rls)
-- covers SELECT for inviter, invitee, and household admins.
-- We add explicit INSERT and UPDATE policies here for lifecycle operations.

-- INSERT: only authenticated household admins may create invitations.
CREATE POLICY "invitation_insert"
    ON "invitation"
    FOR INSERT
    WITH CHECK (
        inviter_id = current_setting('app.current_user_id')::uuid
        AND household_id IN (
            SELECT household_id FROM household_member
            WHERE identity_id = current_setting('app.current_user_id')::uuid
              AND role = 'ADMIN'
              AND left_at IS NULL
        )
    );

-- UPDATE: inviter or household admin may revoke; invitee may accept/decline.
CREATE POLICY "invitation_update"
    ON "invitation"
    FOR UPDATE
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

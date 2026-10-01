-- Migration: 0003_session
-- Adds the session table for EdDSA JWT + opaque refresh token sessions.
--
-- Design:
--   - Access tokens are short-lived EdDSA JWTs; not stored in the database.
--   - The opaque refresh token is 32 random bytes (stored as SHA-256 hex).
--   - Rotation: presenting a valid refresh token creates a new session row
--     (generation+1) in the same family and revokes the old row.
--   - Reuse detection: presenting a revoked token triggers a family-wide
--     revocation and forces reauthentication (AC2).
--   - RLS ensures a user can only see their own sessions (AC4).
--
-- See apps/api/src/auth/sessions/sessions.service.ts for the application logic.

CREATE TABLE "session" (
    "id"                  UUID           NOT NULL DEFAULT gen_random_uuid(),
    "identity_id"         UUID           NOT NULL,
    "device_name"         VARCHAR(120)   NOT NULL,
    -- SHA-256 hex of the 32-byte opaque refresh token; unique to prevent hash collisions.
    "refresh_token_hash"  VARCHAR(64)    NOT NULL,
    -- Tokens within a rotation family share this id; used for family-wide revocation.
    "family_id"           UUID           NOT NULL,
    "generation"          INT            NOT NULL DEFAULT 0,
    "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "last_used_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "revoked_at"          TIMESTAMPTZ(6),
    CONSTRAINT "session_pkey"                    PRIMARY KEY ("id"),
    CONSTRAINT "session_refresh_token_hash_key"  UNIQUE      ("refresh_token_hash"),
    CONSTRAINT "session_identity_fkey"
        FOREIGN KEY ("identity_id") REFERENCES "identity" ("id")
);

CREATE INDEX "session_identity_id_idx" ON "session" ("identity_id");

ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;

-- SELECT: user may only read their own sessions (AC4 — only own devices returned).
CREATE POLICY "session_self"
    ON "session"
    USING (identity_id = current_setting('app.current_user_id')::uuid);

-- INSERT: user may only create their own sessions.
CREATE POLICY "session_insert"
    ON "session"
    FOR INSERT
    WITH CHECK (identity_id = current_setting('app.current_user_id')::uuid);

-- UPDATE: user may only revoke their own sessions (revokedAt mutation).
CREATE POLICY "session_update"
    ON "session"
    FOR UPDATE
    USING (identity_id = current_setting('app.current_user_id')::uuid);

-- DELETE: no hard deletes; rows are kept as audit trail.

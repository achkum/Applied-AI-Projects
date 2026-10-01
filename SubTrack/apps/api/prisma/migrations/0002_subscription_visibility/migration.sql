-- Migration: 0002_subscription_visibility
-- Adds subscription and subscription_share tables with RLS policies that mirror
-- the TypeScript SubscriptionVisibilityPolicy in packages/domain/policy/.
--
-- Visibility rule (DATA_MODEL.md §Visibility rule):
--   Member M may see subscription S owned by U iff:
--     1. M is U (owner), OR
--     2. There is an active subscription_share for S in a household M belongs to, OR
--     3. U has open_book consent in a household M also belongs to, AND S.always_private = false.
--
-- Transactions/balances are always private to the owner; this migration does not
-- create a transaction table (banking milestone). The RLS policy here covers
-- the subscription and subscription_share tables only.
--
-- Branch note: on the integration branch this is migration 0002 relative to
-- ST-040 base. When ST-041 (OTP) and ST-046 (household) branches merge, the
-- numbering will be reconciled to avoid collisions.

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

CREATE TYPE "subscription_cadence" AS ENUM (
  'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM'
);

CREATE TYPE "subscription_status" AS ENUM (
  'DETECTED', 'TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED', 'REJECTED'
);

-- ---------------------------------------------------------------------------
-- SUBSCRIPTION
-- ---------------------------------------------------------------------------

CREATE TABLE "subscription" (
    "id"                    UUID            NOT NULL DEFAULT gen_random_uuid(),
    "identity_id"           UUID            NOT NULL,
    "merchant_id"           UUID,
    "custom_name"           VARCHAR(120),
    "category_code"         VARCHAR(50)     NOT NULL,
    "cadence"               "subscription_cadence" NOT NULL,
    "expected_amount_minor" BIGINT          NOT NULL,
    "currency"              CHAR(3)         NOT NULL,
    "status"                "subscription_status" NOT NULL DEFAULT 'DETECTED',
    "always_private"        BOOLEAN         NOT NULL DEFAULT false,
    "created_at"            TIMESTAMPTZ(6)  NOT NULL DEFAULT NOW(),
    "updated_at"            TIMESTAMPTZ(6)  NOT NULL DEFAULT NOW(),
    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_identity_fkey"
        FOREIGN KEY ("identity_id") REFERENCES "identity" ("id")
);

CREATE INDEX "subscription_identity_id_idx" ON "subscription" ("identity_id");

ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;

-- SELECT: implement the three-rule visibility policy.
--
-- Rule 1: owner.
-- Rule 2: active explicit share in a household the requester is an active member of.
-- Rule 3: owner has open_book consent (JOIN consent) in a shared household, not always_private.
--
-- This USING clause is the canonical SQL form of evaluateSubscriptionVisibility()
-- in packages/domain/policy/subscription-visibility.ts.
CREATE POLICY "subscription_select"
    ON "subscription"
    FOR SELECT
    USING (
        -- Rule 1: owner
        identity_id = current_setting('app.current_user_id')::uuid

        -- Rule 2: active share in a household the requester belongs to
        OR EXISTS (
            SELECT 1
            FROM "subscription_share" ss
            JOIN "household_member" hm_v
              ON hm_v.household_id = ss.household_id
             AND hm_v.identity_id  = current_setting('app.current_user_id')::uuid
             AND hm_v.left_at      IS NULL
            WHERE ss.subscription_id = "subscription".id
              AND ss.revoked_at      IS NULL
        )

        -- Rule 3: owner open_book + shared household + not always_private
        OR (
            NOT always_private
            AND EXISTS (
                SELECT 1
                FROM "household_member" hm_o
                JOIN "consent" c
                  ON c.identity_id = hm_o.identity_id
                 AND c.scope_id    = hm_o.household_id
                 AND c.scope_type  = 'HOUSEHOLD'
                 AND c.open_book   = true
                JOIN "household_member" hm_v
                  ON hm_v.household_id = hm_o.household_id
                 AND hm_v.identity_id  = current_setting('app.current_user_id')::uuid
                 AND hm_v.left_at      IS NULL
                WHERE hm_o.identity_id = "subscription".identity_id
                  AND hm_o.left_at     IS NULL
            )
        )
    );

-- INSERT: owner may create their own subscriptions.
CREATE POLICY "subscription_insert"
    ON "subscription"
    FOR INSERT
    WITH CHECK (identity_id = current_setting('app.current_user_id')::uuid);

-- UPDATE/DELETE: owner only.
CREATE POLICY "subscription_update"
    ON "subscription"
    FOR UPDATE
    USING (identity_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY "subscription_delete"
    ON "subscription"
    FOR DELETE
    USING (identity_id = current_setting('app.current_user_id')::uuid);

-- ---------------------------------------------------------------------------
-- SUBSCRIPTION_SHARE
-- ---------------------------------------------------------------------------

CREATE TABLE "subscription_share" (
    "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID           NOT NULL,
    "household_id"    UUID           NOT NULL,
    "shared_by"       UUID           NOT NULL,
    "shared_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "revoked_at"      TIMESTAMPTZ(6),
    CONSTRAINT "subscription_share_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_share_sub_fkey"
        FOREIGN KEY ("subscription_id") REFERENCES "subscription" ("id"),
    CONSTRAINT "subscription_share_hh_fkey"
        FOREIGN KEY ("household_id")    REFERENCES "household"     ("id"),
    CONSTRAINT "subscription_share_sharer_fkey"
        FOREIGN KEY ("shared_by")       REFERENCES "identity"      ("id")
);

CREATE INDEX "subscription_share_sub_idx" ON "subscription_share" ("subscription_id");
CREATE INDEX "subscription_share_hh_idx"  ON "subscription_share" ("household_id");

ALTER TABLE "subscription_share" ENABLE ROW LEVEL SECURITY;

-- SELECT: sharer, subscription owner, or any active household member.
CREATE POLICY "subscription_share_select"
    ON "subscription_share"
    FOR SELECT
    USING (
        shared_by = current_setting('app.current_user_id')::uuid
        OR EXISTS (
            SELECT 1 FROM "subscription" s
            WHERE s.id          = subscription_share.subscription_id
              AND s.identity_id = current_setting('app.current_user_id')::uuid
        )
        OR EXISTS (
            SELECT 1 FROM "household_member" hm
            WHERE hm.household_id = subscription_share.household_id
              AND hm.identity_id  = current_setting('app.current_user_id')::uuid
              AND hm.left_at      IS NULL
        )
    );

-- INSERT: subscription owner or household admin may share.
CREATE POLICY "subscription_share_insert"
    ON "subscription_share"
    FOR INSERT
    WITH CHECK (
        shared_by = current_setting('app.current_user_id')::uuid
        AND (
            EXISTS (
                SELECT 1 FROM "subscription" s
                WHERE s.id          = subscription_id
                  AND s.identity_id = current_setting('app.current_user_id')::uuid
            )
            OR EXISTS (
                SELECT 1 FROM "household_member" hm
                WHERE hm.household_id = household_id
                  AND hm.identity_id  = current_setting('app.current_user_id')::uuid
                  AND hm.role         = 'ADMIN'
                  AND hm.left_at      IS NULL
            )
        )
    );

-- UPDATE: sharer may update (e.g. set revoked_at for revocation).
CREATE POLICY "subscription_share_update"
    ON "subscription_share"
    FOR UPDATE
    USING (shared_by = current_setting('app.current_user_id')::uuid);

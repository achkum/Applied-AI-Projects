-- Migration 0002: banking + catalogue + subscription tables
-- Depends on: 0001_identity_household_rls

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE bank_provider AS ENUM ('TINK', 'SYNTHETIC', 'MOCK');
CREATE TYPE bank_connection_status AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE account_type AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT', 'OTHER');
CREATE TYPE transaction_status AS ENUM ('PENDING', 'BOOKED');
CREATE TYPE billing_period AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'IRREGULAR');
CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'CANCELLED', 'PAUSED');

-- ─── bank_connection ─────────────────────────────────────────────────────────

CREATE TABLE bank_connection (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id  UUID NOT NULL REFERENCES identity(id),
    provider     bank_provider NOT NULL,
    provider_id  VARCHAR(255) NOT NULL,
    status       bank_connection_status NOT NULL DEFAULT 'ACTIVE',
    last_synced_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at   TIMESTAMPTZ,
    UNIQUE (identity_id, provider_id)
);

ALTER TABLE bank_connection ENABLE ROW LEVEL SECURITY;

-- Only the owning identity may read or write their own connections
CREATE POLICY bank_connection_owner ON bank_connection
    USING (identity_id = current_setting('app.current_user_id')::uuid);

-- ─── bank_account ────────────────────────────────────────────────────────────

CREATE TABLE bank_account (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES bank_connection(id),
    identity_id         UUID NOT NULL REFERENCES identity(id),
    provider_account_id VARCHAR(255) NOT NULL,
    account_type        account_type NOT NULL,
    display_name        VARCHAR(120) NOT NULL,
    currency            VARCHAR(3) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, provider_account_id)
);

ALTER TABLE bank_account ENABLE ROW LEVEL SECURITY;

-- Always private — only the owning identity may read their accounts
CREATE POLICY bank_account_owner ON bank_account
    USING (identity_id = current_setting('app.current_user_id')::uuid);

-- ─── raw_transaction ─────────────────────────────────────────────────────────

CREATE TABLE raw_transaction (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id              UUID NOT NULL REFERENCES bank_account(id),
    provider_transaction_id VARCHAR(255) NOT NULL UNIQUE,
    amount_minor            BIGINT NOT NULL,
    currency                VARCHAR(3) NOT NULL,
    booked_at               TIMESTAMPTZ NOT NULL,
    value_date              DATE,
    description             VARCHAR(500) NOT NULL,
    status                  transaction_status NOT NULL DEFAULT 'BOOKED',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_raw_transaction_account_booked ON raw_transaction(account_id, booked_at);

ALTER TABLE raw_transaction ENABLE ROW LEVEL SECURITY;

-- Always private — derive ownership through bank_account
CREATE POLICY raw_transaction_owner ON raw_transaction
    USING (
        account_id IN (
            SELECT id FROM bank_account
            WHERE identity_id = current_setting('app.current_user_id')::uuid
        )
    );

-- ─── merchant ────────────────────────────────────────────────────────────────
-- Public read: no personal data; written only by service role (data pipeline).

CREATE TABLE merchant (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name VARCHAR(120) NOT NULL UNIQUE,
    aliases        JSONB NOT NULL DEFAULT '[]',
    website        VARCHAR(255),
    category_hue   DOUBLE PRECISION,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS: public read, service-role writes enforced at API layer.

-- ─── catalogue_plan ──────────────────────────────────────────────────────────

CREATE TABLE catalogue_plan (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id  UUID NOT NULL REFERENCES merchant(id),
    name         VARCHAR(120) NOT NULL,
    period       billing_period NOT NULL,
    amount_minor BIGINT,
    currency     VARCHAR(3) NOT NULL,
    region       VARCHAR(10) NOT NULL DEFAULT 'GLOBAL',
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS: public read, service-role writes enforced at API layer.

-- ─── subscription ─────────────────────────────────────────────────────────────

CREATE TABLE subscription (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id      UUID NOT NULL REFERENCES identity(id),
    merchant_id      UUID REFERENCES merchant(id),
    plan_id          UUID REFERENCES catalogue_plan(id),
    display_name     VARCHAR(120) NOT NULL,
    amount_minor     BIGINT NOT NULL,
    currency         VARCHAR(3) NOT NULL,
    period           billing_period NOT NULL,
    next_charge_at   DATE,
    first_seen_at    TIMESTAMPTZ NOT NULL,
    last_confirmed_at TIMESTAMPTZ,
    always_private   BOOLEAN NOT NULL DEFAULT FALSE,
    status           subscription_status NOT NULL DEFAULT 'ACTIVE',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscription_identity ON subscription(identity_id);
CREATE INDEX idx_subscription_merchant ON subscription(merchant_id);

ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;

-- Visibility policy mirrors packages/domain/policy canViewSubscription:
--   1. owner
--   2. household open-book (not always_private)
-- Explicit shares (ST-102) will be added via ALTER POLICY when that table exists.
CREATE POLICY subscription_visibility ON subscription
    USING (
        identity_id = current_setting('app.current_user_id')::uuid
        OR (
            always_private = FALSE
            AND identity_id IN (
                SELECT om.identity_id
                FROM household_member om
                INNER JOIN household_member vm
                    ON om.household_id = vm.household_id
                INNER JOIN consent c
                    ON c.identity_id = om.identity_id
                   AND c.scope_id = om.household_id
                   AND c.scope_type = 'HOUSEHOLD'
                   AND c.open_book = TRUE
                WHERE vm.identity_id = current_setting('app.current_user_id')::uuid
                  AND om.left_at IS NULL
                  AND vm.left_at IS NULL
            )
        )
    );

-- ─── subscription_charge ──────────────────────────────────────────────────────

CREATE TABLE subscription_charge (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   UUID NOT NULL REFERENCES subscription(id),
    raw_transaction_id UUID REFERENCES raw_transaction(id),
    amount_minor      BIGINT NOT NULL,
    currency          VARCHAR(3) NOT NULL,
    charged_at        DATE NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscription_charge_sub_date ON subscription_charge(subscription_id, charged_at);

ALTER TABLE subscription_charge ENABLE ROW LEVEL SECURITY;

-- Inherits from subscription — same USING clause
CREATE POLICY subscription_charge_visibility ON subscription_charge
    USING (
        subscription_id IN (
            SELECT id FROM subscription
            WHERE
                identity_id = current_setting('app.current_user_id')::uuid
                OR (
                    always_private = FALSE
                    AND identity_id IN (
                        SELECT om.identity_id
                        FROM household_member om
                        INNER JOIN household_member vm
                            ON om.household_id = vm.household_id
                        INNER JOIN consent c
                            ON c.identity_id = om.identity_id
                           AND c.scope_id = om.household_id
                           AND c.scope_type = 'HOUSEHOLD'
                           AND c.open_book = TRUE
                        WHERE vm.identity_id = current_setting('app.current_user_id')::uuid
                          AND om.left_at IS NULL
                          AND vm.left_at IS NULL
                    )
                )
        )
    );

-- 622: per-user, long-lived model-gateway credentials (T1 in
-- docs/plans/RUNTIME-CONFIGURATOR.md).
--
-- One row = one *minted, encrypted* new-api token bound to (user, device).
-- The plaintext key exists only in the mint response (L2) and in the OS
-- keychain on the employee's machine (L3); what lands here is the secretbox
-- ciphertext, which is what keeps a database dump from handing out working
-- gateway keys (L1).
--
-- Deliberately NOT stored: the upstream provider key (T0). That lives in the
-- new-api channel configuration and appears in no Multica column, DTO or file.
--
-- Lifecycle is rotate-and-revoke, never "expire": a rotated row keeps its
-- ciphertext (status='revoked', revoked_at set) so the audit trail of "which
-- upstream token was live on which device between when and when" survives.
-- The partial unique index below is what makes "at most one live token per
-- (user, token_name)" a database fact instead of a Go-layer hope: a concurrent
-- double mint cannot leave two active rows for the same token name.

CREATE TABLE IF NOT EXISTS public.gateway_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Owner. ON DELETE CASCADE: a deleted account has no gateway identity left
    -- to reconcile, and keeping an encrypted key with no reader is pure risk.
    user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

    -- Optional workspace attribution. NULL is the normal case today: minting is
    -- user-scoped (no workspace in the route), and a token outlives any one
    -- workspace selection. When present it is only a *label* for reporting —
    -- authorization is always the user_id above.
    workspace_id uuid NULL REFERENCES public.workspace(id) ON DELETE SET NULL,

    -- Which gateway implementation minted this row. Only 'newapi' exists today;
    -- the column exists so a move to LiteLLM (plan §4) adds rows, not a table.
    provider text NOT NULL DEFAULT 'newapi',

    -- Login the token was minted under on the gateway side. The credential is
    -- device-scoped, so the same user can hold several rows.
    device_id text NOT NULL,

    -- Gateway-side ids, as returned by the admin API. Kept as text: they are
    -- opaque to us and are only ever echoed back into a URL path.
    upstream_user_id text,
    upstream_token_id text,

    -- Name we gave the token on the gateway: mul:<uid8>:<dev8>. It is the
    -- reconciliation key in new-api logs (plan §3.6), so it must be stored
    -- verbatim, not re-derived.
    token_name text NOT NULL,

    -- secretbox ciphertext (AES-256-GCM, nonce||ciphertext||tag) of the token
    -- key. Plaintext NEVER goes in this column.
    secret_cipher bytea NOT NULL,

    -- Last 4 characters of the key, for "which key is on this laptop?" in the
    -- UI. Safe to show: four characters of a 48+ character secret.
    secret_suffix text NOT NULL DEFAULT '',

    -- Model allowlist mirrored onto the gateway token; also what the desktop
    -- renders into provider profiles. Display/validation only — the gateway
    -- token is the authority (plan §3.5).
    models text[] NOT NULL DEFAULT '{}'::text[],

    -- quota handed to the gateway at mint time, for auditing what the plan was.
    quota bigint,

    status text NOT NULL DEFAULT 'active',

    created_at timestamptz NOT NULL DEFAULT now(),
    -- Set when this row replaced / was replaced by a rotation.
    rotated_at timestamptz,
    revoked_at timestamptz,

    CONSTRAINT gateway_credentials_status_check CHECK (status IN ('active', 'revoked'))
);

-- "At most one active token per (user, token_name)". Partial so the revoked
-- history rows do not collide with the live one.
CREATE UNIQUE INDEX IF NOT EXISTS gateway_credentials_active_user_token_uidx
    ON public.gateway_credentials (user_id, token_name)
    WHERE status = 'active';

-- "The live credential for this device" — the read path of GET, the lock
-- target of a rotation, and the delete path of DELETE.
CREATE INDEX IF NOT EXISTS gateway_credentials_user_device_idx
    ON public.gateway_credentials (user_id, device_id, status);

-- "Everything this user ever held" — the logout / member-removal bulk revoke.
CREATE INDEX IF NOT EXISTS gateway_credentials_user_status_idx
    ON public.gateway_credentials (user_id, status);

COMMENT ON TABLE public.gateway_credentials IS
    'Per-user long-lived model-gateway tokens. secret_cipher is secretbox ciphertext; the plaintext key is returned exactly once at mint time and never stored.';
COMMENT ON COLUMN public.gateway_credentials.secret_cipher IS
    'AES-256-GCM (internal/util/secretbox) ciphertext of the gateway token key, domain-separated with a "gateway-credential:v1:" plaintext prefix. Decrypting one yields a token that can be revoked immediately.';
COMMENT ON COLUMN public.gateway_credentials.token_name IS
    'Gateway token name mul:<uid8>:<dev8>; the reconciliation key in new-api request logs.';
COMMENT ON COLUMN public.gateway_credentials.secret_suffix IS
    'Last 4 characters of the token key, shown in the UI as ***<suffix>. Never the whole key.';

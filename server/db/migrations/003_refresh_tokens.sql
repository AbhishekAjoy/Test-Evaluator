-- ============================================================================
-- 003_refresh_tokens.sql
--
-- Backend half of the httpOnly-cookie + access/refresh token migration. A refresh
-- token is a random string (not a JWT) whose HASH is stored here - same principle as
-- password_hash, so a DB leak doesn't directly hand out usable tokens. Storing them
-- server-side (rather than just a longer-lived JWT) is what makes them revocable:
-- logout, or an admin deactivating a user, can kill a specific session immediately
-- instead of waiting out its natural expiry.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1),
    user_id integer NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    revoked_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens (user_id);

COMMIT;

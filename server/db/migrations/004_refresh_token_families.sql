-- ============================================================================
-- 004_refresh_token_families.sql
--
-- Adds family tracking to refresh_tokens for rotation-with-reuse-detection: every
-- token descended from one login (through however many rotations) shares a family_id,
-- so a single UPDATE can revoke an entire lineage the moment a stolen, already-rotated
-- token gets replayed - see services/tokenService.js for the detection logic.
--
-- Existing rows are dev/test artifacts only (this table has never held a real session)
-- and are cleared rather than backfilled, so family_id can go straight to NOT NULL
-- without needing a default generation strategy at the SQL level - family IDs are
-- generated in the application layer (crypto.randomUUID()), same as refresh tokens
-- themselves.
-- ============================================================================

BEGIN;

DELETE FROM public.refresh_tokens;

ALTER TABLE public.refresh_tokens
    ADD COLUMN family_id uuid NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON public.refresh_tokens (family_id);

COMMIT;

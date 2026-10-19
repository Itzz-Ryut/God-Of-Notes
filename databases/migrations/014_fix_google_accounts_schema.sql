-- Align google_accounts with the Google OAuth repository schema.
-- Preserve existing Google subject IDs and the existing uniqueness constraint.

ALTER TABLE public.google_accounts
RENAME COLUMN google_user_id TO google_sub;

ALTER TABLE public.google_accounts
  ADD COLUMN google_email TEXT,
  ADD COLUMN display_name TEXT,
  ADD COLUMN avatar_url TEXT;

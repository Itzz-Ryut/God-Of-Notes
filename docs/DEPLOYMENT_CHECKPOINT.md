# GoD of NOTES: Deployment Checkpoint

**Date:** 19 October 2026

## Production deployment

- Frontend: https://god-of-notes.vercel.app
- Backend: https://god-of-notes-api.onrender.com
- Database: `god_of_notes` (Render PostgreSQL)

## Database backup

- Backup file: `god_of_notes_2026-10-18.backup`
- Local backup location: `D:\god_of_notes_2026-10-18.backup`
- Additional copy: `D:\SELF\GoD-Notes-Backups\god_of_notes_2026-10-18.backup`
- Format: PostgreSQL custom archive, gzip compressed
- Verification: `pg_restore --list` successfully listed database objects.
- Restore test: Not yet performed.

## Production schema update

- Migration: `013_add_orphaned_at.sql`
- Change: Added nullable `orphaned_at TIMESTAMPTZ` column to `public.documents`.
- Production application: Manually executed and verified.
- Migration tracking: No automated migration runner; record manual production changes carefully.

- Migration: `014_fix_google_accounts_schema.sql`
- Change: Renamed `public.google_accounts.google_user_id` to `google_sub`; added nullable `google_email`, `display_name`, and `avatar_url` columns.
- Production application: Manually applied to Render PostgreSQL; verified new columns present.
- Constraint verification: Primary key, foreign key, and unique constraints remain intact.
- Migration tracking: No automated migration runner; record manual production changes carefully.

## Verification status

- Registration, email OTP verification, and login: Working.
- Document creation, listing, and opening: Working after the schema update.
- Google OAuth: Reaches the callback and returns HTTP 200 JSON containing the authenticated user; the full frontend sign-in flow is not fully verified.
- Database backup archive: Readable; full restore not yet tested.

## Recovery precautions

- Keep backup files private because they may contain user data.
- Store another copy on a separate drive or private cloud storage.
- Never restore over production during a recovery test.
- Keep credentials and database connection URLs out of this document.

## Git checkpoint

- Branch: `main`
- Last known commit: `7d88985` (`db: add orphaned_at document lifecycle column`)
- Check the current deployed commit on `main` before relying on this checkpoint; do not assume the commit listed above is the deployed one.
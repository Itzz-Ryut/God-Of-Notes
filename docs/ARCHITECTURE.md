# GoD of NOTES — Architecture (portfolio snapshot)

This document summarizes the implemented architecture from source. Collaboration is experimental/incomplete; manual refresh is the supported flow.

## 1. Stack and mounts

- Backend: Express 5 + pg Pool (`backend/src/database/pool.js`), JWT (`jsonwebtoken`), bcrypt (12 rounds), Google OAuth (`google-auth-library`), Socket.IO 4 + yjs (experimental path only).
- Frontend: React 19 + Vite 8 + ProseMirror editor + React Router 7.
- Database: PostgreSQL 13+ (`gen_random_uuid()`), JSONB content, ENUM states, FK constraints, triggers, partial unique index.
- Mounts (`backend/src/app.js`): `GET /api/health`, `/api/auth/*`, `/api/users/*`, `/api/documents/*`, `/api/authorization/*`, `/api/workspaces/*`.

## 2. Auth

- JWT in HttpOnly access_token cookie; REST may use Authorization: Bearer (authenticate.js accepts cookie OR Bearer).
- requiredEnv DATABASE_URL + JWT_SECRET at import (config/env.js); PORT default 5000; FRONTEND_URL effectively required for browser CORS/origin.
- Rate limits: register 5/15m, login 10/15m, OTP 5/10m, resend 3/15m, forgot 3/15m, reset 5/15m, google 10/15m.
- Origin: REST clients may omit Origin (passes); browsers must send matching FRONTEND_URL or 403 INVALID_ORIGIN.
- Email OTP/reset delivery is dev console.log only (no SMTP).
## 3. Authorization

- Precedence: OWNER > direct permission > workspace-derived (ACTIVE workspace + ACTIVE association).
- Document routes: OWNER-only manage; EDITOR/VIEWER limited; validateUUID runs BEFORE auth on authorization routes.
## 4. Lifecycle

- Documents: ACTIVE / OWNER_TRASHED / ORPHANED; copy/trash/restore/adopt/permanent-remove; 7-day orphan cleanup scheduler.
- Workspaces: ACTIVE / TRASHED; members OWNER/EDITOR/VIEWER; document associations ACTIVE/WORKSPACE_TRASHED; permanent delete cascades memberships/associations only.
## 5. Editor contract

- Stored content is ProseMirror JSON ({type:doc, content:[...]}) in documents.content JSONB.
- Frontend normalize/toStored/stableStringify preserve the contract; PATCH requires both title and content.
## 6. Collaboration status: INCOMPLETE

- Included server code expects {version:1, blocks:[{type,text}]} (collaboration.persistence.js) with no converter.
- Existing editor documents fail the snapshot guard; join refuses with Document state unavailable. Do not advertise as working.
## 7. DB setup

- Apply databases/migrations/001 through 012 in order via psql; no migration runner; no seed in snapshot.
## 8. Testing

- No automated suites in this snapshot; archival suites require a live seeded DATABASE_URL and are excluded.
## 9. Security notes

- HttpOnly cookies, helmet, parameterized SQL, generic 500s, UUID validation; VITE_* is browser-public, never secrets.

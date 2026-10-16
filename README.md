# GoD of NOTES

A collaborative notes application with documents, workspaces, sharing/permissions, and lifecycle (trash / recover / orphan handling).

> Portfolio snapshot. This README describes only what has been verified in source. Build and test results below are historical development-phase observations, NOT re-verified in this snapshot. See “What is not yet verified” and `docs/ARCHITECTURE.md`.

## What this project is

- **Frontend (`frontend/`):** React + Vite single-page app. Document editor (ProseMirror), documents list, workspaces, sharing panel, auth pages.
- **Backend (`backend/`):** Express API (`backend/src/server.js` → `backend/src/app.js`) with PostgreSQL persistence, JWT-in-`HttpOnly`-cookie auth, Google OAuth entry, authorization/permissions, workspaces, documents lifecycle, and a background orphan-cleanup scheduler.
- **Database (`databases/`):** Ordered SQL migrations `001–012` (apply manually in order; no migration runner in repo).

## Verified technology stack

Observed from `package.json` files and imports (not guessed):

- **Frontend:** `react` 19, `react-dom` 19, `react-router-dom` 7, `prosemirror-*` (commands, history, inputrules, keymap, model, schema-basic, schema-list, state, view), `lucide-react`, `vite` 8, `@vitejs/plugin-react` 6, `oxlint` (lint only).
- **Backend:** `express` 5, `pg` 8 (`Pool` in `backend/src/database/pool.js`), `jsonwebtoken`, `bcrypt`, `google-auth-library`, `cookie-parser`, `cors`, `helmet`, `express-rate-limit`, `socket.io` 4, `yjs`, `dotenv`, `nodemon` (dev only), `socket.io-client` (dev/test only).

### Real-time collaboration: experimental / incomplete

- Server-side collaboration code (`backend/src/modules/collaboration/`) is included for reference, but the end-to-end realtime editing flow is **incomplete and not supported** in this snapshot.
- Known mismatch: the editor persists ProseMirror JSON (`{type:"doc", content:[...]}`) while the collaboration layer expects `{version:1, blocks:[{type,text}]}` with no converter; documents created in the editor fail the collaboration snapshot guard. Manual refresh is the supported flow.
- Do not advertise collaboration as working. See `docs/ARCHITECTURE.md` for details.
- **Database:** PostgreSQL 13+ (`gen_random_uuid()`), `JSONB` document content, ENUM state types, FK constraints, triggers, partial unique index, row locking (`SELECT ... FOR UPDATE`).
- **Runtime observed in audit:** Node `v24.11.0`, npm `11.6.1`. Node version is not pinned in the repo.

## Features

### Working (implemented in source; end-to-end NOT re-verified in this phase)

- Auth: register / login / logout, email verification + resend, forgot/reset password, Google OAuth start/callback, rate-limited auth routes (`backend/src/middleware/ratelimit.js`), `HttpOnly` `access_token` cookie (`backend/src/modules/auth/auth.cookie.js`).
- Documents: create / read / update / list / search-filter, title + ProseMirror JSON content (`documents.content JSONB`), copy, trash / restore flows.
- Sharing/permissions: direct document permissions (`OWNER` / `EDITOR` / `VIEWER` semantics in authorization module + migrations `008`), workspace-derived access, precedence rules in source.
- Workspaces: create / update / retrieval, membership roles, document association, ownership transfer, trash / permanent delete, 7-day orphan cleanup scheduler (`ORPHAN_CLEANUP_INTERVAL_MS`, default 24h interval).
- API safety basics: `helmet`, CORS with `credentials:true` + single `FRONTEND_URL` origin, origin check for non-safe methods, UUID validation, parameterized SQL, generic 500 error shape.
### Partially verified / needs production work

- **Frontend lint:** `npm --prefix frontend run lint` → historical development-phase baseline was 0 errors with many warnings ( mostly `react/set-state-in-effect` and unused vars in workspace files). Not yet triaged/fixed.
- **Frontend build:** `npm --prefix frontend run build` → historical development-phase build passed. Chunk-size warning (>500 kB) noted; no code-splitting done.
- **Backend tests:** hand-rolled `node backend/tests/*.test.js` + `backend/scripts/*.mjs` smokers exist (93 files) but require a live `DATABASE_URL` and were **NOT run** in this phase. Do not assume they pass.
- **Google OAuth / email:** email delivery is dev-mode `console.log` only (no SMTP provider in source). Google flow needs prod `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` + callback-domain wiring.
- **Health endpoint:** `GET /api/health` returns `{status:"ok"}` without a DB check; DB health only runs at boot.

### Unfinished / explicitly NOT enabled

- **Real-time collaboration:** Socket.IO + Yjs code exists, but the persisted-content contract is mismatched (ProseMirror JSON vs `{version,blocks}` snapshot; see `F83_AUDIT_REPORT.md`). **Do not enable in demo/prod** until the contract is fixed and verified.
- **Deployment:** no `Dockerfile`, compose file, host config, CI workflow, or live URL in the repo. No deployment has been performed or verified.
- **Reproducible prod DB story:** no automated migration apply, backup, restore test, or rollback drill yet.

## Prerequisites

- Node.js + npm (audit machine used Node `v24.11.0`, npm `11.6.1`; no `.nvmrc`/engines pin found).
- PostgreSQL 13+ (for `gen_random_uuid()`), with a dev database you can connect to.

## Local setup (from a clean clone)

```bash
# 1. Install dependencies
npm --prefix backend install
npm --prefix frontend install

# 2. Configure environment (placeholders only — never commit real values)
cp backend/.env.example backend/.env
# edit backend/.env: set DATABASE_URL, JWT_SECRET, FRONTEND_URL (see Configuration)
cp frontend/.env.example frontend/.env
# edit frontend/.env if your API is not http://localhost:5000/api

# 3. Create schema (manual — no runner in repo; review files first)
# Apply databases/migrations/001_*.sql through 012_*.sql in order, e.g. with psql.
```
## Configuration (names only; values are placeholders)

Backend (`backend/.env`, template: `backend/.env.example`, loader: `backend/src/config/env.js`):

| Name | Required? | Example placeholder |
|---|---|---|
| `DATABASE_URL` | Required | `postgresql://USER:[REDACTED]@HOST:5432/DBNAME` |
| `JWT_SECRET` | Required | (generate a long random value; never commit) |
| `PORT` | Optional, default `5000` | `5000` |
| `JWT_EXPIRES_IN` | Optional, default `15m` | `15m` |
| `GOOGLE_CLIENT_ID` | Optional (`null` if absent) | (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Optional (`null` if absent) | (from Google Cloud Console) |
| `GOOGLE_REDIRECT_URI` | Optional (`null` if absent) | `http://localhost:5000/api/auth/google/callback` |
| `FRONTEND_URL` | Effectively required (CORS + origin check) | `http://localhost:5173` |
| `ORPHAN_CLEANUP_INTERVAL_MS` | Optional, default `86400000` | `86400000` |
| `NODE_ENV` | Optional; `production` enables `secure` cookies | `development` |

Frontend (`frontend/.env`, template: `frontend/.env.example`, used in `frontend/src/lib/api/client.js`):

| Name | Required? | Example placeholder |
|---|---|---|
| `VITE_API_BASE_URL` | Optional, default `http://localhost:5000/api` | `http://localhost:5000/api` |

`VITE_*` values are public in the browser bundle — never put secrets there.

## Commands that actually exist

```bash
# Frontend (frontend/package.json)
npm --prefix frontend run dev      # vite dev server
npm --prefix frontend run build    # vite build -> frontend/dist/
npm --prefix frontend run lint     # oxlint (baseline: 0 errors, 1525 warnings)
npm --prefix frontend run preview  # vite preview of the dist build

# Backend (backend/package.json)
npm --prefix backend run dev       # nodemon src/server.js (development)
npm --prefix backend start         # node src/server.js (production start)

# Backend tests: no npm script. Hand-rolled scripts run directly, e.g.
```

## Repository hygiene notes

- Ignored and never committed: `**/node_modules/`, `**/dist/`, real `.env` files, `*.log`, `.playwright-mcp/` (debug snapshots), `frontend/dist-harness/` (temporary editor harness output).
- This snapshot contains `backend/routes.rest.example` (placeholders only). The original `backend/routes.rest` with development credentials is excluded.

## Security note

Never use production secrets in local examples, screenshots, logs, or commits. If any real secret was ever pushed, treat it as exposed: rotate/revoke it first, then plan history cleanup separately.

## License

No license file was found in the repo. Add one only after the project owner chooses it.

## API examples

See `backend/routes.rest.example` (47 sanitized examples, placeholders only, no real credentials). Notes:

- `POST /api/auth/logout` is public with no body.
- REST clients may omit `Origin` (origin check passes when absent); browser deployments must send the matching `FRONTEND_URL` origin.
- Authentication works via browser `HttpOnly` cookie or REST `Authorization: Bearer <JWT>`.

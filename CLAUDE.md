# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development commands

### Backend (`cd backend`)
```bash
npm run dev          # nodemon, port 3001
npm run db:migrate:dev --name <name>  # create and apply a migration
npm run db:migrate   # deploy migrations (production)
npm run db:seed      # seed admin user, default roles, and Bliss project
npx prisma studio    # visual DB browser
```

### Frontend (`cd frontend`)
```bash
npm run dev          # Vite dev server, port 5173
npm run build        # production build
```

### Environment variables

**backend/.env**
```
DATABASE_URL=postgresql://user:pass@localhost:5432/team_tracker
JWT_SECRET=<long random string>
RESEND_API_KEY=re_xxxx
FRONTEND_URL=http://localhost:5173
```

**frontend/.env.development**
```
VITE_API_URL=http://localhost:3001
```

Default admin credentials after seed: `admin@blissmkt.ar` / `admin123`

## Architecture

### Overview
Full-stack task tracker for a marketing agency. Backend is a REST API; frontend is a React SPA. No shared code between them — they communicate only via HTTP.

### Backend (`backend/src/`)
- **Express + Prisma + PostgreSQL.** Single entry point: `index.js` mounts all routers under `/api/<resource>`.
- **Auth:** JWT (12h expiry) stored in `localStorage`. The `auth` middleware attaches `req.user` (decoded JWT payload). `adminOnly` middleware gates admin routes.
- **No tests.** No test framework is configured.
- All dates for workday logic use `America/Argentina/Buenos_Aires` (UTC-3). Task timestamps are stored in UTC.
- **Email** is sent via Resend HTTP API (`src/services/email.service.js`) — not SMTP. Railway blocks outbound SMTP ports.

### Frontend (`frontend/src/`)
- **React 18 + Vite + Tailwind CSS + React Router v6.**
- `api/client.js` — Axios instance that reads `VITE_API_URL`, injects the JWT from `localStorage`, and redirects to `/login` on 401.
- `context/AuthContext.jsx` — global auth state; validates token on mount via `GET /auth/me`.
- `context/ThemeContext.jsx` — dark mode toggle persisted to `localStorage`.
- `hooks/useRoles.js` — fetches `UserRole` list for label lookups (role names are internal strings like `"DESIGNER"`; labels are display strings like `"Diseñador"`).
- `hooks/useInactivity.js` — tracks mouse/keyboard activity; after 60 min idle on an IN_PROGRESS task shows a warning modal + Chrome notification; auto-pauses after a further 10 min.

### Key domain concepts

**WorkDay:** Created automatically when a user visits the Dashboard. One per user per calendar day (keyed on `YYYY-MM-DD` in Buenos Aires time). Closing a workday (`/workdays/finish`) logs out the user. Tasks from previous days that are still PENDING/PAUSED/BLOCKED are carried over and shown in a separate section.

**Task status machine:**
```
PENDING → IN_PROGRESS → PAUSED / BLOCKED / COMPLETED
BLOCKED → PENDING  (unblock)
PAUSED  → IN_PROGRESS (resume)
```
Only one task can be `IN_PROGRESS` per user at a time (enforced on the backend). Blocking requires a reason. Auto-pause on inactivity stores the task ID in `localStorage` key `autoPaused` to restore the modal after page reload.

**Roles:** Dynamic — stored in the `UserRole` table, created/deleted from the Admin panel. The role string on `User.role` is the internal name (e.g. `"ADMIN"`). `ADMIN` cannot be deleted if any user holds it. Admin access unlocks RealTime, Reports, and Admin pages.

**Task assignment:** A task's `userId` is the assignee; `createdById` is set only when someone else creates the task (so `createdBy` appears in the card as "Asignada por X").

### Prisma schema notes
- `User.role` is a plain `String` (not an enum) — it references `UserRole.name`.
- When a model has two relations to the same model, named relations are required (see `Task.createdBy` / `Task.user` both pointing to `User`).
- Migrations live in `backend/prisma/migrations/`. Always use `migrate dev` locally and `migrate deploy` in production.

### Deploy
- **Backend:** Railway (auto-runs `npm run db:migrate` on deploy; seed must be run manually once via Railway Shell).
- **Frontend:** Vercel (root: `/frontend`; `vercel.json` rewrites all paths to `index.html` for SPA routing).

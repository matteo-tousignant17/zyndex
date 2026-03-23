# Zyndex — Claude Instructions

## Stack
- **Frontend/Backend:** Next.js (App Router), deployed on **Vercel**
- **Database:** **Supabase** (PostgreSQL via `postgres.js`)
- **Dev workflow:** Claude Code → GitHub → Vercel (no local dev ever)

## Preferences
- No local development. Never suggest running `npm run dev`, local postgres, or file-based DBs.
- No `.env.local` setup instructions — env vars live in Vercel dashboard and are set there.
- Use the Supabase **transaction pooler** URL (port 6543) for `DATABASE_URL`, not the direct connection.
- `sql/schema.sql` is the source of truth for the database schema; run it in the Supabase SQL Editor.

## Conventions
- DB queries use `postgres.js` tagged template literals (`sql\`...\``), never raw string concatenation.
- API routes live in `app/api/`.
- Keep things simple — no ORMs, no extra abstraction layers.

# Leave Neon when the project is stuck (quota / storage)

When Neon returns **quota exceeded**, the API and cleanup scripts cannot connect. You have two paths.

## Path A — Move on without old data (fastest)

Use **Supabase** (or any Postgres). The repo is already set up for Supabase pooler URLs.

### 1. Supabase project

1. [supabase.com](https://supabase.com) → create project (Free tier, 500 MB).
2. **Database password**: letters and numbers only (avoids URL encoding issues).
3. Create `apps/api/.env.supabase.local` (gitignored):

```env
SUPABASE_SESSION_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
SUPABASE_POOLED_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Get both URIs from Supabase → **Connect** → **Session** (5432) and **Transaction** (6543).

### 2. Switch local production env + migrate

```bash
bash scripts/switch-production-to-supabase.sh
pnpm admin:create:prod --email you@company.com --name "Your Name"
```

### 3. Vercel (API project)

1. **Integrations** → disconnect **Neon** (it overrides `DATABASE_URL`).
2. **Environment variables** (Production):
   - `DATABASE_URL` = Supabase **6543** URL
   - `DATABASE_URL_UNPOOLED` = Supabase **5432** URL
3. Redeploy API (and web if needed): `SKIP_DB_MIGRATE=1 pnpm deploy:all`

### 4. After deploy

- Sign in with the new admin password from `admin:create:prod`.
- **Access**: re-create portal users / connector keys if the new DB is empty.
- **Developers**: **My connectors** → activate keys again; connectors keep running locally.

You start with an **empty organisation** — no historical events until connectors report again.

---

## Path B — Rescue historical data (needs Neon once)

Neon must allow **one** connection to dump data.

1. Neon → **Billing** → **Launch** for a short window.
2. Ensure `apps/api/.env.production.local.neon-backup` or original file still has Neon URLs as **source**.
3. Fill Supabase password in `.env.supabase.local`.
4. ```bash
   bash scripts/copy-database.sh
   bash scripts/switch-production-to-supabase.sh
   ```
5. Follow Vercel steps in Path A §3.
6. Downgrade Neon when done.

---

## Other hosts

Any managed Postgres works if you set:

- `DATABASE_URL` — pooled / serverless-friendly URL (Supabase **6543**, or host’s pooler).
- `DATABASE_URL_UNPOOLED` — direct URL for migrations (Supabase **5432**).

Run `pnpm db:migrate:prod` after updating `apps/api/.env.production.local`.

TLS is enabled automatically in `@techlio/server-core` for non-localhost URLs.

---

## Prevent filling up again

- Run **`pnpm dev:worker`** (or deploy the worker) so `RETENTION_DAYS` (default 90) purges old `activity_events`.
- Periodically: `pnpm db:retention:prod` (summarises, archives and purges old raw events).
- Do not run the connector under **`sudo`** (avoids duplicate commit events).

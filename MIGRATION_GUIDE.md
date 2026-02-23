# Litera.ai — Migration Guide: Replit → AWS / DigitalOcean

**Created**: 2026-02-20
**Purpose**: Step-by-step plan for migrating Litera.ai off Replit to a self-hosted environment (AWS, DigitalOcean, or similar) while maintaining PHIPA compliance and all existing functionality.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Replit-Specific Dependencies](#replit-specific-dependencies)
3. [Environment Variables](#environment-variables)
4. [Migration Steps](#migration-steps)
5. [Build & Deployment](#build--deployment)
6. [Database Migration](#database-migration)
7. [PHIPA Compliance](#phipa-compliance)
8. [DNS & TLS](#dns--tls)
9. [Post-Migration Checklist](#post-migration-checklist)
10. [Rollback Plan](#rollback-plan)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                    Client                       │
│  React + Vite (built to dist/public/)           │
│  Served as static files by Express in prod      │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────┐
│               Express Server                     │
│  - API routes (server/routes.ts)                │
│  - Session management (connect-pg-simple)       │
│  - Static file serving (server/static.ts)       │
│  - Port: process.env.PORT || 5000               │
└──────┬──────────┬──────────┬────────────────────┘
       │          │          │
  ┌────▼───┐ ┌───▼────┐ ┌───▼─────┐
  │ Postgres│ │ OpenAI │ │ Resend  │
  │ (Neon)  │ │ GPT-4o │ │ (Email) │
  └─────────┘ └────────┘ └─────────┘
```

The app is a **monolithic Express server** that serves both the API and the pre-built React frontend. In development, Vite runs as middleware on the same server (server/vite.ts). In production, Express serves static files from `dist/public/` (server/static.ts).

---

## Replit-Specific Dependencies

### Critical (must change before migration)

| Dependency | File(s) | What It Does | Migration Action |
|---|---|---|---|
| **Resend Connector** | `server/services/resend.ts` | Fetches Resend API key via Replit's connector proxy using `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, `WEB_REPL_RENEWAL` | **Already fixed**: Code now checks `RESEND_API_KEY` env var first. Set this directly and the Replit connector code is bypassed entirely. |
| **OpenAI AI Integrations** | `server/services/openai.ts`, `server/routes.ts` (experiments chat) | Routes OpenAI calls through Replit's AI proxy using `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` | **Already fixed**: Code now prefers `OPENAI_API_KEY` (standard). When set, it uses `api.openai.com` directly, bypassing the Replit proxy. |
| **`REPLIT_DEV_DOMAIN`** | `server/routes.ts` (3 locations: send, send-test, check-in scheduler) | Fallback domain for patient email links | Set `APP_URL` env var (e.g., `https://litera.example.com`). Code already prefers `APP_URL` over `REPLIT_DEV_DOMAIN`. |
| **Vite dev server** | `server/vite.ts` | Co-hosts Vite HMR on same HTTP server in development | Not used in production (`NODE_ENV=production` uses `server/static.ts` instead). No change needed. |
| **Neon Postgres** | `server/db.ts` | Database connection via `DATABASE_URL` | Standard `pg.Pool` — any PostgreSQL-compatible connection string works. |

### Non-Critical (Replit environment vars present but unused off-platform)

| Variable | Impact |
|---|---|
| `REPL_ID`, `REPL_SLUG`, `REPL_OWNER` | Not referenced in code. Safe to ignore. |
| `REPLIT_CONNECTORS_HOSTNAME` | Only used in Resend fallback path. Ignored when `RESEND_API_KEY` is set. |
| `REPL_IDENTITY`, `WEB_REPL_RENEWAL` | Only used in Resend fallback path. Ignored when `RESEND_API_KEY` is set. |

---

## Environment Variables

### Required (must be set in new environment)

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/literadb?sslmode=require` | Any PostgreSQL 14+ instance |
| `SESSION_SECRET` | 64-char hex string | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `APP_URL` | `https://litera.example.com` | Used in patient email links. **Must be set in production.** |
| `NODE_ENV` | `production` | Enables secure cookies, static file serving, disables demo mode |
| `PORT` | `5000` | Or any port; default is 5000 |

### Required for Features

| Variable | Feature | Notes |
|---|---|---|
| `OPENAI_API_KEY` | AI processing (extract, simplify, translate) | Standard OpenAI API key from platform.openai.com |
| `RESEND_API_KEY` | Email delivery | From resend.com dashboard |
| `RESEND_FROM_EMAIL` | Email sender address | e.g., `Litera Health <care@litera.health>`. Requires verified domain in Resend. |

### Optional

| Variable | Feature | Notes |
|---|---|---|
| `INTERNAL_API_SECRET` | Scheduler endpoint protection | **Required** to enable `POST /api/internal/send-pending-check-ins`. Endpoint returns 503 if not set. |
| `DEMO_MODE` | Force demo mode | Set to `"false"` to disable. Auto-disabled when `NODE_ENV=production`. |

### No Longer Needed (Replit-only)

| Variable | Reason |
|---|---|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Replaced by `OPENAI_API_KEY` |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Not needed when using standard OpenAI |
| `REPLIT_CONNECTORS_HOSTNAME` | Replaced by `RESEND_API_KEY` |
| `REPL_IDENTITY` | Replit auth token, not needed |
| `WEB_REPL_RENEWAL` | Replit deployment token, not needed |
| `REPLIT_DEV_DOMAIN` | Replaced by `APP_URL` |

---

## Migration Steps

### Phase 1: Pre-Migration Preparation

1. **Verify the app builds cleanly**:
   ```bash
   npm run build
   ```
   This runs `tsx script/build.ts` which produces:
   - `dist/index.cjs` — bundled Express server
   - `dist/public/` — built React frontend

2. **Export current database**:
   ```bash
   pg_dump "$DATABASE_URL" --no-owner --no-acls > litera_backup.sql
   ```

3. **Document current Resend domain verification** — ensure DNS records (SPF, DKIM, DMARC) are under your control, not Replit's.

4. **Generate all production secrets**:
   ```bash
   # Session secret
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   # Internal API secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

### Phase 2: Infrastructure Setup

#### Option A: AWS (Recommended for PHIPA)

1. **Compute**: EC2 instance (t3.small minimum) or ECS Fargate container
   - Region: `ca-central-1` (Canada) for PHIPA compliance
   - Node.js 20+ runtime
2. **Database**: RDS PostgreSQL 14+ (or Aurora PostgreSQL)
   - Enable encryption at rest (AES-256)
   - Enable automated backups (35-day retention recommended)
   - Use private subnet, no public access
3. **Load Balancer**: ALB with ACM TLS certificate
4. **Secrets**: AWS Secrets Manager or SSM Parameter Store (SecureString)

#### Option B: DigitalOcean

1. **Compute**: App Platform (Docker) or Droplet (Ubuntu 22.04+, Node.js 20+)
   - Region: Toronto (`tor1`) for Canadian data residency
2. **Database**: Managed PostgreSQL (any tier with daily backups)
3. **TLS**: Let's Encrypt via Caddy or nginx, or App Platform managed TLS
4. **Secrets**: Environment variables via App Platform or `.env` file on Droplet

### Phase 3: Deploy

1. **Clone the repository** to your deployment target.

2. **Install dependencies**:
   ```bash
   npm ci --production=false   # Need devDependencies for build
   ```

3. **Run database migrations**:
   ```bash
   export DATABASE_URL="postgresql://..."
   npx drizzle-kit push
   ```

4. **Build the application**:
   ```bash
   npm run build
   ```

5. **Start the server**:
   ```bash
   NODE_ENV=production \
   DATABASE_URL="postgresql://..." \
   SESSION_SECRET="..." \
   APP_URL="https://litera.example.com" \
   OPENAI_API_KEY="sk-..." \
   RESEND_API_KEY="re_..." \
   RESEND_FROM_EMAIL="Litera Health <care@litera.health>" \
   PORT=5000 \
   npm start
   ```

6. **Verify**:
   - `curl https://litera.example.com/api/env-info` → should return `{"isDemoMode":false,"isProduction":true}`
   - Login with admin credentials
   - Create a test care plan and verify email delivery

### Phase 4: DNS Cutover

1. Update DNS A/CNAME record from Replit to new server IP / load balancer
2. Monitor for 24-48 hours
3. Decommission Replit deployment

---

## Build & Deployment

### Build Output

```
npm run build
```

Produces:
- `dist/index.cjs` — Node.js server (CommonJS bundle, self-contained)
- `dist/public/` — Static React frontend (HTML, JS, CSS, assets)

### Production Start

```bash
NODE_ENV=production node dist/index.cjs
```

The server:
1. Connects to PostgreSQL via `DATABASE_URL`
2. Runs `seedDatabase()` to create demo tenants/users if DB is empty
3. Registers all API routes
4. Serves static frontend from `dist/public/`
5. Listens on `PORT` (default 5000)

### Process Manager

Use PM2 or systemd for production process management:

```bash
# PM2
pm2 start dist/index.cjs --name litera-api -i 2

# Or systemd unit file
[Unit]
Description=Litera.ai
After=network.target

[Service]
Type=simple
User=litera
WorkingDirectory=/opt/litera
ExecStart=/usr/bin/node dist/index.cjs
Restart=always
EnvironmentFile=/opt/litera/.env

[Install]
WantedBy=multi-user.target
```

### Docker (Optional)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build
RUN npm prune --production
ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
```

---

## Database Migration

### Schema Management

The project uses **Drizzle ORM** with schema defined in `shared/schema.ts`.

```bash
# Push schema to new database (creates tables if missing)
npx drizzle-kit push

# Or generate SQL migration files for review
npx drizzle-kit generate
```

### Data Migration

```bash
# Export from Replit's Neon database
pg_dump "$OLD_DATABASE_URL" --no-owner --no-acls --data-only > data_export.sql

# Import into new database (after running drizzle-kit push)
psql "$NEW_DATABASE_URL" < data_export.sql
```

### Session Table

The `session` table is auto-created by `connect-pg-simple` on first startup (`createTableIfMissing: true` in `server/index.ts`). No manual creation needed.

### Important: Seed Data

On first startup with an empty database, `seedDatabase()` (in `server/seed.ts`) creates:
- 2 demo tenants (Riverside, Lakeside)
- Demo users (admin, clinician, interpreter per tenant)
- 10 sample patients with care plans

This is intended for demo/development. For production, either:
- Let it seed and then delete demo data via admin UI
- Or set `DEMO_MODE=false` and pre-populate with real tenant/user data via SQL

---

## PHIPA Compliance

### Data Residency

- **Database**: Host PostgreSQL in Canada (`ca-central-1` on AWS, `tor1` on DigitalOcean)
- **Compute**: Run application server in the same Canadian region
- **OpenAI**: Note that OpenAI API calls transmit PHI (discharge documents) to US-based servers. For full PHIPA compliance:
  - Consider Azure OpenAI Service in Canada East region
  - Or use a BAA-covered OpenAI organization account
  - Document the data flow in your privacy impact assessment

### Encryption

| Layer | Current State | Migration Action |
|---|---|---|
| **In Transit** | HTTPS via Replit's TLS | Configure ALB/nginx with TLS 1.2+ |
| **At Rest (DB)** | Neon encrypts at rest | Enable RDS encryption (AES-256) |
| **At Rest (Backups)** | Managed by Neon | Enable encrypted RDS snapshots |
| **Secrets** | Replit Secrets | AWS Secrets Manager / SSM SecureString |
| **Patient PINs** | bcrypt hashed (10 rounds) | No change needed |
| **Passwords** | bcrypt hashed (10 rounds) | No change needed |

### Access Controls

- Multi-tenant data isolation is enforced at the application layer (all queries scoped by `tenantId`)
- Role-based access: super_admin, admin, clinician, interpreter, patient
- Session-based auth with 24-hour expiry, secure cookies in production
- Rate limiting on login (5 attempts/15 min) and patient verify (3 attempts/15 min)

### Audit Trail

The `audit_logs` table records all significant actions (views, verifications, sends, edits). No migration action needed — this continues to work with any PostgreSQL instance.

### Recommendations

1. Enable PostgreSQL `log_statement = 'mod'` for database-level audit logging
2. Configure CloudWatch / application log aggregation
3. Set up automated database backups with 35-day retention
4. Document data flow in a Privacy Impact Assessment (PIA)
5. Ensure Resend email domain is verified under your organization's DNS

---

## DNS & TLS

### TLS Certificate

| Platform | Method |
|---|---|
| AWS ALB | AWS Certificate Manager (free, auto-renewing) |
| DigitalOcean App Platform | Managed TLS (automatic) |
| Self-hosted (Droplet/EC2) | Let's Encrypt via Certbot or Caddy |

### DNS Records

```
litera.example.com    A     → <server-ip>
                      (or CNAME → <load-balancer-dns>)
```

### Email DNS (for Resend)

Ensure these records exist for your sending domain:
- SPF: `v=spf1 include:amazonses.com ~all` (or Resend's SPF)
- DKIM: Provided by Resend dashboard
- DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com`

---

## Post-Migration Checklist

- [ ] Application starts without errors (`NODE_ENV=production`)
- [ ] Login works for all roles (admin, clinician, interpreter)
- [ ] Patient portal accessible via magic link
- [ ] Care plan creation pipeline works (upload → extract → simplify → translate)
- [ ] Email delivery works (Resend with `RESEND_API_KEY`)
- [ ] Patient check-in (traffic light) submits correctly
- [ ] Admin CSV export produces valid data
- [ ] Analytics page loads with correct data
- [ ] Interpreter review workflow completes end-to-end
- [ ] Session persists across server restarts (connect-pg-simple)
- [ ] `APP_URL` is set and patient email links resolve correctly
- [ ] TLS certificate is valid and auto-renewing
- [ ] Database backups are configured and tested
- [ ] No Replit-specific environment variables are referenced in logs
- [ ] Process manager (PM2/systemd) restarts on crash

---

## Rollback Plan

If issues arise post-migration:

1. **DNS Rollback**: Point DNS back to Replit deployment (if still running)
2. **Data Sync**: Export new data from migrated DB, import into Replit DB
3. **Replit Fallback**: The codebase still supports Replit environment variables as fallbacks — the Resend connector and AI Integrations proxy paths are preserved in code

The code is designed for **dual-environment compatibility**: it works on both Replit and self-hosted infrastructure simultaneously. The migration can be gradual.

---

## Files Modified for Migration Compatibility

| File | Change |
|---|---|
| `server/services/resend.ts` | Added `RESEND_API_KEY` / `RESEND_FROM_EMAIL` env var fallback before Replit connector path. Typed connector response shape. |
| `server/services/openai.ts` | Prefers `OPENAI_API_KEY` (standard) over `AI_INTEGRATIONS_OPENAI_API_KEY` (Replit proxy). Exports `getOpenAIClient()` for shared usage. |
| `server/routes.ts` | Experiments chat endpoint reuses shared OpenAI client. Internal check-in endpoint requires `INTERNAL_API_SECRET`. Removed all hardcoded user ID fallbacks. |
| `server/services/twilio.ts` | **Deleted** — SMS/Twilio support removed in Phase A. `twilio` npm package uninstalled. |
| `client/src/lib/utils.ts` | Shared utilities: `formatContent`, `getLanguageName`, `viewAsPatient`, `validatePassword`, `isValidEmail`, `isValidYearOfBirth`. |

## QA Audit Summary (Feb 2026)

### Changes Applied
- **7 critical security fixes**: Unprotected internal endpoint, hardcoded `clinician-1` fallback, password policy bypass in reset flow, missing `credentials: "include"` on fetch calls, dead Twilio code removal, unauthenticated experiment chat context limits, `Math.random()` PIN generation → `crypto.randomInt()`
- **6 code deduplication extractions**: `formatContent`, `getLanguageName`, `viewAsPatient`, `validatePassword`, `isValidEmail`, `isValidYearOfBirth` → shared `client/src/lib/utils.ts`
- **Type safety improvements**: Removed `as any` casts where possible, proper null handling in seed data, typed Resend connector response
- **Stale code cleanup**: Removed unused imports, fixed stale comments, extracted demo constants

### Recommended Future Work
- **Component extraction**: clinician-dashboard (2700 LOC), admin-dashboard (2100 LOC), patient-portal (1870 LOC) would benefit from sub-component extraction
- **Express Request typing**: Extend Express `Request` interface to include `clinicianId`, `tenantId`, etc. instead of `(req as any).clinicianId`
- **Query caching**: Current `staleTime: Infinity` means data never auto-refreshes; consider shorter stale times for multi-user scenarios
- **Storage layer**: `getAlerts()` fetches all check-ins and filters in memory; should use SQL join for tenant filtering
- **Database pool**: Add `pool.on('error', ...)` handler and configure connection limits

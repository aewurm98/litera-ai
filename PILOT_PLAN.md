# Litera.ai — Pilot Readiness Plan (2-5 Clinics)

**Last Updated:** February 18, 2026

---

## Goal

Take Litera.ai from a single-demo-clinic MVP to a platform that can onboard 2-5 real clinics while keeping a demo clinic available for sales and training.

---

## Feature Status

### COMPLETED

| # | Feature | Details |
|---|---------|---------|
| 1 | **Multi-Tenant Data Model** | Tenants table with `name`, `slug`, `isDemo`. Users and patients scoped via `tenantId`. |
| 2 | **Super Admin Role** | `super_admin` with `tenantId = null`. Can manage all tenants, users, and data across the platform. |
| 3 | **Clinic Admin Role** | `admin` role scoped to a single tenant. Can only see their own clinic's data. |
| 4 | **Clinician Role** | `clinician` role scoped to a tenant. Can create/manage care plans within their clinic. |
| 5 | **Tenant Management UI** | Super admins can create and edit tenants via the "Tenants" tab in Admin Dashboard. |
| 6 | **Team Member Management** | Super admins can create/edit users and assign them to any tenant. Clinic admins manage their own staff only. |
| 7 | **Demo Tenant with Seed Data** | Demo Clinic with pre-loaded patients, care plans, and sample documents. |
| 8 | **Demo Reset Feature** | "Reset Demo" button reseeds all data. Currently hidden when `DEMO_MODE=false`. |
| 9 | **Patient Authentication** | Two modes: simplified (demo — last name + year of birth) and full (production — last name + year of birth + PIN). |
| 10 | **Static PIN Preservation** | Sending a care plan to an existing patient no longer overwrites their PIN. Demo patients keep PIN `1234`. |
| 11 | **AI Content Pipeline** | Document upload, extraction, simplification (5th-grade reading level), and translation (49 languages) via OpenAI GPT-4o. |
| 12 | **Patient Portal** | Magic link access, language toggling, text-to-speech, traffic light check-in system. |
| 13 | **Email Delivery** | Care plans sent via Resend with magic links. |
| 14 | **Audit Logging** | Actions tracked in audit log table. |
| 15 | **CSV Export** | TCM billing compliance export from Admin Dashboard. |
| 16 | **Rate Limiting & Security** | Server-side rate limiting, bcrypt password hashing, Zod validation on API endpoints. |

---

### OUTSTANDING — Prioritized for Pilot

| # | Feature | Priority | Details | Status |
|---|---------|----------|---------|--------|
| 1 | **Demo Mode Toggle / Super Admin Reset Access** | HIGH | `DEMO_MODE` is an env var set to `false`, hiding the reset button. Super admins should be able to reset demo data regardless of mode, or there should be an easy way to toggle demo mode. | Not started |
| 2 | **Per-Tenant Demo Reset** | HIGH | Current reset wipes ALL data and reseeds everything. For a multi-clinic pilot, need ability to reset only the demo tenant's data without touching real clinic data. | Not started |
| 3 | **Tenant-Scoped Data Isolation Audit** | HIGH | Verify that ALL API queries properly filter by `tenantId` so Clinic A can never access Clinic B's patients, care plans, or check-ins. | Not started |
| 4 | **Production-Ready Session Management** | MEDIUM | Sessions are currently in-memory and lost on server restart. For a deployed pilot, sessions should be database-backed or use a persistent store. | Not started |
| 5 | **Tenant Onboarding Workflow** | MEDIUM | No guided flow for creating a new clinic, setting up its first admin, and configuring it. Currently manual via the Tenants tab + Team tab. | Not started |
| 6 | **Password Change / Account Setup Flow** | MEDIUM | Verify password change is fully wired up for pilot clinic staff. Confirm patient password creation flow works end-to-end. | Not verified |
| 7 | **Tenant-Specific Branding / Settings** | LOW | No per-clinic customization (logo, clinic name in patient-facing UI, etc.) beyond the tenant name in the database. | Not started |
| 8 | **Deployment / Publishing** | LOW (last step) | App has not been published to a live URL yet for pilot clinics to access. | Not started |

---

## Environment Configuration

| Variable | Current Value | Purpose |
|----------|---------------|---------|
| `DEMO_MODE` | `false` | Controls demo mode features (reset button, simplified patient auth, sample docs). Set as a Secret in Replit. |
| `NODE_ENV` | (not set) | When set to `production`, forces production behavior regardless of `DEMO_MODE`. |
| `ALLOW_SEED` | (not set) | Safety guard — must be `true` for force-reseed to run. Set temporarily during demo reset. |

**To enable demo mode:** Change the `DEMO_MODE` secret in Replit's Secrets tab from `false` to `true`, then restart the app.

---

## User Roles & Access

| Role | Scope | Can Manage Tenants | Can Manage Team | Can Create Care Plans | Can Reset Demo |
|------|-------|-------------------|-----------------|----------------------|----------------|
| `super_admin` | Platform-wide (`tenantId = null`) | Yes | Yes (all tenants) | No (not tied to a clinic) | Yes (via Admin Dashboard, when in demo mode) |
| `admin` | Single tenant | No | Yes (own tenant only) | No | Yes (via Admin Dashboard, when in demo mode) |
| `clinician` | Single tenant | No | No | Yes | No (no access to Admin Dashboard) |

**Note:** The "Reset Demo" button also appears on the Login page (accessible to anyone, no auth required) when demo mode is enabled. The clinician dashboard has a reset button in its UI but it calls the same auth-protected endpoint, so it functions only for logged-in clinicians.

---

## Test Credentials

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `admin` | `password123` |
| Clinician | `nurse` | `password123` |

All demo patients use PIN: **1234** (static, preserved between care plan sends).

See `DEMO_CREDENTIALS.md` and `TESTING_CREDENTIALS.md` for full details including patient portal URLs and access tokens.

---

## Key Files

| File | Purpose |
|------|---------|
| `server/routes.ts` | All API endpoints, auth middleware, business logic |
| `server/storage.ts` | Database storage interface and implementation |
| `server/seed.ts` | Demo data seeding script |
| `server/index.ts` | Server entry point, `isDemoMode` flag |
| `shared/schema.ts` | Drizzle ORM schema, Zod validation |
| `client/src/pages/admin-dashboard.tsx` | Admin UI — patients, alerts, team, tenants, audit log |
| `client/src/pages/clinician-dashboard.tsx` | Clinician UI — document upload, AI processing, care plan review |
| `client/src/pages/patient-portal.tsx` | Patient-facing care plan view, check-in |

---

## Notes & Decisions

- **Feb 18, 2026:** Fixed PIN overwrite bug — existing patients no longer get random PINs when care plans are re-sent.
- **Feb 18, 2026:** Reset Nguyen Thi Lan and Mei-Ling Chen PINs back to 1234 via direct DB update.
- **Feb 18, 2026:** Created this pilot plan document for tracking across sessions.

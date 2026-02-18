# Litera.ai — Pilot Readiness Plan (2-5 Clinics)

**Last Updated:** February 18, 2026

---

## Goal

Take Litera.ai from a single-demo-clinic MVP to a platform that can onboard 2-5 real clinics while keeping demo clinics available for sales and training.

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
| 7 | **Two Demo Tenants with Seed Data** | "Riverside Community Health" (slug: `riverside`) and "Lakeside Family Medicine" (slug: `lakeside`), each with 1 clinician, 1 clinic admin, and 5 patients with care plans at various statuses. Validates multi-tenant isolation. |
| 8 | **Demo Reset Feature** | "Reset Demo" button reseeds BOTH demo tenants. Preserves non-demo tenants and super admin. Super admins can reset regardless of `DEMO_MODE`. |
| 9 | **Tenant-Scoped Sample Documents** | Clinician dashboard sample docs dropdown dynamically filtered by tenant slug. Each clinician sees only their own tenant's patients plus shared/unassigned docs. |
| 10 | **Patient Authentication** | Two modes: simplified (demo — last name + year of birth) and full (production — last name + year of birth + PIN). Patient password creation flow available. |
| 11 | **Static PIN Preservation** | Sending a care plan to an existing patient no longer overwrites their PIN. Demo patients keep PIN `1234`. |
| 12 | **AI Content Pipeline** | Document upload, extraction, simplification (5th-grade reading level), and translation (49 languages) via OpenAI GPT-4o. |
| 13 | **Patient Portal** | Magic link access, language toggling, text-to-speech, traffic light check-in system. |
| 14 | **Email Delivery** | Care plans sent via Resend with magic links. |
| 15 | **Audit Logging** | Actions tracked in audit log table, scoped per tenant. |
| 16 | **CSV Export** | TCM billing compliance export from Admin Dashboard. |
| 17 | **Rate Limiting & Security** | Server-side rate limiting, bcrypt password hashing, Zod validation on API endpoints. |
| 18 | **Production-Ready Session Management** | PostgreSQL-backed sessions via `connect-pg-simple`. Sessions survive server restarts. Configured with secure cookies, httpOnly, sameSite, 24-hour maxAge. |
| 19 | **Tenant Isolation Audit** | All API endpoints audited for tenant scoping. Alert resolution checks tenant ownership. Tenant CRUD restricted to super admins. |
| 20 | **Multi-Tenant Isolation Verified** | End-to-end smoke tests confirm: clinicians see only their tenant's care plans; admins see only their tenant's team/alerts; super admin sees everything; patient portal works per-tenant; demo reset reseeds both tenants correctly. |

---

### COMPLETED — This Session

| # | Feature | Details |
|---|---------|---------|
| 21 | **Auth Flow Validation** | All staff auth flows verified (login/logout/password change for all 3 roles). Patient auth flows verified (PIN verification, password creation, password login). |
| 22 | **Patient Data Security Fix** | `/api/patient/:token` endpoint no longer exposes patient PIN or password. Returns a `safePatient` object with only non-sensitive fields plus a `hasPassword` boolean flag. |
| 23 | **AI Pipeline Error Handling** | Upload endpoint validates file types (PDF, JPEG, PNG, WebP, GIF, HEIC) and size (20MB max). Specific error messages for AI failures, timeouts, and unreadable documents. |
| 24 | **Email Delivery Error Handling** | Send endpoint returns `emailSent` flag. Frontend shows specific toast when email fails but care plan is saved successfully. |
| 25 | **Patient Portal Error Handling** | Expired access tokens return 410 status. Frontend distinguishes "Link Expired" from "Not Found" with specific messaging. Improved check-in error messages. |
| 26 | **Multer Config Alignment** | Multer fileFilter and limits aligned with route-level validation (20MB, same allowed file types). |

### OUTSTANDING — Prioritized for Pilot

| # | Feature | Priority | Details | Status |
|---|---------|----------|---------|--------|
| 1 | **Tenant Onboarding Workflow** | MEDIUM | No guided flow for creating a new clinic. Currently manual via Tenants tab + Team tab. Works but could be streamlined. | Not started (manual setup sufficient for 2-5 clinics) |
| 2 | **Tenant-Specific Branding / Settings** | LOW | No per-clinic customization (logo, clinic name in patient-facing UI). | Not started |
| 3 | **Deployment / Publishing** | LAST | App has not been published to a live URL yet. Should be done after all pilot features are validated. | Not started |

---

## Two-Tenant Demo Configuration

### Tenant 1: Riverside Community Health (slug: `riverside`)

| Role | Username | Password | Name |
|------|----------|----------|------|
| Clinic Admin | `riverside_admin` | `password123` | Dr. James Park |
| Clinician | `nurse` | `password123` | Maria Chen, RN |

**Patients:** Rosa Martinez (es), Nguyen Thi Lan (vi), Wei Zhang (zh), Amadou Diallo (fr), Olga Petrov (ru)

**Care Plan Statuses:** 1 sent (Rosa, green check-in), 1 approved (Nguyen), 1 pending review (Wei), 2 drafts (Amadou, Olga)

### Tenant 2: Lakeside Family Medicine (slug: `lakeside`)

| Role | Username | Password | Name |
|------|----------|----------|------|
| Clinic Admin | `lakeside_admin` | `password123` | Dr. Rachel Torres |
| Clinician | `lakeside_nurse` | `password123` | Sarah Kim, NP |

**Patients:** Fatima Al-Hassan (ar), Aisha Rahman (ar), Arjun Sharma (hi), Pedro Gutierrez (es), Tran Van Duc (vi)

**Care Plan Statuses:** 1 sent (Aisha, yellow alert check-in), 1 approved (Pedro), 3 drafts (Fatima, Arjun, Tran)

### Platform Super Admin

| Role | Username | Password | Name |
|------|----------|----------|------|
| Super Admin | `admin` | `password123` | Angela Torres |

All demo patients use PIN: **1234**

See `DEMO_CREDENTIALS.md` and `TESTING_CREDENTIALS.md` for full details including patient portal URLs and access tokens.

---

## Environment Configuration

| Variable | Current Value | Purpose |
|----------|---------------|---------|
| `DEMO_MODE` | `false` | Controls demo mode features (reset button on login, simplified patient auth, sample docs). Set as a Secret in Replit. |
| `NODE_ENV` | (not set) | When set to `production`, forces production behavior regardless of `DEMO_MODE`. |
| `ALLOW_SEED` | (not set) | Safety guard — must be `true` for force-reseed to run. Set temporarily during demo reset. |

**To enable demo mode:** Change the `DEMO_MODE` secret in Replit's Secrets tab from `false` to `true`, then restart the app.

---

## User Roles & Access

| Role | Scope | Can Manage Tenants | Can Manage Team | Can Create Care Plans | Can Reset Demo |
|------|-------|-------------------|-----------------|----------------------|----------------|
| `super_admin` | Platform-wide (`tenantId = null`) | Yes | Yes (all tenants) | No (not tied to a clinic) | Yes (always, regardless of demo mode) |
| `admin` | Single tenant | No | Yes (own tenant only) | No | Yes (when demo mode enabled) |
| `clinician` | Single tenant | No | No | Yes | No (no access to Admin Dashboard) |

**Note:** The "Reset Demo" button also appears on the Login page (accessible to anyone, no auth required) when demo mode is enabled. Super admins always see the reset button in the Admin Dashboard regardless of demo mode setting.

---

## Key Files

| File | Purpose |
|------|---------|
| `server/routes.ts` | All API endpoints, auth middleware, business logic |
| `server/storage.ts` | Database storage interface and implementation |
| `server/seed.ts` | Demo data seeding — creates both demo tenants with all staff, patients, care plans |
| `server/index.ts` | Server entry point, `isDemoMode` flag |
| `shared/schema.ts` | Drizzle ORM schema, Zod validation |
| `client/src/pages/admin-dashboard.tsx` | Admin UI — patients, alerts, team, tenants, audit log |
| `client/src/pages/clinician-dashboard.tsx` | Clinician UI — document upload, AI processing, care plan review, tenant-scoped sample docs |
| `client/src/pages/patient-portal.tsx` | Patient-facing care plan view, check-in |
| `client/src/pages/login.tsx` | Login page with demo credentials for both tenants |
| `DEMO_CREDENTIALS.md` | Full credential reference for both demo tenants |
| `TESTING_CREDENTIALS.md` | Comprehensive testing guide with scenarios for multi-tenant isolation |

---

## Notes & Decisions

- **Feb 18, 2026:** Fixed PIN overwrite bug — existing patients no longer get random PINs when care plans are re-sent.
- **Feb 18, 2026:** Reset Nguyen Thi Lan and Mei-Ling Chen PINs back to 1234 via direct DB update.
- **Feb 18, 2026:** Created this pilot plan document for tracking across sessions.
- **Feb 18, 2026:** Completed items 1-4: Super admin reset access, per-tenant demo reset, tenant isolation audit, production sessions. Alert resolution now checks tenant ownership. Tenant management endpoints restricted to super admins only.
- **Feb 18, 2026:** Implemented second demo tenant (Lakeside Family Medicine) to validate multi-tenant isolation. Split 10 patients 5/5 between Riverside and Lakeside. Each tenant has its own clinician, clinic admin, care plans at various statuses, check-ins, and audit logs. Sample docs dropdown is now tenant-scoped. Login page updated with both tenants' credentials.
- **Feb 18, 2026:** Full end-to-end smoke test passed: patient portal verification + check-in for both tenants, admin dashboard isolation (care plans, team, alerts), demo reset reseeds both tenants correctly with fresh tokens.

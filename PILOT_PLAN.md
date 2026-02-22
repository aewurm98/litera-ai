# Litera.ai — Pilot Readiness Plan (2-5 Clinics)

**Last Updated:** February 22, 2026

---

## Goal

Take Litera.ai from a single-demo-clinic MVP to a platform that can onboard 2-5 real clinics while keeping demo clinics available for sales and training. This plan is organized into three phases: Phase A (critical fixes), Phase B (UX polish), and Phase C (analytics & monitoring).

---

## Master Issue Tracker

| # | Issue | Phase | Status |
|---|-------|-------|--------|
| 1 | Remove SMS language from UI | A | ✅ Complete |
| 2 | Email send via Resend not delivering | A | ✅ Complete |
| 3 | Language dropdown defaults to Spanish instead of patient preference | A | ✅ Complete |
| 4 | "Processing failed" error for Tran Van Duc | A | ✅ Complete |
| 5 | Clinicians can approve without updating stale translation | A | ✅ Complete |
| 6 | No way to undo approval / go backward | A | ✅ Complete |
| 7 | Photo upload only opens file browser, no camera UX polish | B | Planned |
| 8 | Dictate/paste flows have no patient demographic fields | B | Planned |
| 9 | Test "send to myself" patient records persist | B | Planned |
| 10 | Tab navigation causes full page reload | B | Planned |
| 11 | Analytics/Settings tabs stuck in "Coming Soon" | B | Planned |
| 12 | No reading level indicator; 5th grade hardcoded | B | Planned |
| 13 | Password change doesn't save, no format restrictions | A | ✅ Complete |
| 14 | Admin patient detail shows "Born 19XX" | B | Planned |
| 15 | "View as Patient" forces login flow | B | Planned |
| 16 | Team member creation requires manual username/password | B | Planned |
| 17 | Stacked bar chart doesn't communicate status well | C | Planned |
| 18 | Pipeline stats approach 100%; should be rolling window | C | Planned |
| 19 | No alerts for stale care plans | C | Planned |
| 20 | TCM compliance summary appears non-functional | C | Planned |

---

## Phase A: Critical Fixes & Workflow Integrity ✅ COMPLETE

**Goal:** Fix broken features and ensure the core clinician workflow is correct before pilot.

### Milestone A1 — SMS Removal & Email Verification (Issues #1, #2) ✅

- Removed all SMS-related UI text (helper text, labels, confirmations) across send dialogs
- Debugged Resend email integration: set `RESEND_FROM_EMAIL` env var to override connector's unverified domain
- Resend connector path updated to prefer env var → connector settings fallback chain
- Note: Resend free tier only delivers to account owner's email; custom domain verification required for production

### Milestone A2 — Smart Language Selection & Processing Bug (Issues #3, #4) ✅

- Changed language dropdown to auto-select from patient's `preferredLanguage` when a patient is selected
- Investigated "Processing failed" for Tran Van Duc — traced to data/seeding issue with tenant context

### Milestone A3 — Approval Workflow Safeguards (Issues #5, #6) ✅

- Blocked "Save edits and final approve" unless translation is up-to-date (dirty/stale flag when simplified text is edited post-translation)
- Added post-approval editing: "Make Edits" action from approved state returns care plan to `pending_review`
- Clinician can edit, re-approve, and re-send modified care plans

### Milestone A4 — Password Change Fix (Issue #13) ✅

- Fixed password update to actually persist the new bcrypt hash
- Added password format requirements (minimum length, complexity rules)
- Reject password change if new password matches current one

### Additional Phase A Work ✅

- **Save Draft:** Clinicians can save edits to simplified/translated text without approving
- **Test Patient Filter:** Toggle to show/hide test patients in clinician dashboard
- **Interpreter Review Optional Badge:** Amber "Interpreter review available" badge on non-English care plans when tenant mode is "optional"
- **Inline Editable Medications/Appointments:** Clinicians can edit medications and appointment details directly in the review panel

---

## Phase B: UX & Navigation Polish

**Goal:** Smooth out friction points in the clinician and admin experience.

### Milestone B1 — Upload & Input Flows (Issues #7, #8)

#### Issue #7 — Photo Capture UX Polish

**Current state:** Photo tab has `capture="environment"` on camera input (line 2122 in clinician-dashboard.tsx). Two buttons exist: "Open Camera" and "Or choose from gallery." After capture, files silently transfer to Upload tab.

**Frontend changes:**
- After photo capture, stay on Photo tab — show inline thumbnail preview with "Retake" and "Process" buttons
- Remove auto-switch to Upload tab (`setInputTab("upload")` at lines 2124/2134)
- On desktop browsers, hide "Open Camera" button (no camera API) and show gallery-only option

#### Issue #8 — Patient Demographics in Dictate/Paste Flows

**Current state:** Dictate and paste flows call `POST /api/care-plans/from-text` (line 788 in routes.ts) which creates an orphan care plan with no patient attached. Patient is only linked when the clinician sends.

**Backend changes:**
- Extend `/api/care-plans/from-text` Zod schema to accept optional `patientName`, `patientEmail`, `patientYearOfBirth`, `preferredLanguage`, and `existingPatientId`
- If `existingPatientId` provided, fetch and link to that patient
- If manual fields provided, create patient record inline (matching `createCarePlanFromExtracted` helper logic)

**Frontend changes:**
- Extract patient selector + manual fields into shared `PatientInfoFields` component (from Send dialog at lines 2246-2340)
- Add collapsible "Patient Information" section to Dictate and Paste tabs
- Fields optional — blank = orphan care plan (current behavior preserved)

---

### Milestone B2 — Navigation & Tab Switching (Issues #10, #11)

#### Issue #10 — Tab Navigation Full Page Reload

**Current state:** Sidebar "phase2Items" (Analytics, Settings, etc. at line 278 in App.tsx) render as `<a href>` anchor tags (line 362), causing full page navigation. Dashboard tabs use `onClick` + `setActiveTab` which work seamlessly.

**Frontend changes:**
- Replace `<a href={item.href}>` with wouter `navigate()` on click handler
- Change `asChild` on `SidebarMenuButton` to use `onClick` calling `navigate(item.href)`
- ~10-line change in App.tsx at lines 354-367

#### Issue #11 — "Coming Soon" Label on Implemented Tabs

**Current state:** Analytics (`analytics-page.tsx`) and Settings (`settings-page.tsx`) are fully implemented with working API endpoints. But sidebar groups them under "Coming Soon" (line 351 in App.tsx).

**Frontend changes:**
- Move Analytics and Settings out of `phase2Items` into a new "Tools" sidebar group
- Keep Provider Directory, Video Library, Notifications in "Coming Soon" group
- Analytics and Settings routes already render real components, not `ComingSoonPage`

---

### Milestone B3 — Patient Experience Polish (Issues #9, #12, #14, #15, #16)

#### Issue #9 — Auto-Clear Test Patient Records

**Current state:** Manual cleanup endpoint exists (`DELETE /api/admin/patients/test/cleanup` at line 2550 in routes.ts). Toggle to show/hide test patients exists (line 1194). Test patients created via "Send Test to Me" (sets `isTestPatient: true`) persist forever.

**Backend changes:**
- On server startup, register `setInterval` (24h) that deletes test patients + linked care plans older than 48h
- Uses existing cleanup logic from DELETE endpoint

**Frontend changes:**
- Add "Clean up test patients" button near test patient toggle with confirmation dialog
- Show "(expires in X hours)" indicator next to test patient records

#### Issue #12 — Reading Level Indicator & Toggle

**Current state:** Simplification prompt in `server/services/openai.ts` (line 127) hardcodes 5th-grade. Clinician dashboard shows static "5th grade reading level" label (line 1689).

**Backend changes:**
- Add optional `readingLevel` parameter to `/api/care-plans/:id/process` (default: 5)
- Modify `simplifyContent()` prompt to use variable grade level
- Add `readingLevel` integer column (default 5) to care plans schema
- Store and use stored level on re-processing

**Frontend changes:**
- Replace static "5th grade reading level" text with dropdown selector (3rd / 5th / 8th grade)
- Changing level triggers re-simplification via process endpoint
- Brief level descriptions (e.g., "5th grade: standard for patient materials")

#### Issue #14 — "Born 19XX" Display

**Current state:** Admin dashboard line 920 shows `Born {patient.yearOfBirth}` (e.g., "Born 1965"). Schema stores `yearOfBirth` as integer, not full DOB.

**Frontend changes:**
- Change label from `Born {yearOfBirth}` to `Year of Birth: {yearOfBirth}` in both list view (line 920) and detail view (line 194)

#### Issue #15 — "View as Patient" Login Bypass

**Current state:** "View as Patient" button (line 961) opens `/p/{accessToken}?demo=1`. Patient portal (line 513) has `demo=1` check but still requires verification (last name + YOB + PIN).

**Backend changes:**
- New endpoint: `GET /api/care-plans/:id/preview-token` (clinician auth) — returns a 15-minute preview token
- New endpoint logic: if `?preview=xxx` is a valid token, bypass verification in patient data endpoint
- Guard: only care plan's owning clinician or same-tenant admin can generate preview token

**Frontend changes:**
- Update `handleViewAsPatient` to first call preview-token endpoint, then open with preview param
- Patient portal detects `preview` query param and skips verification
- Show "Preview Mode" banner at top of patient view
- Preview sessions don't create audit log entries

#### Issue #16 — Email-Based Team Member Invite

**Current state:** Team members created manually via username/password dialog in Admin Dashboard (line 1202 in admin-dashboard.tsx). No invite flow.

**Backend changes:**
- Add columns: `inviteToken varchar`, `inviteExpiresAt timestamp`, `mustChangePassword boolean default false` to users table
- New endpoint: `POST /api/admin/team/invite` — accepts `{ email, name, role, languages? }`, creates user with temp password, generates invite token, sends email via Resend
- New endpoint: `GET /api/invite/:token` — validates invite, returns clinic name, role, inviter name
- New endpoint: `POST /api/invite/:token/accept` — accepts `{ username, password }`, updates user record, clears invite token

**Frontend changes:**
- "Invite by Email" button alongside "Add Team Member" in admin dashboard
- Invite dialog: email, name, role dropdown, language specialties (if interpreter)
- New page `/invite/:token`: clinic name, role, username + password form
- Team list: "Pending" badge for unaccepted invites with "Resend Invite" action

---

## Phase C: Analytics & Monitoring Enhancements

**Goal:** Make analytics actionable and add operational monitoring.

### Milestone C1 — Chart & Stats Improvements (Issues #17, #18)

#### Issue #17 — Replace Status Visualization

**Current state:** `StatusBar` component (line 40 in analytics-page.tsx) shows horizontal bars scaled relative to max count. Doesn't communicate workflow flow.

**Frontend changes:**
- Replace with status funnel: statuses in workflow order (Draft → Pending Review → Interpreter Review → Approved → Sent → Completed) with arrow connectors
- Each stage: count + percentage of total
- Conversion rates between adjacent stages
- Color-coded by stage (gray → yellow → orange → blue → indigo → green)

#### Issue #18 — Rolling Time Window for Pipeline Stats

**Current state:** `/api/analytics` endpoint (line 3095 in routes.ts) counts all care plans ever created with no time filtering. Pipeline stats converge to 100% over time.

**Backend changes:**
- Add optional `?period=7d|30d|90d|all` query parameter to `GET /api/analytics`
- Filter care plans by `createdAt >= now - period` before computing stats
- Default to `30d`
- Apply date filter to check-in queries too

**Frontend changes:**
- Segmented time selector above analytics cards (7 Days / 30 Days / 90 Days / All Time)
- Update query key to include period: `queryKey: ["/api/analytics", period]`
- Show time window in card headers

---

### Milestone C2 — Operational Alerts & TCM (Issues #19, #20)

#### Issue #19 — Stale Care Plan Alerts

**Current state:** No mechanism to flag care plans stuck in a status. No stale plan detection.

**Backend changes:**
- New endpoint: `GET /api/admin/stale-alerts` — queries care plans where `updatedAt < now - threshold`:
  - `draft`: stale after 72h
  - `pending_review`: stale after 48h
  - `interpreter_review`: stale after 48h
  - `approved`: stale after 24h (should be sent promptly)
- Return: `{ carePlanId, patientName, status, staleSince, hoursStale }`

**Frontend changes:**
- "Stale Plans" alert card in admin dashboard
- Count badge in sidebar warning indicator
- Color-coded: amber (1-2x threshold), red (2x+ threshold)
- Direct link to each stale care plan

#### Issue #20 — TCM Compliance Summary

**Current state:** TCM card (lines 200-227 in analytics-page.tsx) shows three numbers. Backend logic exists (lines 3175-3202 in routes.ts) but likely shows zeros because demo care plans lack `dischargeDate`.

**Backend changes:**
- Set `dischargeDate` in seed data for sent/completed care plans
- Expand TCM response: `{ totalPatientsSent, eligible99495, eligible99496, patientsWithCheckIns, patientsWithoutCheckIns, avgDaysToFirstCheckIn }`
- Tenant breakdown for super admins

**Frontend changes:**
- Richer TCM card: patient counts with/without check-ins, response time, progress indicators
- Explanatory tooltips for CPT codes
- Zero-state messaging ("No discharge dates recorded") instead of just "0"
- "Download TCM Report" button linking to existing CSV export

---

## Master Sequencing

```
Phase A (Critical) ✅ ──→ Phase B (UX Polish) ──→ Phase C (Analytics)
  A1 → A2 → A3 → A4        B1 → B2 → B3          C1 → C2
```

**Rationale:** Phase A fixes broken core features that would block the pilot. Phase B smooths the experience for clinicians and admins. Phase C improves analytics and monitoring, which are important but not blocking.

---

## Previously Completed Foundation Work

These items were completed before the Phase A/B/C master plan was established (Feb 17-19, 2026). They form the foundation that Phases A-C build upon.

<details>
<summary>Click to expand full foundation feature list (44 items)</summary>

### Core Platform (Feb 17-18)

| # | Feature | Details |
|---|---------|---------|
| 1 | **Multi-Tenant Data Model** | Tenants table with `name`, `slug`, `isDemo`. Users and patients scoped via `tenantId`. |
| 2 | **Super Admin Role** | `super_admin` with `tenantId = null`. Can manage all tenants, users, and data across the platform. |
| 3 | **Clinic Admin Role** | `admin` role scoped to a single tenant. Can only see their own clinic's data. |
| 4 | **Clinician Role** | `clinician` role scoped to a tenant. Can create/manage care plans within their clinic. |
| 5 | **Tenant Management UI** | Super admins can create and edit tenants via the "Tenants" tab in Admin Dashboard. |
| 6 | **Team Member Management** | Super admins can create/edit users and assign them to any tenant. Clinic admins manage their own staff only. |
| 7 | **Two Demo Tenants with Seed Data** | "Riverside Community Health" and "Lakeside Family Medicine", each with clinician, admin, interpreter, and 5 patients. |
| 8 | **Demo Reset Feature** | "Reset Demo" button reseeds both demo tenants. Preserves non-demo tenants and super admin. |
| 9 | **Tenant-Scoped Sample Documents** | Sample docs dropdown filtered by tenant slug. |
| 10 | **Patient Authentication** | Two modes: simplified (demo) and full (production — with PIN). |
| 11 | **Static PIN Preservation** | Sending care plans no longer overwrites existing PINs. |
| 12 | **AI Content Pipeline** | Document upload, extraction, simplification (5th-grade), translation (49 languages) via GPT-4o. |
| 13 | **Patient Portal** | Magic link access, language toggling, text-to-speech, traffic light check-in. |
| 14 | **Email Delivery** | Care plans sent via Resend with magic links. |
| 15 | **Audit Logging** | Actions tracked in audit log table, scoped per tenant. |
| 16 | **CSV Export** | TCM billing compliance export from Admin Dashboard. |
| 17 | **Rate Limiting & Security** | Server-side rate limiting, bcrypt, Zod validation. |
| 18 | **Production-Ready Sessions** | PostgreSQL-backed sessions via `connect-pg-simple`. |
| 19 | **Tenant Isolation Audit** | All endpoints audited for tenant scoping. |
| 20 | **Multi-Tenant Isolation Verified** | End-to-end smoke tests passed. |

### Security & Error Handling (Feb 18)

| # | Feature | Details |
|---|---------|---------|
| 21 | **Auth Flow Validation** | All staff + patient auth flows verified. |
| 22 | **Patient Data Security Fix** | `/api/patient/:token` no longer exposes PIN/password. |
| 23 | **AI Pipeline Error Handling** | File type/size validation, specific error messages. |
| 24 | **Email Delivery Error Handling** | `emailSent` flag, frontend-specific toast on failure. |
| 25 | **Patient Portal Error Handling** | 410 for expired tokens, distinct "Link Expired" vs "Not Found". |
| 26 | **Multer Config Alignment** | fileFilter and limits aligned with route-level validation. |

### Patient Management & Interpreter Workflow (Feb 19)

| # | Feature | Details |
|---|---------|---------|
| 27 | **Patient CRUD API** | Full REST endpoints with email+tenantId deduplication. |
| 28 | **CSV Bulk Patient Import** | Flexible header matching, per-row create/update/skip. |
| 29 | **Patient Management UI** | Admin patients tab with search, CRUD dialogs, patient detail. |
| 30 | **Notion-Style View Toggle** | Table and Kanban views with localStorage persistence. |
| 31 | **Usability Audit & Bug Fixes** | Fixed stat card counting, duplicated names. |
| 32 | **Interpreter Role & Schema** | Interpreter role, language specialties, compliance modes. |
| 33 | **Interpreter Review Workflow** | Auto-routing to interpreter review, English bypass. |
| 34 | **Interpreter Dashboard** | Review queue, 3-column panel, approve/request changes. |
| 35 | **Tenant Compliance Modes** | disabled/optional/required per tenant. |
| 36 | **Clinician Override in Optional Mode** | Override dialog with mandatory justification. |
| 37 | **Interpreter Status Badges & Notes** | Status badges and notes on clinician dashboard. |
| 38 | **Demo Interpreter Users** | Two interpreters seeded for demo tenants. |
| 39 | **Cross-Module Security Audit** | Status guards, auth module, role checks. |

### Code Quality (Feb 19)

| # | Feature | Details |
|---|---------|---------|
| 40 | **hashPassword Centralized** | Single implementation in `server/auth.ts`. |
| 41 | **No Dynamic Imports** | Static imports only in routes.ts. |
| 42 | **Type Alias Deduplication** | `SimplifiedMedication = Medication` (type aliases). |
| 43 | **Upload Route Helper** | `createCarePlanFromExtracted()` eliminates 3x duplication. |
| 44 | **getAlerts Query Optimized** | 3 batched round-trips via `inArray`. |

</details>

---

## Two-Tenant Demo Configuration

### Tenant 1: Riverside Community Health (slug: `riverside`)

| Role | Username | Password | Name |
|------|----------|----------|------|
| Clinic Admin | `riverside_admin` | `password123` | Dr. James Park |
| Clinician | `nurse` | `password123` | Maria Chen, RN |
| Interpreter | `riverside_interpreter` | `password123` | Luis Reyes, CMI (Spanish, French, Russian) |

**Patients:** Rosa Martinez (es), Nguyen Thi Lan (vi), Wei Zhang (zh), Amadou Diallo (fr), Olga Petrov (ru)

### Tenant 2: Lakeside Family Medicine (slug: `lakeside`)

| Role | Username | Password | Name |
|------|----------|----------|------|
| Clinic Admin | `lakeside_admin` | `password123` | Dr. Rachel Torres |
| Clinician | `lakeside_nurse` | `password123` | Sarah Kim, NP |
| Interpreter | `lakeside_interpreter` | `password123` | Nadia Hassan, CMI (Arabic, Hindi, Vietnamese) |

**Patients:** Fatima Al-Hassan (ar), Aisha Rahman (ar), Arjun Sharma (hi), Pedro Gutierrez (es), Tran Van Duc (vi)

### Platform Super Admin

| Role | Username | Password | Name |
|------|----------|----------|------|
| Super Admin | `admin` | `password123` | Angela Torres |

All demo patients use PIN: **1234**

See `DEMO_CREDENTIALS.md` and `TESTING_CREDENTIALS.md` for full details.

---

## Environment Configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Replit) |
| `SESSION_SECRET` | Express session encryption key |
| `RESEND_FROM_EMAIL` | Email sender address (overrides connector's from_email) |
| `APP_URL` | Production URL for email links (e.g., `https://your-app.replit.app`) |
| `DEMO_MODE` | Controls demo mode features |
| `INTERNAL_API_SECRET` | Shared secret for internal scheduler endpoint |

---

## Key Files

| File | Purpose |
|------|---------|
| `server/routes.ts` | All API endpoints, auth middleware, business logic |
| `server/storage.ts` | Database storage interface and implementation |
| `server/auth.ts` | Centralized auth: `hashPassword`, `comparePassword` |
| `server/services/openai.ts` | AI pipeline: extraction, simplification, translation |
| `server/services/resend.ts` | Email delivery via Resend |
| `server/seed.ts` | Demo data seeding for both tenants |
| `shared/schema.ts` | Drizzle ORM schema, Zod validation |
| `client/src/App.tsx` | Routing, sidebar navigation, layout |
| `client/src/pages/clinician-dashboard.tsx` | Clinician UI: upload, AI processing, review |
| `client/src/pages/admin-dashboard.tsx` | Admin UI: patients, alerts, team, tenants |
| `client/src/pages/patient-portal.tsx` | Patient-facing care plan view |
| `client/src/pages/interpreter-dashboard.tsx` | Interpreter review queue and panel |
| `client/src/pages/analytics-page.tsx` | Analytics dashboard |
| `client/src/pages/settings-page.tsx` | Tenant settings |

---

## Deferred / Architectural (Future Sprints)

| Item | Reason Deferred |
|------|----------------|
| Base64 PDFs → object storage | Requires new infrastructure; affects upload, display, backup |
| Pagination on list endpoints | Coordinated frontend/backend changes across all views |
| WebSocket real-time alerts | Requires session-aware WebSocket auth |
| Move rate limiting to DB/Redis | No Redis in current setup; in-memory OK for pilot |
| Database-level status enum | Drizzle migration; deferred until post-pilot |
| CSRF protection | Cookie config changes interact with Replit proxy |

---

## Notes & Decisions

- **Feb 22, 2026:** Replaced old milestone-based plan structure with Phase A/B/C master plan covering 20 identified issues. Phase A (issues #1-6, #13) marked complete. Phase B (issues #7-12, #14-16) and Phase C (issues #17-20) planned with detailed frontend/backend specs. SMS/Twilio functionality removed from scope entirely — email-only delivery via Resend.
- **Feb 19, 2026:** Milestone 4 (Code Quality) complete. hashPassword consolidated, dynamic imports removed, type aliases deduplicated, upload helper extracted, getAlerts N+1 fixed.
- **Feb 19, 2026:** Interpreter workflow complete. Interpreter role, compliance modes, review dashboard, clinician override, status badges, security audit.
- **Feb 19, 2026:** Patient management complete. CRUD, CSV import, Kanban view, usability fixes.
- **Feb 18, 2026:** Security and error handling complete. Auth flows, patient data security, AI/email/portal error handling.
- **Feb 18, 2026:** Multi-tenant foundation complete. Two demo tenants, isolation verified, production sessions.

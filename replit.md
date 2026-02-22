# Litera.ai - Healthcare Discharge Communication Platform

## Overview

Litera.ai is a healthcare companion platform that assists clinicians in generating simplified, translated discharge instructions for patients with Limited English Proficiency (LEP). The platform uses AI to extract, simplify (to configurable reading levels: 3rd/5th/8th grade), and translate medical content. These instructions are delivered to patients via email, accessible through a magic link. The system also includes a traffic light check-in feature for Transitional Care Management (TCM) billing compliance. The project aims to improve patient understanding and health outcomes, especially for LEP populations, by providing accessible and clear post-discharge information.

## User Preferences

- SMS/Twilio functionality removed in Phase A cleanup — email-only delivery via Resend.

## Recent Changes (Feb 2026)

### Phase B - UX & Navigation Polish (Complete)
- Photo tab inline preview with lightbox
- Patient demographics in dictate/paste content flows
- Sidebar navigation fixes (correct highlighting, scrollable overflow)
- "Born 19XX" label fix showing full year of birth
- Test patient auto-cleanup (delete button + auto-clear on seed)
- Reading level selector (3rd/5th/8th grade) in clinician dashboard
- "View as Patient" preview bypass using demo token system (15-min expiry)
- Email-based team invitation system with 7-day expiry and registration flow

### Phase C - Analytics & Monitoring (Complete)
- Status funnel visualization with conversion rates on analytics page
- Rolling time window selector (7d/30d/90d/All time) filtering analytics data
- Stale care plan alerts (draft >48h, pending_review/approved >72h)
- Enhanced TCM compliance: contact within 2 days, CPT 99495 (response within 14d), CPT 99496 (response within 7d), missing discharge date warnings

### Phase D - Full Date of Birth Support (Complete)
- Added `dateOfBirth` (text, YYYY-MM-DD format) column to patients schema alongside existing `yearOfBirth`
- Backend: All patient CRUD endpoints (create, update, CSV import, send) accept `dateOfBirth`, auto-derive `yearOfBirth`
- Frontend: Admin dashboard create/edit forms use date picker; display shows full DOB with yearOfBirth fallback
- Seed data includes full DOB for all demo patients
- CSV import recognizes DOB headers: dateofbirth, date of birth, dob, date_of_birth, birthday

### Phase E - Pre-Publish Bug Fixes & UX Improvements (Complete)
- View as Patient: Added to admin table view (ExternalLink icon per patient row); session-based auth bypass via `/api/admin/preview-access/:accessToken` so staff don't need to re-authenticate
- Patient auth upgraded: DOB date picker is now the default verification field for all patients; graceful year-only fallback for legacy patients without stored DOB
- Stale care plan alerts: Now show patient name + diagnosis instead of truncated IDs
- Role-based analytics: Interpreters see translation metrics only; clinicians see their own care plans' data (no TCM); admins see everything
- Role-based settings: Added "Your Account" card; interpreter review mode read-only for non-admins; team invites admin-only (already was)
- Chatbot UX: Larger bubble (w-16 h-16) with "Questions?" label; auto-expands on first portal visit; localStorage persistence to stay minimized after dismissal
- Enriched seed data: Sickle Cell and Stroke care plans now have full medications, appointments, instructions, warnings

### Phase F - DOB in Send Dialog, Password Recovery, Demo Email Flexibility (Complete)
- Send Care Plan dialog: Replaced Year of Birth number input with Date of Birth date picker; sends `dateOfBirth` to backend
- Paste/dictation flows: Updated to use DOB date picker instead of year input
- Patient matching fix: In demo mode, same email can be used for different patients (matched by name+email). In production, existing patient records are fully updated when resending
- Staff password recovery: Added `recoveryEmail`, `passwordResetToken`, `passwordResetExpiry` fields to users table
- Settings page: "Your Account" card now includes editable recovery email field
- Login page: "Forgot password?" link navigates to password reset flow
- Password reset page (`/reset-password`): Request reset via recovery email, 1-hour token expiry, set new password
- "Send Test to Me" now uses staff member's recovery email as default destination (falls back to generated address)
- Fixed DOM nesting warning: Badge in settings page now wrapped in `div` instead of `p`

## System Architecture

Litera.ai is built with a clear separation between its frontend, backend, and shared components.

### Frontend
- **Framework**: React with Vite
- **Styling**: Tailwind CSS and shadcn/ui
- **Routing**: wouter
- **State Management**: TanStack Query v5
- **Date Formatting**: `date-fns` `format()`
- **Design System**: "Trust Blue" theme (#1e40af) and Inter font.
- **UI/UX**: Features a 3-column review interface for clinicians, collapsible sections, color-coded medical content, and editable textareas. The patient portal offers multi-modal experience with UI translation in 7 languages, per-section text-to-speech, and print-friendly styles. `localStorage` preferences are scoped by user ID.

### Backend
- **Framework**: Express.js
- **Storage**: PostgreSQL database via Drizzle ORM. All list queries are tenant-scoped.
- **AI Integration**: OpenAI GPT-4o for content extraction, simplification, and translation. Supports both direct `OPENAI_API_KEY` (standard) and `AI_INTEGRATIONS_OPENAI_API_KEY` (Replit proxy) — prefers standard key when both are set.
- **Email Service**: Resend for email delivery. Supports both direct `RESEND_API_KEY` and Replit Connector proxy — prefers direct key when set.
- **Authentication**: Supports multi-factor authentication for patients (lastName + yearOfBirth + PIN/Password) and clinicians/interpreters. Uses robust session security and bcrypt hashing. Supports roles: super_admin, admin, clinician, interpreter.
- **Multi-Tenancy**: Isolates data between different clinics, managed by a super admin role.
- **Interpreter Review Workflow**: Medical interpreters can review and edit AI-generated translations. Tenant-level compliance controls (disabled/optional/required). English-language care plans bypass interpreter review.
- **Team Invitations**: Email-based invite system for adding team members with role assignment and 7-day token expiry.
- **Security**: Includes server-side rate limiting, Zod validation on API endpoints, session-gated patient portal, timing-safe token/PIN comparisons, comprehensive audit logging, environment-based feature flags, and status allowlist on send endpoint.
- **Required Environment Variables**: `DATABASE_URL`, `SESSION_SECRET`, and either `OPENAI_API_KEY` (standard) or `AI_INTEGRATIONS_OPENAI_API_KEY` (Replit). For email: either `RESEND_API_KEY` (standard) or Replit Connector. For production: set `APP_URL` for patient email links. See `MIGRATION_GUIDE.md` for full environment variable reference.
- **Optional Environment Variables**: `INTERNAL_API_SECRET`.

### Shared
- **Schema & Validation**: Drizzle ORM for database schema definition and Zod for API payload validation. Includes `teamInvitations` table for invite management.

### Key Features
- **Clinician Dashboard**: Document upload (PDF/images), AI-driven content processing (extraction, simplification to configurable reading levels, translation to 49 languages with back-translation), scroll-to-approve workflow, patient selector, interpreter review status display, and "View as Patient" preview.
- **Interpreter Dashboard**: Translation review queue filtered by language specialties, 3-column review panel with editable text areas, approve/request changes workflow with audit trail, and back-translation verification.
- **Patient Portal**: Magic link access with multi-factor verification, care plan display in preferred language, language toggling, a traffic light check-in system, and an AI-powered chatbot for care plan Q&A (grounded in the patient's actual care plan data, multilingual, rate-limited).
- **Admin Dashboard**: Patient roster management (CRUD, bulk import), patient detail with care plan history, alert monitoring, CSV export for TCM compliance, audit trail, and Notion-style view toggle (Table/Kanban).
- **Analytics Dashboard**: Status funnel with conversion rates, rolling time windows, stale care plan alerts, and TCM compliance metrics (CPT 99495/99496 eligibility).
- **Settings Page**: Team management with email invitations, role-based access controls.
- **Internationalization**: Support for 49 languages for content and 7 for UI.
- **Multi-Modal Output**: PDF download and text-to-speech.

## External Dependencies

- **OpenAI GPT-4o**: For AI-driven text extraction, simplification, and translation. Supports both standard API key and Replit AI Integrations proxy.
- **Resend**: Email API service for sending care plan emails and team invitations.
- **pdfjs-dist (legacy build)**: For PDF processing.
- **jsPDF**: Client-side library for generating PDF documents.
- **Web Speech API**: For text-to-speech functionality.
- **date-fns**: Date formatting library.

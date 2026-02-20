# Litera.ai - Healthcare Discharge Communication Platform

## Overview

Litera.ai is a healthcare companion platform that assists clinicians in generating simplified, translated discharge instructions for patients with Limited English Proficiency (LEP). The platform uses AI to extract, simplify (to a 5th-grade reading level), and translate medical content. These instructions are delivered to patients via email or SMS, accessible through a magic link. The system also includes a traffic light check-in feature for Transitional Care Management (TCM) billing compliance. The project aims to improve patient understanding and health outcomes, especially for LEP populations, by providing accessible and clear post-discharge information.

## User Preferences

- Twilio connector was dismissed — Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER) must be set manually as Replit secrets for SMS functionality.

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
- **SMS Service**: Twilio for SMS delivery of care plan links (requires manual secret setup). Gracefully degrades to email-only if Twilio credentials are not set.
- **Authentication**: Supports multi-factor authentication for patients (lastName + yearOfBirth + PIN/Password) and clinicians/interpreters. Uses robust session security and bcrypt hashing. Supports roles: super_admin, admin, clinician, interpreter.
- **Multi-Tenancy**: Isolates data between different clinics, managed by a super admin role.
- **Interpreter Review Workflow**: Medical interpreters can review and edit AI-generated translations. Tenant-level compliance controls (disabled/optional/required). English-language care plans bypass interpreter review.
- **Security**: Includes server-side rate limiting, Zod validation on API endpoints, session-gated patient portal, timing-safe token/PIN comparisons, comprehensive audit logging, environment-based feature flags, and status allowlist on send endpoint.
- **Required Environment Variables**: `DATABASE_URL`, `SESSION_SECRET`, and either `OPENAI_API_KEY` (standard) or `AI_INTEGRATIONS_OPENAI_API_KEY` (Replit). For email: either `RESEND_API_KEY` (standard) or Replit Connector. For production: set `APP_URL` for patient email links. See `MIGRATION_GUIDE.md` for full environment variable reference.
- **Optional Environment Variables**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `INTERNAL_API_SECRET`.

### Shared
- **Schema & Validation**: Drizzle ORM for database schema definition and Zod for API payload validation.

### Key Features
- **Clinician Dashboard**: Document upload (PDF/images), AI-driven content processing (extraction, simplification to 5th-grade, translation to 49 languages with back-translation), scroll-to-approve workflow, patient selector, and interpreter review status display.
- **Interpreter Dashboard**: Translation review queue filtered by language specialties, 3-column review panel with editable text areas, approve/request changes workflow with audit trail, and back-translation verification.
- **Patient Portal**: Magic link access with multi-factor verification, care plan display in preferred language, language toggling, and a traffic light check-in system.
- **Admin Dashboard**: Patient roster management (CRUD, bulk import), patient detail with care plan history, alert monitoring, CSV export for TCM compliance, audit trail, and Notion-style view toggle (Table/Kanban).
- **Internationalization**: Support for 49 languages for content and 7 for UI.
- **Multi-Modal Output**: PDF download, text-to-speech, and SMS delivery.

## External Dependencies

- **OpenAI GPT-4o**: For AI-driven text extraction, simplification, and translation. Supports both standard API key and Replit AI Integrations proxy.
- **Resend**: Email API service for sending care plan emails.
- **Twilio**: SMS delivery service for care plan links.
- **pdfjs-dist (legacy build)**: For PDF processing.
- **jsPDF**: Client-side library for generating PDF documents.
- **Web Speech API**: For text-to-speech functionality.
- **date-fns**: Date formatting library.
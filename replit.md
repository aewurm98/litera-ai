# Litera.ai - Healthcare Discharge Communication Platform

## Overview

Litera.ai is a healthcare companion platform designed to assist clinicians in generating simplified, translated discharge instructions for patients with Limited English Proficiency (LEP). The platform utilizes AI to extract, simplify (to a 5th-grade reading level), and translate medical content. These instructions are then delivered to patients via email, accessible through a magic link. The system also incorporates a traffic light check-in feature to ensure compliance with Transitional Care Management (TCM) billing requirements (CPT 99495/99496). The project aims to improve patient understanding and health outcomes, particularly for LEP populations, by providing accessible and clear post-discharge information.

## User Preferences

No specific user preferences were provided in the original document.

## System Architecture

Litera.ai is built with a clear separation between its frontend, backend, and shared components.

### Frontend
- **Framework**: React with Vite
- **Styling**: Tailwind CSS and shadcn/ui for component library
- **Routing**: wouter
- **State Management**: TanStack Query v5 for data fetching and caching
- **Design System**: Employs a "Trust Blue" theme (#1e40af) and the Inter font for a consistent user experience.
- **UI/UX**: Features a 3-column review interface for clinicians (Original | Simplified | Translated), collapsible sections, color-coded medical content, and editable textareas. The patient portal offers a multi-modal experience with UI translation in 7 languages, per-section text-to-speech, and print-friendly styles.

### Backend
- **Framework**: Express.js
- **Storage**: Currently uses in-memory storage (MemStorage) for MVP purposes, with Drizzle ORM for schema definition.
- **AI Integration**: Leverages OpenAI GPT-4o via Replit AI Integrations for core functionalities like content extraction, simplification, and translation.
- **Email Service**: Resend, integrated via Replit Connector, handles email delivery.
- **Authentication**: Supports multi-factor authentication for patients (lastName + yearOfBirth + PIN/Password) and clinicians/interpreters, with robust session security and bcrypt hashing for passwords. Roles: super_admin, admin, clinician, interpreter.
- **Multi-Tenancy**: Implements a multi-tenant architecture to isolate data between different clinics, managed by a super admin role. Two demo tenants exist for validation: "Riverside Community Health" (slug: riverside) and "Lakeside Family Medicine" (slug: lakeside), each with separate clinicians, admins, interpreters, and 5 patients. Sample docs dropdown is tenant-scoped. See TESTING_CREDENTIALS.md for full login details.
- **Interpreter Review Workflow**: Medical interpreters can review and edit AI-generated translations before they reach patients. Tenant-level compliance controls (disabled/optional/required). English-language care plans bypass interpreter review. Care plan status flow: draft → pending_review → [interpreter_review → interpreter_approved →] approved → sent → completed. Interpreters have language specialties and only see care plans in their assigned languages.
- **Security**: Includes server-side rate limiting, Zod validation on API endpoints, comprehensive audit logging, environment-based feature flags for secure production deployment, status allowlist on send endpoint (approved/interpreter_approved only), and shared secret guard on internal scheduler endpoint (INTERNAL_API_SECRET). Auth utilities in `server/auth.ts`.

### Shared
- **Schema & Validation**: Utilizes Drizzle ORM for database schema definition and Zod for API payload validation, ensuring data integrity across the application.

### Key Features
- **Clinician Dashboard**: Enables document upload (PDF/images), AI-driven content processing (extraction, simplification to 5th-grade reading level, translation to 49 languages with back-translation), scroll-to-approve workflow, and patient selector dropdown in the send dialog that pre-fills form fields from existing patients. Shows interpreter review status and notes when applicable.
- **Interpreter Dashboard**: Translation review queue filtered by interpreter's language specialties. 3-column review panel (Original | Simplified | Translated) with editable text areas. Approve/request changes workflow with audit trail. Shows back-translation verification and recently reviewed items.
- **Patient Portal**: Provides magic link access with multi-factor verification, display of care plans in the patient's preferred language, language toggling, and a traffic light check-in system for patient feedback (Green, Yellow, Red alerts).
- **Admin Dashboard**: Full patient roster management (CRUD with deduplication by email+tenantId), CSV bulk patient import, patient detail with care plan history, alert monitoring for patient check-ins, CSV export for TCM billing compliance, and audit trail viewing. Patients can only be deleted if they have no linked care plans. Features a Notion-style view toggle between Table and Kanban views with localStorage persistence. Kanban board groups patients into lifecycle columns: Registered, Care Plan Sent, Checked In, Needs Attention, and Completed.
- **Internationalization**: Extensive language support (49 languages for content, 7 for UI translation).
- **Multi-Modal Output**: Features PDF download capabilities (with considerations for non-Latin scripts) and text-to-speech functionality.

## External Dependencies

- **OpenAI GPT-4o**: Utilized for AI-driven text extraction, simplification, and translation. Integrated via Replit AI Integrations.
- **Resend**: An email API service used for sending care plan emails to patients. Integrated via Replit Connector.
- **pdfjs-dist (legacy build)**: Used for PDF processing, particularly for compatibility with Node.js environments and handling scanned/invalid PDFs.
- **jsPDF**: Client-side library for generating PDF documents from care plan content.
- **Web Speech API**: Browser-native API used for text-to-speech functionality in the patient portal.
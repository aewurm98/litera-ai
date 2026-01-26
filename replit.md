# Litera.ai - Healthcare Discharge Communication Platform

## Overview

Litera.ai is a healthcare companion platform that helps clinicians create simplified, translated discharge instructions for patients with Limited English Proficiency (LEP). The system uses AI to extract, simplify (to 5th grade reading level), and translate medical content, then delivers it via email with magic link access. Includes a traffic light check-in system for TCM billing compliance (CPT 99495/99496).

## Recent Changes

- **January 2026**: Complete MVP implementation
  - Clinician Dashboard with 3-column review interface and per-column scroll tracking
  - Patient Portal with magic link verification, traffic light check-in, and multi-modal outputs
  - Admin Dashboard with patient management, alerts, and CSV export
  - OpenAI GPT-4o integration for extraction/simplification/translation
  - Resend integration for email delivery
  - Server-side rate limiting for patient verification
  - Zod validation on all API endpoints
  - Comprehensive audit logging
  - PDF download (jsPDF) with language fallback for non-Latin scripts
  - Text-to-speech (Web Speech API) with voice selection
  - Print-friendly styles for care plans
  - Phase 2 placeholder pages (Analytics, Provider Directory, Video Library, Settings)

## Architecture

### Frontend (client/)
- **Framework**: React with Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **Routing**: wouter
- **State**: TanStack Query v5
- **Design**: Trust Blue theme (#1e40af), Inter font

### Backend (server/)
- **Framework**: Express.js
- **Storage**: In-memory (MemStorage) - suitable for MVP
- **AI**: OpenAI GPT-4o via Replit AI Integrations
- **Email**: Resend via Replit Connector

### Shared (shared/)
- **Schema**: Drizzle ORM types + Zod validation

## Key Features

### Clinician Dashboard (`/`)
- Upload discharge documents (PDF/images)
- AI extracts structured content (diagnosis, medications, appointments, warnings)
- Simplifies to 5th grade reading level
- Translates to 16+ languages with back-translation verification
- 3-column review interface: Original | Simplified | Translated
- Scroll-to-approve workflow for compliance

### Patient Portal (`/p/:token`)
- Magic link access with year-of-birth verification
- Server-side rate limiting (3 attempts, 15-minute lockout)
- Care plan display in patient's language
- Toggle between translated and English versions
- Traffic light check-in system:
  - Green: Feeling good
  - Yellow: Has concern (triggers alert)
  - Red: Needs urgent help (triggers alert, shows 911 option)

### Admin Dashboard (`/admin`)
- Patient list with status filtering
- Alerts for yellow/red check-in responses
- CSV export for TCM billing (CPT 99495/99496)
- Audit trail viewing

## API Endpoints

### Clinician Routes (require auth)
- `GET /api/care-plans` - List all care plans
- `POST /api/care-plans/upload` - Upload discharge document
- `POST /api/care-plans/:id/process` - Simplify + translate
- `POST /api/care-plans/:id/approve` - Approve care plan
- `POST /api/care-plans/:id/send` - Send to patient

### Patient Routes (public with token)
- `POST /api/patient/:token/verify` - Verify year of birth
- `GET /api/patient/:token` - Get care plan
- `POST /api/patient/:token/check-in` - Submit check-in response

### Admin Routes (require auth)
- `GET /api/admin/care-plans` - List all with audit logs
- `GET /api/admin/alerts` - Get yellow/red alerts
- `POST /api/admin/alerts/:id/resolve` - Resolve alert
- `POST /api/admin/export` - Export CSV

### Internal Routes
- `POST /api/internal/send-pending-check-ins` - Cron endpoint for scheduled emails

## Supported Languages

English, Spanish, Chinese (Simplified), Vietnamese, Tagalog, Korean, Russian, Arabic, French, Portuguese, Hindi, Urdu, Farsi, Polish, Haitian Creole, Japanese

## Environment Variables

- `AI_INTEGRATIONS_OPENAI_API_KEY` - Provided by Replit AI Integrations
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - Provided by Replit AI Integrations
- `REPLIT_CONNECTORS_HOSTNAME` - For Resend connector
- `SESSION_SECRET` - Session encryption key

## Development

```bash
npm run dev
```

Runs Express backend and Vite frontend on port 5000.

## Compliance Notes

- **Section 1557**: Audit logging for all PHI access
- **TCM Billing**: Check-in tracking for CPT 99495/99496
- **HIPAA**: Access token expiry, verification lockout, audit trails

## Multi-Modal Features

### PDF Download
- Uses jsPDF for client-side PDF generation
- Supports English and Latin-script languages natively
- For non-Latin scripts (Chinese, Japanese, Korean, Arabic, Hindi, Urdu, Farsi), displays a warning and recommends using browser Print > Save as PDF

### Text-to-Speech
- Uses Web Speech API with voice selection
- Supports all 16 languages via browser voices
- Graceful fallback if TTS not available (disabled button, helpful error message)

### Print
- CSS @media print styles for clean output
- Hides interactive elements and navigation
- Preserves warning card styling with red borders

## Demo Credentials

- **Clinician**: nurse/password123 (Maria Chen, RN)
- **Admin**: admin/password123 (Angela Torres)
- **Provider**: drsmith/password123 (Dr. James Smith)

## Future Improvements

- Custom font embedding for non-Latin PDF export
- SMS notifications via Twilio
- Scheduled cron job for check-in emails
- Video tutorials in patient portal

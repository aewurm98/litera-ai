# Project: Litera.ai — Healthcare Discharge Communication Platform

Build a complete healthcare web application called Litera.ai. This is a "System of Action" that helps clinicians create simplified, translated discharge instructions for patients with limited English proficiency (LEP), then delivers them via accessible digital channels.

---

## PART 1: PRODUCT CONTEXT

### The Problem We're Solving

**The "Discharge Cliff":** Patients forget 40-80% of discharge instructions within hours. For LEP patients, this compounds. Hospitals lose ~$15,200 per preventable readmission and miss $200-275 in TCM (Transitional Care Management) billing per patient.

### Core Value Proposition

1. **PDF Wedge Strategy:** Bypasses 12-18 month EHR integration cycles by accepting printed discharge summaries
2. **Clinical Babel Fish:** AI simplifies medical jargon to ≤5th grade reading level
3. **Section 1557 Compliance:** Human-verified machine translation for vital documents
4. **TCM Billing Capture:** Documents "interactive contact" within 48 hours for CPT 99495/99496

### What This App Must Do (Non-Negotiable)

1. Support clinician uploading/capturing discharge instructions
2. Deliver instructions to patient in accessible, persistent format
3. Capture confirmation/interaction within 48 hours
4. Provide basic admin/audit view for billing documentation

---

## PART 2: TECH STACK (Use Exactly This)

### Frontend

- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **React Router 6** for routing
- **TanStack Query** for server state
- **Zustand** for client state
- **Lucide React** for icons

### Backend

- **Flask 3.x** (Python)
- **SQLAlchemy 2.x** for ORM
- **Pydantic 2.x** for validation
- **PyMuPDF (fitz)** for PDF parsing
- **OpenAI API** for GPT-4o
- **Resend** for email delivery
- **APScheduler** for background scheduling

### Database

- **PostgreSQL** (Replit native)

### Environment Variables (Already Configured)

```
DATABASE_URL=postgresql://...  (auto-set by Replit)
SECRET_KEY=...
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Litera Health <care@domain.com>
FEATURE_TTS=false
FEATURE_SMS=false
FEATURE_RAG=false
FEATURE_CHAT=false
FEATURE_ANALYTICS=false
FEATURE_EHR=false
```

---

## PART 3: DESIGN SYSTEM

### Color Palette

**Primary Blues (Trust & Professionalism)**

- Trust Blue (Headers, Primary Actions): `#1e40af`
- Aero Blue (Backgrounds, Cards): `#e0f2fe`
- Interactive Blue (Buttons, Links): `#2563eb`

**Accent Colors**

- Teal/Mint (Success, Confirmations): `#10b981`
- Warning Yellow: `#f59e0b`
- Alert Red: `#ef4444`
- Lavender (Secondary, Transitions): `#c4b5fd`
- Pink/Magenta (CTAs, Highlights): `#ec4899`

**Neutrals**

- Background: `#f8fafc`
- Card Surface: `#ffffff`
- Text Primary: `#1e293b`
- Text Secondary: `#64748b`
- Border: `#e2e8f0`

### Typography

- **Font Family:** Inter (or system sans-serif fallback)
- **Base Size:** 16px (patient view: 18px)
- **Hierarchy:**
  - H1: 28px, bold, `#1e293b`
  - H2: 22px, semibold, `#1e293b`
  - H3: 18px, medium, `#334155`
  - Body: 16px, regular, `#475569`
  - Small: 14px, regular, `#64748b`

### Interface Philosophy: "Empathetic Healthcare Companion"

**NOT:** Rigid medical record system
**IS:** Warm, supportive care guide

Design Principles:

1. **Soft-edged instruction cards** — rounded corners (8-12px), subtle shadows
2. **Conversational messaging UI** — rounded chat bubbles for notifications
3. **Information chunking** — one concept per card, modular layout
4. **High contrast** — WCAG AA minimum for all text
5. **Large touch targets** — minimum 44x44px for mobile

### Iconography

Use **Lucide React** icons with:

- Stroke width: 1.5-2px
- Size: 20-24px for inline, 32-40px for feature icons
- Style: Minimal thin-line aesthetic

Key icons to use:

- `FileText` — documents
- `Upload` — file upload
- `Check` — success/approval
- `AlertTriangle` — warnings
- `Clock` — scheduling
- `Send` — delivery
- `User` — patient
- `Stethoscope` — clinician
- `Languages` — translation
- `Volume2` — text-to-speech
- `MessageSquare` — chat/messaging

---

## PART 4: COMPLETE WORKFLOWS

### Workflow 1: Clinician Flow (T-0: Discharge Time)

**Step-by-step implementation:**

```
1. GENERATE DISCHARGE SUMMARY
   - Clinician creates summary in EHR (external to our system)
   - Clinician prints to PDF OR takes photo of paper summary

2. UPLOAD TO LITERA
   - Clinician logs into Litera dashboard
   - Drag-and-drop upload zone accepts: .pdf, .jpg, .png (max 10MB)
   - Display upload progress with spinner
   - Show "Processing..." state during AI extraction

3. AI PROCESSING PIPELINE
   a. EXTRACT: Parse PDF text (PyMuPDF) or use GPT-4o Vision for images
   b. STRUCTURE: Convert to JSON (diagnosis, medications, appointments, warnings)
   c. SIMPLIFY: Rewrite to 5th grade level (validate with textstat)
   d. TRANSLATE: Convert to patient's preferred language
   e. BACK-TRANSLATE: Generate English version of translation for verification

4. REVIEW SIDE-BY-SIDE
   - Display 3-column editor:
     Column 1: Original text (read-only, gray background)
     Column 2: Simplified English (editable, white background)
     Column 3: Translated text (editable, white background)
   - Hover on Column 3 shows back-translation tooltip
   - Section headers: Diagnosis, Medications, Appointments, Instructions, Warnings

5. COMPLIANCE GATE
   - "Verify & Approve" button (disabled until clinician scrolls through all content)
   - On click: Log reviewer_id + timestamp to audit_log
   - Status changes: pending_review → approved

6. PATIENT SETUP
   - Modal: Enter patient phone number (optional) and email (required)
   - Select preferred language from dropdown
   - Enter patient's year of birth (for verification)

7. SEND TO PATIENT
   - Click "Send Care Plan"
   - System generates magic link token (64 chars)
   - Email sent via Resend with magic link
   - Status changes: approved → sent
   - Schedule first check-in for T+24 hours
```

**Risk: Automation Bias** — Clinicians may trust AI output without careful review
**Mitigation:** Require scroll-through before approval button enables

**Essential Logging:**

- `care_plan.approved_by` — user ID who verified
- `care_plan.approved_at` — timestamp
- `audit_log` entry with action='approved'

---

### Workflow 2: Patient Flow (T+0 to T+48)

**Step-by-step implementation:**

```
T+0: RECEIVE NOTIFICATION
   - Patient receives email: "Hi [Name], your care instructions are ready"
   - Email contains large CTA button with magic link
   - Link format: https://app-url.repl.co/p/{64-char-token}

T+0: ACCESS CARE PLAN
   1. Patient taps link → lands on verification page
   2. Patient enters Year of Birth (4 digits)
   3. If correct: Show care plan view
   4. If incorrect: "Please try again" (max 3 attempts, then 15-min lockout)

T+0: VIEW INSTRUCTIONS
   - Mobile-first responsive layout
   - Language toggle in header (English ↔ Translated)
   - Sections displayed as cards:
     • Diagnosis card (top)
     • Medication cards (expandable list)
     • Appointment cards (with map link if location provided)
     • Warning signs card (highlighted in yellow/red)
   - "Read Aloud" button on each card (Phase 2 - show disabled with "Coming Soon")

T+24: RECEIVE CHECK-IN
   - Email: "How are you feeling today?"
   - Contains link back to care plan with check-in prompt

T+24: RESPOND TO CHECK-IN (Traffic Light)
   - Three large buttons displayed:
     🟢 GREEN: "I feel good / I'm doing okay"
     🟡 YELLOW: "I have a concern / Something doesn't feel right"
     🔴 RED: "I need help now / This is urgent"

   - GREEN response:
     • Log response to check_ins table
     • Show: "Great! Keep following your care plan."
     • Status: completed

   - YELLOW response:
     • Log response + create alert for clinician
     • Show: "We've notified your care team. They will call you within 24 hours."
     • Show clinic phone number prominently

   - RED response:
     • Log response + create URGENT alert
     • Show: "If this is an emergency, call 911 immediately."
     • Show large "Call 911" button
     • Show: "Your care team has been notified."

T+28 (if no response at T+24):
   - Send retry email: "We haven't heard from you..."
   - attempt_number = 2

T+32 (if still no response):
   - Final attempt email
   - attempt_number = 3
   - If no response after T+48: Flag for manual follow-up
```

**Risk: Spam Filter** — Patients may not see emails from unknown sender
**Mitigation:**

- Use verified sending domain
- Keep subject lines personal: "Your care instructions from [Hospital]"
- Include hospital name in sender

**Essential Logging:**

- `check_ins.sent_at` — when check-in was sent
- `check_ins.responded_at` — when patient replied
- `check_ins.response` — green/yellow/red
- This data proves "interactive contact" for TCM billing

---

### Workflow 3: Admin Flow (Day 30 - Billing Cycle)

**Step-by-step implementation:**

```
1. ACCESS TCM REPORT
   - Admin logs in → navigates to Admin Dashboard
   - Sees patient list with status columns:
     • Patient Name
     • Discharge Date
     • Plan Status (draft/approved/sent/completed)
     • Check-in Status (pending/responded/alert/no-response)
     • Response Type (green/yellow/red/none)

2. FILTER FOR BILLING
   - Filter controls:
     • Date range picker (discharge date)
     • Status: "Completed Interactive Contact"
     • Exclude: "No Response" and "Readmitted"

3. REVIEW ALERTS
   - Separate panel showing Yellow/Red responses
   - Each alert shows:
     • Patient name
     • Response time
     • Response notes (if any)
     • "Mark Resolved" button

4. EXPORT FOR BILLING
   - "Export CSV" button
   - CSV columns:
     • patient_name
     • mrn (if available)
     • discharge_date
     • discharge_diagnosis
     • approved_by (clinician name)
     • approved_at
     • sent_at
     • first_contact_at (check-in send time)
     • response_at
     • response_type
     • audit_log_id (for reference)
     • suggested_cpt_code (99495 or 99496)

5. AUDIT DETAIL VIEW
   - Click any patient → see full audit trail
   - Timeline view showing all status changes with timestamps
```

**Risk: Data Disconnect** — Exported data may not match EHR records
**Mitigation:** Include audit_log_id for traceability; store original discharge date from clinician input

---

## PART 5: UI COMPONENTS SPECIFICATION

### Component 1: Traffic Light Symptom Tracker

**Purpose:** Bridges literacy gap; provides clear, actionable feedback mechanism; satisfies TCM "interactive contact" requirement

**Implementation:**

```tsx
// components/patient/TrafficLight.tsx

interface TrafficLightProps {
  onResponse: (response: 'green' | 'yellow' | 'red') => void;
  isSubmitting: boolean;
}

export function TrafficLight({ onResponse, isSubmitting }: TrafficLightProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-center text-gray-800">
        How are you feeling today?
      </h2>

      <div className="space-y-3">
        {/* GREEN */}
        <button
          onClick={() => onResponse('green')}
          disabled={isSubmitting}
          className="w-full p-6 rounded-xl bg-emerald-50 border-2 border-emerald-200 
                     hover:bg-emerald-100 hover:border-emerald-400 transition-all
                     flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
            <span className="text-2xl">😊</span>
          </div>
          <div className="text-left">
            <div className="font-semibold text-emerald-800">I feel good</div>
            <div className="text-sm text-emerald-600">
              Things are going okay
            </div>
          </div>
        </button>

        {/* YELLOW */}
        <button
          onClick={() => onResponse('yellow')}
          disabled={isSubmitting}
          className="w-full p-6 rounded-xl bg-amber-50 border-2 border-amber-200 
                     hover:bg-amber-100 hover:border-amber-400 transition-all
                     flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center">
            <span className="text-2xl">😐</span>
          </div>
          <div className="text-left">
            <div className="font-semibold text-amber-800">I have a concern</div>
            <div className="text-sm text-amber-600">
              Something doesn't feel right
            </div>
          </div>
        </button>

        {/* RED */}
        <button
          onClick={() => onResponse('red')}
          disabled={isSubmitting}
          className="w-full p-6 rounded-xl bg-red-50 border-2 border-red-200 
                     hover:bg-red-100 hover:border-red-400 transition-all
                     flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-2xl">🚨</span>
          </div>
          <div className="text-left">
            <div className="font-semibold text-red-800">I need help now</div>
            <div className="text-sm text-red-600">This is urgent</div>
          </div>
        </button>
      </div>
    </div>
  );
}
```

---

### Component 2: Three-Column Review Editor

**Purpose:** Section 1557 compliance; enables human verification of AI output

**Implementation:**

```tsx
// components/clinician/ReviewEditor.tsx

interface Section {
  id: string;
  section: string;
  original_text: string;
  simplified_text: string;
  translated_text: string;
  back_translation: string;
}

interface ReviewEditorProps {
  sections: Section[];
  language: string;
  onUpdate: (sectionId: string, field: string, value: string) => void;
  onApprove: () => void;
  isApproving: boolean;
}

export function ReviewEditor({
  sections,
  language,
  onUpdate,
  onApprove,
  isApproving,
}: ReviewEditorProps) {
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-100 border-b font-semibold text-sm">
        <div className="text-gray-600">Original</div>
        <div className="text-blue-700">Simplified English</div>
        <div className="text-green-700">Translated ({language})</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {sections.map((section) => (
          <div key={section.id} className="grid grid-cols-3 gap-4 p-4 border-b">
            {/* Original - Read Only */}
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase">
                {section.section}
              </div>
              <div className="text-gray-700 text-sm whitespace-pre-wrap">
                {section.original_text}
              </div>
            </div>

            {/* Simplified - Editable */}
            <div className="bg-white border border-blue-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-blue-600 mb-2 uppercase">
                {section.section}
              </div>
              <textarea
                value={section.simplified_text}
                onChange={(e) =>
                  onUpdate(section.id, 'simplified_text', e.target.value)
                }
                className="w-full text-sm text-gray-800 resize-none border-0 focus:ring-0 p-0"
                rows={5}
              />
            </div>

            {/* Translated - Editable with Back-Translation Tooltip */}
            <div
              className="bg-white border border-green-200 rounded-lg p-3 relative"
              onMouseEnter={() => setHoveredSection(section.id)}
              onMouseLeave={() => setHoveredSection(null)}
            >
              <div className="text-xs font-semibold text-green-600 mb-2 uppercase">
                {section.section}
              </div>
              <textarea
                value={section.translated_text}
                onChange={(e) =>
                  onUpdate(section.id, 'translated_text', e.target.value)
                }
                className="w-full text-sm text-gray-800 resize-none border-0 focus:ring-0 p-0"
                rows={5}
              />

              {/* Back-translation tooltip */}
              {hoveredSection === section.id && section.back_translation && (
                <div className="absolute bottom-full left-0 right-0 mb-2 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                  <div className="font-semibold mb-1">Back-translation:</div>
                  <div>{section.back_translation}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Approval Footer */}
      <div className="p-4 bg-white border-t flex justify-between items-center">
        <div className="text-sm text-gray-500">
          Review all sections before approving
        </div>
        <button
          onClick={onApprove}
          disabled={isApproving}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg 
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-2"
        >
          {isApproving ? (
            <>
              <span className="animate-spin">⏳</span>
              Approving...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Verify & Approve
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

---

### Component 3: Magic Link Landing Page

**Purpose:** Zero-friction patient access without app download or account creation

**Implementation:**

```tsx
// components/patient/Landing.tsx

interface LandingProps {
  token: string;
  patientFirstName?: string;
  onVerify: (dobYear: string) => Promise<boolean>;
}

export function Landing({ token, patientFirstName, onVerify }: LandingProps) {
  const [dobYear, setDobYear] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLocked) return;

    setIsVerifying(true);
    setError('');

    const success = await onVerify(dobYear);

    if (!success) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= 3) {
        setIsLocked(true);
        setError('Too many attempts. Please try again in 15 minutes.');
        setTimeout(
          () => {
            setIsLocked(false);
            setAttempts(0);
          },
          15 * 60 * 1000,
        );
      } else {
        setError(
          `Incorrect year of birth. ${3 - newAttempts} attempts remaining.`,
        );
      }
    }

    setIsVerifying(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Litera Health</h1>
          <p className="text-gray-600 mt-2">Your Care Instructions</p>
        </div>

        {/* Verification Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            {patientFirstName ? `Hello, ${patientFirstName}!` : 'Welcome!'}
          </h2>
          <p className="text-gray-600 mb-6">
            To protect your privacy, please enter your year of birth.
          </p>

          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Year of Birth
            </label>
            <input
              type="number"
              value={dobYear}
              onChange={(e) => setDobYear(e.target.value)}
              placeholder="1990"
              min="1900"
              max="2024"
              disabled={isLocked}
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg 
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:bg-gray-100 disabled:cursor-not-allowed"
            />

            {error && (
              <div className="mt-3 text-red-600 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLocked || isVerifying || dobYear.length !== 4}
              className="w-full mt-4 py-3 bg-blue-600 text-white font-semibold rounded-lg
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
            >
              {isVerifying ? 'Verifying...' : 'View My Care Plan'}
            </button>
          </form>
        </div>

        {/* Help Text */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Having trouble? Call your care team at
          <br />
          <a href="tel:+15551234567" className="text-blue-600 font-medium">
            (555) 123-4567
          </a>
        </p>
      </div>
    </div>
  );
}
```

---

### Component 4: Medication Card

**Purpose:** Clear, scannable medication display with timing icons

**Implementation:**

```tsx
// components/patient/MedicationCard.tsx

interface Medication {
  name: string;
  dose: string;
  frequency: string;
  instructions?: string;
}

interface MedicationCardProps {
  medication: Medication;
  translated?: boolean;
}

export function MedicationCard({
  medication,
  translated,
}: MedicationCardProps) {
  // Map frequency to icons
  const getFrequencyIcons = (freq: string) => {
    const lower = freq.toLowerCase();
    if (
      lower.includes('twice') ||
      lower.includes('two times') ||
      lower.includes('bid')
    ) {
      return ['🌅', '🌙']; // Morning, Evening
    }
    if (lower.includes('three') || lower.includes('tid')) {
      return ['🌅', '☀️', '🌙']; // Morning, Afternoon, Evening
    }
    if (lower.includes('four') || lower.includes('qid')) {
      return ['🌅', '☀️', '🌆', '🌙'];
    }
    if (
      lower.includes('once') ||
      lower.includes('daily') ||
      lower.includes('qd')
    ) {
      return ['☀️'];
    }
    if (lower.includes('bedtime') || lower.includes('night')) {
      return ['🌙'];
    }
    return ['💊'];
  };

  const icons = getFrequencyIcons(medication.frequency);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-lg">
            {medication.name}
          </h3>
          <p className="text-blue-600 font-medium mt-1">{medication.dose}</p>
        </div>

        {/* Timing Icons */}
        <div className="flex gap-1">
          {icons.map((icon, i) => (
            <span key={i} className="text-2xl" title={medication.frequency}>
              {icon}
            </span>
          ))}
        </div>
      </div>

      <p className="text-gray-600 mt-2">{medication.frequency}</p>

      {medication.instructions && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-sm text-gray-500">💡 {medication.instructions}</p>
        </div>
      )}
    </div>
  );
}
```

---

### Component 5: Interface Shell (For Phase 2+ Features)

**Purpose:** Show where future features will live without functional backend

```tsx
// components/shared/InterfaceShell.tsx

interface InterfaceShellProps {
  title: string;
  description: string;
  phase: number;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function InterfaceShell({ title, description, phase, icon, children }: InterfaceShellProps) {
  return (
    <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50">
      {/* Phase Badge */}
      <span className="absolute -top-3 right-4 bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1 rounded-full">
        Coming Phase {phase}
      </span>

      {/* Content */}
      <div className="opacity-60">
        <div className="flex items-center gap-3 mb-3">
          {icon && <div className="text-gray-400">{icon}</div>}
          <h3 className="font-semibold text-gray-700">{title}</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">{description}</p>

        {/* Placeholder UI */}
        <div className="pointer-events-none">
          {children}
        </div>
      </div>

      {/* CTA */}
      <button className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium">
        Request Early Access →
      </button>
    </div>
  );
}

// Usage Examples:

// In Settings page:
<InterfaceShell
  title="EHR Integration"
  description="Connect directly to Epic, Cerner, or Meditech to pull discharge summaries automatically."
  phase={4}
  icon={<Database className="w-6 h-6" />}
>
  <select disabled className="w-full p-2 border rounded bg-white">
    <option>Select EHR System...</option>
    <option>Epic</option>
    <option>Cerner</option>
    <option>Meditech</option>
  </select>
</InterfaceShell>

// In Patient View:
<InterfaceShell
  title="Read Aloud"
  description="Tap to hear your instructions read in your language."
  phase={2}
  icon={<Volume2 className="w-6 h-6" />}
>
  <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-200 rounded-lg">
    <Volume2 className="w-5 h-5" />
    Read Aloud
  </button>
</InterfaceShell>

// In Patient View footer:
<InterfaceShell
  title="Ask Questions"
  description="Chat with Litera to get answers about your care plan."
  phase={3}
  icon={<MessageSquare className="w-6 h-6" />}
>
  <div className="bg-white rounded-lg p-3 border">
    <input
      disabled
      placeholder="Type your question..."
      className="w-full p-2 border rounded"
    />
  </div>
</InterfaceShell>
```

---

### Component 6: Upload Dropzone

```tsx
// components/clinician/UploadForm.tsx

export function UploadForm({ onUpload }: { onUpload: (file: File) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && isValidFile(droppedFile)) {
      setFile(droppedFile);
    }
  };

  const isValidFile = (f: File) => {
    const validTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/heic',
    ];
    const maxSize = 10 * 1024 * 1024; // 10MB
    return validTypes.includes(f.type) && f.size <= maxSize;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center transition-all
          ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
          }
        `}
      >
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />

        <h3 className="text-lg font-semibold text-gray-700 mb-2">
          Upload Discharge Summary
        </h3>

        <p className="text-gray-500 mb-4">
          Drag and drop a PDF or image, or click to browse
        </p>

        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
          className="hidden"
          id="file-upload"
        />

        <label
          htmlFor="file-upload"
          className="inline-block px-6 py-3 bg-white border border-gray-300 rounded-lg
                     text-gray-700 font-medium cursor-pointer hover:bg-gray-50"
        >
          Choose File
        </label>

        <p className="text-xs text-gray-400 mt-4">
          Supported: PDF, JPG, PNG, HEIC (max 10MB)
        </p>
      </div>

      {file && (
        <div className="mt-4 p-4 bg-white rounded-lg border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-600" />
            <div>
              <div className="font-medium text-gray-900">{file.name}</div>
              <div className="text-sm text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          </div>

          <button
            onClick={() => onUpload(file)}
            disabled={isUploading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium
                       hover:bg-blue-700 disabled:opacity-50"
          >
            {isUploading ? 'Processing...' : 'Process Document'}
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## PART 6: UX PATTERNS FOR LOW LITERACY PATIENTS

### Design Rules for Patient View

1. **One Concept Per Screen**
   - Each medication gets its own card
   - Don't combine multiple instructions
   - Use card-based navigation

2. **Pictographic Navigation**
   - Use universal icons alongside text
   - 💊 for medications
   - 📅 for appointments
   - ⚠️ for warnings
   - ✅ for tasks completed

3. **Large Touch Targets**
   - All buttons: minimum 44x44px (48px preferred)
   - Card tap areas: full width
   - Spacing between targets: minimum 8px

4. **High Contrast Text**
   - Body text: minimum 18px
   - Headers: minimum 22px
   - Color contrast: WCAG AA (4.5:1 ratio)

5. **Persistent Language Toggle**
   - Always visible in header
   - Shows both options: "English | Español"
   - Instant switching, no page reload

6. **"Read to Me" Button (Phase 2)**
   - On every content card
   - Large speaker icon
   - One tap to play

7. **Progress Indicators**
   - Show which section patient is viewing
   - "3 of 5 sections"
   - Checkmarks for completed items

---

## PART 7: FEATURE PRIORITIZATION

### 1.0 MVP — Must Have (Build This)

| Feature          | Description                             |
| ---------------- | --------------------------------------- |
| PDF Upload       | Drag-and-drop with 10MB limit           |
| Image Upload     | Support JPG, PNG, HEIC for paper photos |
| AI Extraction    | GPT-4o parses to structured JSON        |
| Simplification   | Reduce to ≤5th grade reading level      |
| Translation      | Any language GPT-4o supports            |
| Back-translation | For clinician verification              |
| 3-Column Editor  | Original / Simplified / Translated      |
| HITL Approval    | Clinician must verify before send       |
| Magic Link       | Tokenized URL, no password needed       |
| DOB Verification | Light 2FA for patient access            |
| Traffic Light    | Green/Yellow/Red response system        |
| Email Delivery   | Via Resend API                          |
| Admin Dashboard  | Patient list with status                |
| CSV Export       | For TCM billing documentation           |
| Audit Logging    | All actions with timestamps             |

### 1.5 Demo-Wow — Show These as Interface-Only

| Feature               | Phase | Show As                                    |
| --------------------- | ----- | ------------------------------------------ |
| Photo-to-Code         | 2     | Works via Vision API (actually functional) |
| One-Tap Audio (TTS)   | 2     | Disabled button with "Coming Soon"         |
| SMS Delivery          | 2     | Toggle in settings with "Coming Soon"      |
| WhatsApp Delivery     | 3     | Toggle in settings with "Coming Soon"      |
| Chatbot Q&A           | 3     | Chat input with "Coming Soon"              |
| Analytics Dashboard   | 3     | Chart placeholders with sample data        |
| Revenue Ticker        | 3     | Shows "+$200 per patient" concept          |
| EHR Integration       | 4     | Dropdown selector with "Coming Soon"       |
| Multi-language Toggle | 1     | Fully functional for translation           |

### Anti-Scope — Explicitly NOT Building

- ❌ HL7/FHIR integration (use PDF wedge)
- ❌ Native iOS/Android apps (use PWA/web)
- ❌ User accounts with passwords for patients (use magic links)
- ❌ Video chat / telehealth (redundant)
- ❌ Pharmacy integration (too complex)
- ❌ Clinical chatbot (liability risk)
- ❌ Complex analytics (simple lists sufficient)
- ❌ Ambient audio recording (too complex for Replit)
- ❌ Wearable integration (too high friction)

---

## PART 8: DATABASE SCHEMA

```sql
-- Users (clinicians and admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'clinician',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    dob_year INTEGER NOT NULL,
    preferred_language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Care Plans
CREATE TABLE care_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    created_by UUID REFERENCES users(id) NOT NULL,

    -- Status workflow: draft → processing → pending_review → approved → sent → completed
    status VARCHAR(50) DEFAULT 'draft',

    discharge_date TIMESTAMPTZ,

    -- HITL compliance
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,

    -- Magic link
    access_token VARCHAR(64) UNIQUE,
    token_expires_at TIMESTAMPTZ,

    -- Source tracking
    source_type VARCHAR(20), -- pdf, image, manual

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Care Plan Content (sections)
CREATE TABLE care_plan_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_plan_id UUID REFERENCES care_plans(id) ON DELETE CASCADE,

    section VARCHAR(50) NOT NULL, -- diagnosis, medications, appointments, instructions, warnings

    original_text TEXT,
    simplified_text TEXT,
    translated_text TEXT,
    back_translation TEXT,

    -- Structured data for medications/appointments
    structured_data JSONB,

    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Check-ins (for TCM tracking)
CREATE TABLE check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_plan_id UUID REFERENCES care_plans(id) ON DELETE CASCADE,

    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    delivery_method VARCHAR(20) DEFAULT 'email',

    response VARCHAR(20), -- green, yellow, red
    responded_at TIMESTAMPTZ,

    attempt_number INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log (immutable)
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id UUID,
    actor_type VARCHAR(20) DEFAULT 'user', -- user, system, patient
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_care_plans_patient ON care_plans(patient_id);
CREATE INDEX idx_care_plans_status ON care_plans(status);
CREATE INDEX idx_care_plans_token ON care_plans(access_token);
CREATE INDEX idx_check_ins_care_plan ON check_ins(care_plan_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
```

---

## PART 9: API ENDPOINTS

```
Authentication:
POST   /api/auth/login          - Email/password login
POST   /api/auth/logout         - Clear session
GET    /api/auth/me             - Current user info

Care Plans:
GET    /api/care-plans          - List all (with filters)
POST   /api/care-plans          - Create new
GET    /api/care-plans/:id      - Get one
PATCH  /api/care-plans/:id      - Update content
POST   /api/care-plans/:id/process   - Run AI pipeline
POST   /api/care-plans/:id/approve   - HITL approval
POST   /api/care-plans/:id/send      - Send to patient

Ingestion:
POST   /api/ingest/upload       - Upload PDF or image

Patient (Public - no auth):
GET    /p/:token                - Patient landing
POST   /p/:token/verify         - DOB verification
GET    /p/:token/view           - Care plan data
POST   /p/:token/checkin        - Submit response

Admin:
GET    /api/admin/patients      - All patients with status
GET    /api/admin/alerts        - Yellow/Red responses
GET    /api/admin/export        - Generate CSV

System:
GET    /api/features            - Feature flags for frontend
GET    /api/health              - Health check
```

---

## PART 10: AI PROMPTS TO USE

### Extraction Prompt

```
You are a medical document parser. Extract discharge instructions into this exact JSON structure:

{
  "diagnosis": "Primary diagnosis as stated",
  "medications": [
    {
      "name": "Drug Name (Generic if available)",
      "dose": "Amount and unit",
      "frequency": "How often to take",
      "instructions": "Special instructions like 'take with food'"
    }
  ],
  "appointments": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM AM/PM",
      "provider": "Doctor or clinic name",
      "location": "Address",
      "purpose": "Reason for visit"
    }
  ],
  "warnings": [
    "Specific warning signs to watch for"
  ],
  "instructions": "Other care instructions as free text"
}

RULES:
- Extract ONLY what is explicitly stated in the document
- Preserve drug names exactly as written
- Use ISO date format for dates
- If a field is not present, use null or empty array
- Do not invent or infer information

Return valid JSON only, no markdown formatting.
```

### Simplification Prompt

```
You are a health literacy expert. Simplify this medical text to a 5th grade reading level.

RULES:
1. Use short sentences (maximum 15 words each)
2. Replace medical jargon with simple words:
   - "administer" → "take" or "give"
   - "orally" → "by mouth"
   - "BID" or "twice daily" → "2 times a day (morning and evening)"
   - "TID" → "3 times a day"
   - "PRN" or "as needed" → "when you need it"
   - "ambulate" → "walk"
   - "discontinue" → "stop taking"
   - "monitor" → "watch for" or "check"
3. Keep drug names EXACTLY as written - do not change medication names
4. Use active voice ("Take your medicine" not "Medicine should be taken")
5. Include specific times when helpful ("morning and evening" not just "twice daily")
6. Number multi-step instructions (1, 2, 3...)
7. Start instructions with action verbs (Take, Call, Go, Watch)

TEXT TO SIMPLIFY:
{text}

Return ONLY the simplified text. No explanations.
```

### Translation Prompt

```
Translate this patient care instruction to {language}.

RULES:
1. Keep ALL drug names in English exactly as written
2. You may add the translated drug name in parentheses after
3. Use simple, conversational language appropriate for patients
4. Preserve all numbers, dates, and times exactly
5. Maintain the same structure (lists, numbered items, etc.)
6. Use formal but warm tone appropriate for healthcare

TEXT TO TRANSLATE:
{text}

Return ONLY the translated text.
```

### Back-Translation Prompt

```
Translate this {language} text back to English literally.
This is for verification purposes - translate exactly what is written without interpretation.

TEXT:
{translated_text}

Return ONLY the English translation.
```

---

## PART 11: SEED DATA

Create this seed script to populate test data:

```python
# seed.py
from app import db
from app.models import User, Patient, CarePlan, CarePlanContent, CheckIn
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta
import secrets

def seed_database():
    # Clear existing data
    db.drop_all()
    db.create_all()

    # Create users
    admin = User(
        email='admin@litera.ai',
        password_hash=generate_password_hash('admin123'),
        name='Admin User',
        role='admin'
    )

    nurse = User(
        email='nurse@hospital.com',
        password_hash=generate_password_hash('nurse123'),
        name='Maria Chen, RN',
        role='clinician'
    )

    db.session.add_all([admin, nurse])
    db.session.commit()

    # Create patients
    patients = [
        Patient(
            first_name='Rosa',
            email='rosa.test@example.com',
            phone='+15551234567',
            dob_year=1958,
            preferred_language='es'
        ),
        Patient(
            first_name='James',
            email='james.test@example.com',
            phone='+15552345678',
            dob_year=1975,
            preferred_language='en'
        ),
        Patient(
            first_name='Wei',
            email='wei.test@example.com',
            phone='+15553456789',
            dob_year=1962,
            preferred_language='zh'
        ),
    ]

    db.session.add_all(patients)
    db.session.commit()

    # Create sample care plans
    # Plan 1: Completed flow
    plan1 = CarePlan(
        patient_id=patients[0].id,
        created_by=nurse.id,
        status='completed',
        discharge_date=datetime.utcnow() - timedelta(days=5),
        approved_by=nurse.id,
        approved_at=datetime.utcnow() - timedelta(days=5),
        access_token=secrets.token_urlsafe(48),
        token_expires_at=datetime.utcnow() + timedelta(days=25),
        source_type='pdf'
    )

    # Plan 2: Pending review
    plan2 = CarePlan(
        patient_id=patients[1].id,
        created_by=nurse.id,
        status='pending_review',
        discharge_date=datetime.utcnow(),
        access_token=secrets.token_urlsafe(48),
        token_expires_at=datetime.utcnow() + timedelta(days=30),
        source_type='pdf'
    )

    db.session.add_all([plan1, plan2])
    db.session.commit()

    # Add content for plan 1
    content1 = [
        CarePlanContent(
            care_plan_id=plan1.id,
            section='diagnosis',
            original_text='Community-acquired pneumonia with hypoxemia requiring supplemental oxygen.',
            simplified_text='You had pneumonia. This is an infection in your lungs. You needed extra oxygen to help you breathe.',
            translated_text='Usted tuvo neumonía. Esta es una infección en sus pulmones. Necesitó oxígeno adicional para ayudarle a respirar.',
            back_translation='You had pneumonia. This is an infection in your lungs. You needed additional oxygen to help you breathe.',
            display_order=1
        ),
        CarePlanContent(
            care_plan_id=plan1.id,
            section='medications',
            original_text='Amoxicillin-Clavulanate 875mg PO BID x 7 days. Benzonatate 100mg PO TID PRN cough.',
            simplified_text='1. Amoxicillin-Clavulanate 875mg: Take 1 pill by mouth 2 times a day (morning and evening) for 7 days. Take with food.\n\n2. Benzonatate 100mg: Take 1 pill by mouth 3 times a day when you have a cough.',
            translated_text='1. Amoxicillin-Clavulanate 875mg: Tome 1 pastilla por la boca 2 veces al día (mañana y noche) por 7 días. Tome con comida.\n\n2. Benzonatate 100mg: Tome 1 pastilla por la boca 3 veces al día cuando tenga tos.',
            back_translation='1. Amoxicillin-Clavulanate 875mg: Take 1 pill by mouth 2 times a day (morning and evening) for 7 days. Take with food.\n\n2. Benzonatate 100mg: Take 1 pill by mouth 3 times a day when you have a cough.',
            structured_data={
                "medications": [
                    {"name": "Amoxicillin-Clavulanate", "dose": "875mg", "frequency": "twice daily", "instructions": "Take with food"},
                    {"name": "Benzonatate", "dose": "100mg", "frequency": "three times daily", "instructions": "As needed for cough"}
                ]
            },
            display_order=2
        ),
        CarePlanContent(
            care_plan_id=plan1.id,
            section='warnings',
            original_text='Return to ED for: fever >101.5F unresponsive to acetaminophen, worsening dyspnea, hemoptysis, chest pain.',
            simplified_text='Go to the Emergency Room right away if you have:\n• Fever above 101.5°F that does not go down with Tylenol\n• Harder time breathing\n• Coughing up blood\n• Chest pain',
            translated_text='Vaya a la sala de emergencias de inmediato si tiene:\n• Fiebre de más de 101.5°F que no baja con Tylenol\n• Más dificultad para respirar\n• Tos con sangre\n• Dolor en el pecho',
            back_translation='Go to the emergency room immediately if you have:\n• Fever above 101.5°F that does not go down with Tylenol\n• More difficulty breathing\n• Cough with blood\n• Chest pain',
            display_order=3
        ),
    ]

    db.session.add_all(content1)

    # Add check-in for plan 1 (completed)
    checkin1 = CheckIn(
        care_plan_id=plan1.id,
        scheduled_for=datetime.utcnow() - timedelta(days=4),
        sent_at=datetime.utcnow() - timedelta(days=4),
        delivery_method='email',
        response='green',
        responded_at=datetime.utcnow() - timedelta(days=4, hours=-2),
        attempt_number=1
    )

    db.session.add(checkin1)
    db.session.commit()

    print("✅ Database seeded successfully!")
    print(f"   Admin: admin@litera.ai / admin123")
    print(f"   Nurse: nurse@hospital.com / nurse123")
    print(f"   Patients: Rosa (es), James (en), Wei (zh)")

if __name__ == '__main__':
    seed_database()
```

---

## PART 12: DEFINITION OF DONE

The MVP is complete when ALL of these work:

### Clinician Flow

- [ ] Can log in with email/password
- [ ] Sees dashboard with patient list
- [ ] Can upload PDF and see extracted content in <30 seconds
- [ ] Can upload image and see extracted content (Vision API)
- [ ] Sees 3-column editor with original/simplified/translated
- [ ] Can edit simplified text
- [ ] Can edit translated text
- [ ] Hover on translated shows back-translation tooltip
- [ ] Can click "Verify & Approve"
- [ ] Approval logs to audit_log with timestamp
- [ ] Can enter patient email and preferred language
- [ ] Can click "Send" and patient receives email

### Patient Flow

- [ ] Receives email with magic link
- [ ] Clicks link, sees DOB verification page
- [ ] Enters correct DOB, sees care plan
- [ ] Enters wrong DOB 3x, gets locked out
- [ ] Can toggle between English and translated language
- [ ] Sees medication cards with timing icons
- [ ] Sees appointment card
- [ ] Sees warning signs highlighted
- [ ] Sees traffic light check-in prompt
- [ ] Can submit Green/Yellow/Red response
- [ ] Response saves to database

### Admin Flow

- [ ] Can log in as admin
- [ ] Sees all patients with status columns
- [ ] Sees alerts panel for Yellow/Red responses
- [ ] Can click "Export CSV" and download file
- [ ] CSV contains all TCM-required fields

### Interface Shells (Visible but Non-Functional)

- [ ] "Read Aloud" button shows "Coming Phase 2"
- [ ] SMS toggle shows "Coming Phase 2"
- [ ] Chat widget shows "Coming Phase 3"
- [ ] Analytics charts show "Coming Phase 3"
- [ ] EHR integration shows "Coming Phase 4"

### Technical

- [ ] All API endpoints return proper error messages
- [ ] Audit log captures: create, approve, send, view, checkin
- [ ] Database migrations run without errors
- [ ] App runs without errors on Replit

---

## BEGIN BUILDING

Start by:

1. Setting up the project structure (client/ and server/ folders)
2. Installing all dependencies
3. Creating database models and running migrations
4. Building the Flask API endpoints
5. Building the React components
6. Connecting frontend to backend
7. Running the seed script
8. Testing the complete flow

Ask me if anything is unclear. Let's build this!

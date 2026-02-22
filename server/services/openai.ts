import OpenAI from "openai";
import type { Medication, Appointment, SimplifiedMedication, SimplifiedAppointment } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && !process.env.OPENAI_API_KEY
    ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }
    : {}),
});

interface ExtractedContent {
  patientName: string;
  diagnosis: string;
  medications: Medication[];
  appointments: Appointment[];
  instructions: string;
  warnings: string;
}

interface SimplifiedContent {
  diagnosis: string;
  medications: SimplifiedMedication[];
  appointments: SimplifiedAppointment[];
  instructions: string;
  warnings: string;
}

interface TranslatedContent extends SimplifiedContent {
  backTranslatedDiagnosis: string;
  backTranslatedInstructions: string;
  backTranslatedWarnings: string;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a medical document parser specializing in discharge summaries. Your task has TWO phases.

PHASE 1 — COMPREHENSIVE INVENTORY (think step-by-step):
Before producing JSON, mentally scan the ENTIRE document from start to finish and inventory every piece of medical information. Discharge documents vary widely in format — information may appear:
- In clearly labeled sections (e.g., "Medications", "Follow-Up")
- As free-text paragraphs with no section headers
- As colored, bold, or highlighted text (e.g., red warning text below a medication table)
- As footnotes, sidebars, margin notes, or callout boxes
- Embedded within medication instructions (e.g., "Stop taking if you experience...")
- In tables, checklists, or numbered/bulleted lists
- As addenda or additional pages appended to the main summary

Pay special attention to:
- WARNING SIGNS / RED FLAGS: These are often visually emphasized (red text, bold, exclamation marks, boxed content) and may appear ANYWHERE in the document — below medication tables, after instructions, in sidebars, at the very end, or interspersed within other sections. Collect ALL of them.
- MEDICATION SIDE EFFECTS & PRECAUTIONS: Sometimes listed separately from the medication table itself.
- ACTIVITY RESTRICTIONS & CARE INSTRUCTIONS: May be scattered across multiple sections.

PHASE 2 — STRUCTURED OUTPUT:
After your inventory, output valid JSON with this exact structure:
{
  "patientName": "Full name of the patient",
  "diagnosis": "Primary diagnosis and conditions",
  "medications": [{"name": "Drug name", "dose": "Amount", "frequency": "How often", "instructions": "Special notes including any precautions or side effects mentioned anywhere in the document for this medication"}],
  "appointments": [{"date": "Date or timeframe like 'Within 2 business days'", "time": "Time or 'To be scheduled' or 'Patient will receive a call'", "provider": "Doctor name", "location": "Full address or clinic name - NEVER redact", "purpose": "Reason for visit", "phone": "Phone number if provided", "schedulingInstructions": "How the appointment gets scheduled", "itemsToBring": "Items patient should bring to the appointment"}],
  "instructions": "ALL care instructions and activity restrictions from the entire document, consolidated",
  "warnings": "ALL warning signs, red flags, and reasons to seek immediate medical attention — gathered from EVERY part of the document, not just a section labeled 'Warnings'"
}

CRITICAL RULES:
- If the document is NOT a medical discharge summary or does NOT contain medical care instructions, set ALL fields to empty values (empty strings, empty arrays). Do NOT invent or hallucinate content. Set patientName to "" if no patient name is clearly identified in the document.
- Preserve ALL medical information accurately. NEVER replace real data with [REDACTED] or placeholders.
- The "warnings" field must contain EVERY warning sign, danger signal, or "call your doctor if" / "go to the ER if" statement found ANYWHERE in the document — even if it appears under medications, instructions, or in visually emphasized (red/bold) text.
- The "instructions" field must consolidate ALL care instructions from the entire document, not just from a section labeled "Instructions".
- Extract medications with exact dosages. If medication-specific warnings appear elsewhere in the document, include them in that medication's "instructions" field AND in the top-level "warnings" field.
- For appointments: capture ALL scheduling details verbatim — who calls whom, timeframes, phone numbers, what to bring.
- Extract the patient's full name from the document. If no patient name appears in the document, set patientName to "".`;

// Extract structured content from discharge document
export async function extractDischargeContent(text: string): Promise<ExtractedContent> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: EXTRACTION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Extract the following discharge summary into structured JSON. Remember to scan the ENTIRE document for warnings, instructions, and other details — they may not be in clearly labeled sections:\n\n${text}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as ExtractedContent;
}

// Extract content from image using Vision
export async function extractFromImage(base64Image: string): Promise<ExtractedContent> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: EXTRACTION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
          {
            type: "text",
            text: "Extract all discharge information from this medical document image into structured JSON. Scan the ENTIRE image for warnings, instructions, and details — they may appear as colored text, footnotes, sidebars, or in unexpected positions relative to the main content.",
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as ExtractedContent;
}

// Simplify content to 5th grade reading level
export async function simplifyContent(extracted: ExtractedContent): Promise<SimplifiedContent> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a health literacy expert. Rewrite medical content for patients with limited health literacy.

RULES:
1. Use 5th grade reading level (simple words, short sentences)
2. Keep drug names EXACTLY as written (do not simplify medication names)
3. Use "you" and active voice
4. Break complex instructions into numbered steps
5. Replace medical jargon with everyday words
6. Keep ALL critical safety information — every warning sign, red flag, and "call your doctor if" statement must be preserved in the "warnings" field. Do NOT drop any warnings even if they were originally embedded in medication or instruction sections.
7. NEVER remove, redact, or replace specific details like clinic names, addresses, phone numbers, doctor names, or dates with placeholders like [REDACTED]. Keep all specific details exactly as they appear.
8. For appointments: preserve ALL scheduling details including exact dates/timeframes, who will call whom, phone numbers to call, what to bring, and clinic locations. If the original says "patient will receive a call within 2 days", keep that exact detail.
9. Include phone, schedulingInstructions, and itemsToBring fields in each appointment object when available.
10. The "warnings" field is critical for patient safety. Ensure it contains ALL danger signs from the input — simplify the language but never omit a warning.

Output valid JSON with the same structure as input.`,
      },
      {
        role: "user",
        content: `Simplify this medical content to 5th grade reading level:\n\n${JSON.stringify(extracted, null, 2)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as SimplifiedContent;
}

// Translate content to target language with back-translation
export async function translateContent(
  simplified: SimplifiedContent,
  targetLanguage: string
): Promise<TranslatedContent> {
  // First, translate to target language
  const translateResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a medical translator. Translate health content accurately while maintaining simple language.

RULES:
1. Translate to ${targetLanguage}
2. Keep drug names in English (do not translate medication names)
3. Maintain the simple 5th grade reading level
4. Preserve all medical accuracy
5. Use culturally appropriate phrasing
6. NEVER remove, redact, or replace specific details like clinic names, addresses, phone numbers, doctor names, or dates. Keep all specific details exactly as they appear.
7. For appointment objects: preserve ALL fields including phone, schedulingInstructions, and itemsToBring when present.

Output valid JSON with the same structure.`,
      },
      {
        role: "user",
        content: `Translate this simplified medical content to ${targetLanguage}:\n\n${JSON.stringify(simplified, null, 2)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  const translatedContent = JSON.parse(
    translateResponse.choices[0]?.message?.content || "{}"
  ) as SimplifiedContent;

  // Then, back-translate key fields for verification
  const backTranslateResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Translate the following ${targetLanguage} medical content back to English. This is for verification purposes.
Output JSON with these fields:
{
  "backTranslatedDiagnosis": "...",
  "backTranslatedInstructions": "...",
  "backTranslatedWarnings": "..."
}`,
      },
      {
        role: "user",
        content: `Back-translate to English:\n\nDiagnosis: ${translatedContent.diagnosis}\n\nInstructions: ${translatedContent.instructions}\n\nWarnings: ${translatedContent.warnings}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const backTranslations = JSON.parse(
    backTranslateResponse.choices[0]?.message?.content || "{}"
  );

  return {
    ...translatedContent,
    backTranslatedDiagnosis: backTranslations.backTranslatedDiagnosis || "",
    backTranslatedInstructions: backTranslations.backTranslatedInstructions || "",
    backTranslatedWarnings: backTranslations.backTranslatedWarnings || "",
  };
}

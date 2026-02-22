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
  "appointments": [{"date": "Date or timeframe like 'Within 2 business days'", "time": "Time or 'To be scheduled' or 'Patient will receive a call'", "provider": "Doctor name", "location": "Full address or clinic name - NEVER redact", "purpose": "Appointment 1: Reason for visit (label each distinct appointment sequentially)", "phone": "Phone number if provided", "schedulingInstructions": "How the appointment gets scheduled", "itemsToBring": "Items patient should bring to the appointment"}],
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

interface SimplifyOptions {
  readingLevel?: number;
  clinicPhoneNumbers?: Array<{ label: string; number: string }>;
}

// Simplify content to 5th grade reading level
export async function simplifyContent(extracted: ExtractedContent, readingLevelOrOptions: number | SimplifyOptions = 5): Promise<SimplifiedContent> {
  const options: SimplifyOptions = typeof readingLevelOrOptions === "number"
    ? { readingLevel: readingLevelOrOptions }
    : readingLevelOrOptions;
  const readingLevel = options.readingLevel ?? 5;
  const clinicPhones = options.clinicPhoneNumbers || [];

  const gradeSuffix = readingLevel === 1 ? "st" : readingLevel === 2 ? "nd" : readingLevel === 3 ? "rd" : "th";
  const gradeLabel = `${readingLevel}${gradeSuffix} grade`;

  const phoneBlock = clinicPhones.length > 0
    ? `\n\nCLINIC PHONE NUMBERS (include the most relevant number in each appointment's "phone" field):\n${clinicPhones.map(p => `- ${p.label}: ${p.number}`).join("\n")}`
    : "";

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a health literacy expert. Rewrite medical content for patients with limited health literacy.

RULES:
1. Use ${gradeLabel} reading level (simple words, short sentences)
2. Keep drug names EXACTLY as written (do not simplify medication names)
3. Use "you" and active voice
4. Use numbered steps (1. 2. 3. …) for all instructions, medication instructions, and ordered lists. NEVER convert numbered lists to bullet points or vice versa. Preserve the original list format: if the source uses "1. 2. 3." keep numbered steps; if it uses "- " bullets, keep bullets. Within a single field, be consistent — default to numbered steps for procedural instructions and bullets for unordered lists of symptoms/signs.
5. Replace medical jargon with everyday words
6. Keep ALL critical safety information — every warning sign, red flag, and "call your doctor if" statement must be preserved in the "warnings" field. Do NOT drop any warnings even if they were originally embedded in medication or instruction sections.
7. NEVER remove, redact, or replace specific details like clinic names, addresses, phone numbers, doctor names, or dates with placeholders like [REDACTED]. Keep all specific details exactly as they appear.
8. For appointments: each distinct follow-up appointment MUST be its own object in the appointments array. Label each appointment's "purpose" field with a prefix: "Appointment 1: …", "Appointment 2: …", etc. Preserve ALL scheduling details including exact dates/timeframes, who will call whom, phone numbers to call, what to bring, and clinic locations.
9. Include phone, schedulingInstructions, and itemsToBring fields in each appointment object when available.${clinicPhones.length > 0 ? " If clinic phone numbers are provided below and the source document does not already include phone numbers for an appointment, select the most relevant clinic phone number and include it in the appointment's phone field." : ""}
10. The "warnings" field is critical for patient safety. Ensure it contains ALL danger signs from the input — simplify the language but never omit a warning.

Output valid JSON with the same structure as input.`,
      },
      {
        role: "user",
        content: `Simplify this medical content to ${gradeLabel} reading level:\n\n${JSON.stringify(extracted, null, 2)}${phoneBlock}`,
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
7. For appointment objects: preserve ALL fields including phone, schedulingInstructions, and itemsToBring when present. Keep the "Appointment 1:", "Appointment 2:" prefix labels — translate the word "Appointment" but keep the numbering.
8. Preserve numbered list formatting exactly. If the English source uses "1. 2. 3." numbered steps, the translation must also use "1. 2. 3." numbered steps. Do NOT convert between numbered lists and bullet points during translation.

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

import OpenAI from "openai";
import type { Medication, Appointment, SimplifiedMedication, SimplifiedAppointment } from "@shared/schema";

// Initialize OpenAI client with Replit AI Integrations
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface ExtractedContent {
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

// Extract structured content from discharge document
export async function extractDischargeContent(text: string): Promise<ExtractedContent> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a medical document parser. Extract structured information from discharge summaries.
Output valid JSON with this exact structure:
{
  "diagnosis": "Primary diagnosis and conditions",
  "medications": [{"name": "Drug name", "dose": "Amount", "frequency": "How often", "instructions": "Special notes"}],
  "appointments": [{"date": "Date", "time": "Time", "provider": "Doctor name", "location": "Address", "purpose": "Reason"}],
  "instructions": "All care instructions and activity restrictions",
  "warnings": "Warning signs that require immediate medical attention"
}
Preserve all medical information accurately. Extract medications with exact dosages.`,
      },
      {
        role: "user",
        content: `Extract the following discharge summary into structured JSON:\n\n${text}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
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
        content: `You are a medical document parser. Extract structured information from discharge summary images.
Output valid JSON with this exact structure:
{
  "diagnosis": "Primary diagnosis and conditions",
  "medications": [{"name": "Drug name", "dose": "Amount", "frequency": "How often", "instructions": "Special notes"}],
  "appointments": [{"date": "Date", "time": "Time", "provider": "Doctor name", "location": "Address", "purpose": "Reason"}],
  "instructions": "All care instructions and activity restrictions",
  "warnings": "Warning signs that require immediate medical attention"
}
Preserve all medical information accurately.`,
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
            text: "Extract all discharge information from this medical document image into structured JSON.",
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
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
6. Keep all critical safety information

Output valid JSON with the same structure as input.`,
      },
      {
        role: "user",
        content: `Simplify this medical content to 5th grade reading level:\n\n${JSON.stringify(extracted, null, 2)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
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

Output valid JSON with the same structure.`,
      },
      {
        role: "user",
        content: `Translate this simplified medical content to ${targetLanguage}:\n\n${JSON.stringify(simplified, null, 2)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
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

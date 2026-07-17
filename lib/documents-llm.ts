import { z } from "zod";
import { callLLM, LLMFallbackError } from "./llm";

export const DocumentExtractionSchema = z.object({
  documentType: z.enum(["BOL", "POD", "RATE_CON", "ACCESSORIAL", "FUEL_RECEIPT"]),
  broker: z.string().nullable(),
  amount: z.number().nullable(),
  loadReference: z.string().nullable(),
  date: z.string().nullable(),
  accessorialNotes: z.string().nullable(),
  confidence: z.record(z.string(), z.enum(["high", "medium", "low"])),
});
export type DocumentExtractionResult = z.infer<typeof DocumentExtractionSchema>;

const EXTRACTION_SYSTEM_PROMPT = `Extract structured data from this freight document image.
Return ONLY valid JSON: { "documentType": "BOL"|"POD"|"RATE_CON"|
"ACCESSORIAL"|"FUEL_RECEIPT", "broker": string|null, "amount": number|null,
"loadReference": string|null, "date": string|null,
"accessorialNotes": string|null,
"confidence": { "amount": "high"|"medium"|"low", ... per field } }
If a field is illegible or absent, return null for it and mark confidence "low" —
never guess a value.`;

export async function extractDocumentFields(
  imageBase64: string,
  mimeType: string,
  declaredType: string
): Promise<DocumentExtractionResult | null> {
  try {
    return await callLLM(
      {
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        userPrompt: `Declared type by uploader: ${declaredType}. Extract the data.`,
        images: [{ data: imageBase64, mimeType }],
      },
      DocumentExtractionSchema
    );
  } catch (err) {
    if (err instanceof LLMFallbackError) return null;
    throw err;
  }
}

export const DiscrepancyClassificationSchema = z.object({
  classification: z.enum(["legitimate_accessorial", "likely_error", "uncertain"]),
  justification: z.string(),
});
export type DiscrepancyClassificationResult = z.infer<typeof DiscrepancyClassificationSchema>;

const CLASSIFICATION_SYSTEM_PROMPT = `An invoice amount doesn't match the rate confirmation for a load.
Decide if the difference is a legitimate accessorial charge (detention,
lumper fee, etc., evidenced in the document notes) or likely an error.
Return ONLY valid JSON: { "classification": "legitimate_accessorial"|
"likely_error"|"uncertain", "justification": string }
If notes don't clearly support a reason, use "uncertain" — do not invent
a justification.`;

export async function classifyDiscrepancy(
  rateConAmount: number,
  invoiceAmount: number,
  delta: number,
  notes: string,
  hasSupportingDoc: boolean
): Promise<DiscrepancyClassificationResult | null> {
  const userPrompt = `Rate con amount: $${rateConAmount}. Invoice amount: $${invoiceAmount}. Delta: $${delta}.
Extracted notes from documents: "${notes}". Supporting accessorial doc
on file: ${hasSupportingDoc ? "yes" : "no"}.`;

  try {
    return await callLLM(
      { systemPrompt: CLASSIFICATION_SYSTEM_PROMPT, userPrompt },
      DiscrepancyClassificationSchema
    );
  } catch (err) {
    if (err instanceof LLMFallbackError) return null;
    throw err;
  }
}

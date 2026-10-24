import { PROMPT_VERSION } from '../shared/types';

export { PROMPT_VERSION };

export interface PromptBundle {
  version: string;
  classificationSystem: string;
  codeAnswerSystem: string;
  mcqAnswerSystem: string;
}

/** Section 7 — versioned system instructions for Gemini calls. */
export const PROMPTS: PromptBundle = {
  version: PROMPT_VERSION,
  classificationSystem: `You are CT-C Assistant (read-only). Classify CodeTantra C practice pages.
Return JSON only matching the schema. Never suggest clicking or typing on the page.
Types: complete_program, fill_in_blank, debugging, mcq_multi, mcq_single, quiz, unknown.
Use statement, editor skeleton, and headings only. confidence in [0,1]. evidence: short strings.`,
  codeAnswerSystem: `You are CT-C Assistant. Produce C code answers for gnu11 (C11).
Return JSON only. final_code must compile standalone with stdio.h when needed.
For fill_in_blank: minimal edits preserving scaffolding. For debugging: list bugs[] with line numbers.
edits[] describe line-level changes; hint is user-facing, not copied to the page.
Never include college emails or PII. assumptions[] for ambiguous I/O.`,
  mcqAnswerSystem: `You are CT-C Assistant. Answer multiple-choice questions from extracted text only.
Return JSON only. selected[] holds option ids. options[] judges each id with reason.
Set needs_code_run when execution is required; code_to_run is C snippet or null.
needs_user_decision when the page lacks enough context.`,
};

export function getPromptBundle(version: string = PROMPT_VERSION): PromptBundle {
  if (version !== PROMPT_VERSION) {
    throw new Error(`Unsupported prompt version: ${version}`);
  }
  return PROMPTS;
}

export function buildClassificationUserPayload(input: {
  heading: string;
  statement: string;
  editorExcerpt: string;
  urlPath: string;
}): string {
  return JSON.stringify({
    heading: input.heading,
    statement: input.statement.slice(0, 12_000),
    editorExcerpt: input.editorExcerpt.slice(0, 8000),
    urlPath: input.urlPath,
  });
}

export function buildCodeAnswerUserPayload(input: {
  question: unknown;
  samples: unknown;
  editor: unknown;
  cStandard: string;
}): string {
  return JSON.stringify(input);
}

export function buildMcqAnswerUserPayload(input: { question: unknown; options: unknown }): string {
  return JSON.stringify(input);
}

import { z } from 'zod';

export const ClassificationSchema = z
  .object({
    type: z.enum([
      'complete_program',
      'fill_in_blank',
      'debugging',
      'mcq_multi',
      'mcq_single',
      'quiz',
      'unknown',
    ]),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()).max(20),
  })
  .strict();

export const CodeEditSchema = z
  .object({
    line: z.number().int(),
    action: z.enum(['insert', 'replace', 'delete']),
    before: z.string().max(4000),
    after: z.string().max(4000),
    hint: z.string().max(500),
  })
  .strict();

export const BugFixSchema = z
  .object({
    line: z.number().int(),
    issue: z.string().max(1000),
    fix: z.string().max(1000),
  })
  .strict();

export const CodeAnswerSchema = z
  .object({
    type: z.enum(['complete_program', 'fill_in_blank', 'debugging']),
    final_code: z.string().max(100_000),
    edits: z.array(CodeEditSchema).max(200),
    bugs: z.array(BugFixSchema).max(100),
    explanation: z.array(z.string().max(500)).max(10),
    assumptions: z.array(z.string().max(500)).max(20),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const McqAnswerSchema = z
  .object({
    selected: z.array(z.string()).max(50),
    options: z
      .array(
        z
          .object({
            id: z.string(),
            correct: z.boolean(),
            reason: z.string().max(1000),
          })
          .strict(),
      )
      .max(50),
    needs_code_run: z.boolean(),
    code_to_run: z.string().max(100_000).nullable(),
    needs_user_decision: z.boolean(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  if (fence?.[1]) return fence[1].trim();
  return trimmed;
}

export function parseJsonLoose(raw: string): unknown {
  const cleaned = stripCodeFences(raw);
  return JSON.parse(cleaned);
}

export function validateClassification(raw: unknown) {
  return ClassificationSchema.safeParse(raw);
}

export function validateCodeAnswer(raw: unknown) {
  return CodeAnswerSchema.safeParse(raw);
}

export function validateMcqAnswer(raw: unknown) {
  return McqAnswerSchema.safeParse(raw);
}

/** JSON Schema objects for Gemini structured output (responseSchema). */
export const CODE_ANSWER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['complete_program', 'fill_in_blank', 'debugging'] },
    final_code: { type: 'string' },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'number' },
          action: { type: 'string', enum: ['insert', 'replace', 'delete'] },
          before: { type: 'string' },
          after: { type: 'string' },
          hint: { type: 'string' },
        },
        required: ['line', 'action', 'before', 'after', 'hint'],
      },
    },
    bugs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'number' },
          issue: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['line', 'issue', 'fix'],
      },
    },
    explanation: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
  required: [
    'type',
    'final_code',
    'edits',
    'bugs',
    'explanation',
    'assumptions',
    'confidence',
  ],
} as const;

export const MCQ_ANSWER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    selected: { type: 'array', items: { type: 'string' } },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          correct: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['id', 'correct', 'reason'],
      },
    },
    needs_code_run: { type: 'boolean' },
    code_to_run: { type: ['string', 'null'] },
    needs_user_decision: { type: 'boolean' },
    confidence: { type: 'number' },
  },
  required: [
    'selected',
    'options',
    'needs_code_run',
    'code_to_run',
    'needs_user_decision',
    'confidence',
  ],
} as const;

export const CLASSIFICATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: [
        'complete_program',
        'fill_in_blank',
        'debugging',
        'mcq_multi',
        'mcq_single',
        'quiz',
        'unknown',
      ],
    },
    confidence: { type: 'number' },
    evidence: { type: 'array', items: { type: 'string' } },
  },
  required: ['type', 'confidence', 'evidence'],
} as const;

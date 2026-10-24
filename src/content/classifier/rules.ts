import type { QuestionType } from '../../shared/types';

export type RuleField = 'heading' | 'statement' | 'editor' | 'urlPath' | 'combined' | 'probeKind';

export interface Stage1Rule {
  id: string;
  type: QuestionType;
  /** First matching rule wins (ordered list). */
  field: RuleField;
  patterns: RegExp[];
  /** Minimum pattern hits required (default 1). */
  minHits?: number;
  baseConfidence: number;
  /** When true, rule only applies if probeKind matches type quiz. */
  requiresQuizProbe?: boolean;
  /** Fallback rule — matches when no prior rule matched. */
  fallback?: boolean;
}

export const STAGE1_RULES: Stage1Rule[] = [
  {
    id: 'quiz-url',
    type: 'quiz',
    field: 'urlPath',
    patterns: [/\/quiz\b/i, /\/assessment\b/i, /\/exam\b/i, /\/mcq\b/i],
    baseConfidence: 0.92,
    requiresQuizProbe: false,
  },
  {
    id: 'quiz-heading',
    type: 'quiz',
    field: 'heading',
    patterns: [/^quiz\b/i, /\bquiz\s*:/i, /\bmultiple\s+choice\s+quiz\b/i],
    baseConfidence: 0.9,
  },
  {
    id: 'quiz-probe',
    type: 'quiz',
    field: 'probeKind',
    patterns: [/^quiz$/i],
    baseConfidence: 0.88,
  },
  {
    id: 'fill-blank-statement',
    type: 'fill_in_blank',
    field: 'statement',
    patterns: [
      /fill\s+in\s+the\s+blank/i,
      /fill\s+in\s+the\s+missing/i,
      /complete\s+the\s+code\s+below/i,
      /insert\s+the\s+missing/i,
      /____+/,
    ],
    baseConfidence: 0.86,
  },
  {
    id: 'fill-blank-editor',
    type: 'fill_in_blank',
    field: 'editor',
    patterns: [
      /\/\/\s*TODO/i,
      /\/\*\s*TODO/i,
      /YOUR\s+CODE\s+HERE/i,
      /\/\*\s*your code\s*\*\//i,
      /\/\/\s*Write the code/i,
      /return\s*;\s*\/\/\s*Write the code/i,
      /int\s+\w+\s*\(\s*\)\s*\{/,
      /<blank>/i,
      /FILL\s+IN/i,
      /_{3,}/,
      /<<</,
    ],
    minHits: 1,
    baseConfidence: 0.84,
  },
  {
    id: 'debugging-statement',
    type: 'debugging',
    field: 'statement',
    patterns: [
      /\bdebug\b/i,
      /\bfind\s+the\s+(bug|error)\b/i,
      /\bfix\s+the\s+(bug|error|program)\b/i,
      /\bincorrect\s+output\b/i,
      /\bprogram\s+does\s+not\s+compile\b/i,
    ],
    baseConfidence: 0.83,
  },
  {
    id: 'debugging-editor',
    type: 'debugging',
    field: 'editor',
    patterns: [/\/\/\s*BUG/i, /\/\*\s*BUG/i, /FIX\s+ME/i, /WRONG/i],
    baseConfidence: 0.8,
  },
  {
    id: 'mcq-multi-statement',
    type: 'mcq_multi',
    field: 'statement',
    patterns: [
      /\bselect\s+all\b/i,
      /\bchoose\s+all\s+that\s+apply\b/i,
      /\bmultiple\s+answers\b/i,
      /\bmark\s+all\s+correct\b/i,
    ],
    baseConfidence: 0.82,
  },
  {
    id: 'mcq-multi-dom-hint',
    type: 'mcq_multi',
    field: 'combined',
    patterns: [/\bcheckbox\b/i, /type=["']checkbox["']/i],
    baseConfidence: 0.75,
  },
  {
    id: 'mcq-single-statement',
    type: 'mcq_single',
    field: 'statement',
    patterns: [
      /\bchoose\s+one\b/i,
      /\bselect\s+one\b/i,
      /\bsingle\s+correct\s+answer\b/i,
      /\bwhich\s+of\s+the\s+following\b/i,
    ],
    baseConfidence: 0.8,
  },
  {
    id: 'mcq-single-dom-hint',
    type: 'mcq_single',
    field: 'combined',
    patterns: [/\btype=["']radio["']/i, /\bradio\s+button\b/i],
    baseConfidence: 0.72,
  },
  {
    id: 'complete-program-fallback',
    type: 'complete_program',
    field: 'combined',
    patterns: [/./s],
    fallback: true,
    baseConfidence: 0.55,
  },
];

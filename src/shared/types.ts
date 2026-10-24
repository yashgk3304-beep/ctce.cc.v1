export type PageKind = 'coding' | 'quiz' | 'other';

export type QuestionType =
  | 'complete_program'
  | 'fill_in_blank'
  | 'debugging'
  | 'mcq_multi'
  | 'mcq_single'
  | 'quiz'
  | 'unknown';

export type PanelState =
  | 'Idle'
  | 'Reading'
  | 'WaitingForSamples'
  | 'Thinking'
  | 'Verifying'
  | 'Ready'
  | 'NeedsDecision'
  | 'Error'
  | 'QuizIgnored'
  | 'Stale';

export type VerificationBadge =
  | { kind: 'PASSED_VISIBLE_SAMPLES'; compareMode: CompareMode }
  | { kind: 'PARTIAL'; passed: number; total: number }
  | { kind: 'COMPILE_ERROR'; errors: string[] }
  | { kind: 'UNVERIFIED_HELPER_OFF' }
  | { kind: 'UNVERIFIED_NO_SAMPLES' }
  | { kind: 'UNVERIFIED_PARTIAL_EDITOR' }
  | { kind: 'STALE' }
  | { kind: 'NEEDS_YOUR_DECISION'; reason: string };

export type CompareMode = 'strict' | 'trimmed' | 'whitespaceInsensitive' | 'echoAware';

export interface ExtractResult<T> {
  ok: boolean;
  value: T | null;
  confidence: number;
  evidence: string[];
  warnings: string[];
}

export interface ProbeResult {
  kind: PageKind;
  confidence: number;
  evidence: string[];
}

export interface QuestionData {
  heading: string;
  statement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
}

export interface SampleTest {
  id: string;
  input: string;
  expected: string;
}

export type SamplesStatus = 'ok' | 'collapsed' | 'missing' | 'unparsed';

export interface SamplesData {
  status: SamplesStatus;
  tests: SampleTest[];
}

export type EditorEngine = 'monaco' | 'ace' | 'codemirror5' | 'codemirror6' | 'unknown';

export interface EditorData {
  engine: EditorEngine;
  fileName: string;
  text: string;
  visibleLineStart: number;
  visibleLineEnd: number;
  partial: boolean;
  source: 'dom' | 'main_world';
}

export interface PageSnapshot {
  tabId: number;
  frameId: number;
  probe: ProbeResult;
  question: ExtractResult<QuestionData>;
  samples: ExtractResult<SamplesData>;
  editor: ExtractResult<EditorData>;
  signature: string;
  capturedAt: number;
}

export interface Classification {
  type: QuestionType;
  confidence: number;
  evidence: string[];
  stage: 1 | 2;
}

export interface CodeEdit {
  line: number;
  action: 'insert' | 'replace' | 'delete';
  before: string;
  after: string;
  hint: string;
}

export interface BugFix {
  line: number;
  issue: string;
  fix: string;
}

export interface CodeAnswer {
  type: 'complete_program' | 'fill_in_blank' | 'debugging';
  final_code: string;
  edits: CodeEdit[];
  bugs: BugFix[];
  explanation: string[];
  assumptions: string[];
  confidence: number;
}

export interface McqOptionJudgement {
  id: string;
  correct: boolean;
  reason: string;
}

export interface McqAnswer {
  selected: string[];
  options: McqOptionJudgement[];
  needs_code_run: boolean;
  code_to_run: string | null;
  needs_user_decision: boolean;
  confidence: number;
}

export type SuggestionAnswer = CodeAnswer | McqAnswer;

export interface Settings {
  geminiApiKey: string;
  fastModel: string;
  strongModel: string;
  models: string[];
  autoSuggest: boolean;
  autoExpand: boolean;
  autoVerify: boolean;
  hintFirst: boolean;
  cStandard: string;
  testTimeoutMs: number;
  helperPort: number;
  helperToken: string;
  consentAccepted: boolean;
  dailyRequestCount: number;
  dailyRequestDate: string;
  theme: 'light' | 'dark' | 'system';
  logging: boolean;
  o2UbCheck: boolean;
  panelPosition: { x: number; y: number; w: number; h: number } | null;
  mutedPages: string[];
  typeOverrides: Record<string, QuestionType>;
  notQuizOverrides: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: '',
  fastModel: '',
  strongModel: '',
  models: [],
  autoSuggest: true,
  autoExpand: true,
  autoVerify: true,
  hintFirst: false,
  cStandard: 'gnu11',
  testTimeoutMs: 2000,
  helperPort: 47831,
  helperToken: '',
  consentAccepted: false,
  dailyRequestCount: 0,
  dailyRequestDate: '',
  theme: 'system',
  logging: false,
  o2UbCheck: false,
  panelPosition: null,
  mutedPages: [],
  typeOverrides: {},
  notQuizOverrides: [],
};

export const PROMPT_VERSION = '1';

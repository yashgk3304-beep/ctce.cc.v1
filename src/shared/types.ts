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

export type ApiKeySlotId = 'primary' | 'backup1' | 'backup2';

export interface ApiKeySlot {
  apiKey: string;
  model: string;
}

export interface ApiKeySlotStatus {
  invalid?: boolean;
  cooldownUntil?: number;
  exhaustedUntil?: number;
  lastError?: 'invalid_key' | 'rate_limit' | 'daily_quota';
}

export type WriteMode = 'replace' | 'insert';

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
  captureTiming?: CaptureTiming;
}

export interface CaptureTiming {
  probeMs: number;
  questionExtractionMs: number;
  sampleExtractionMs: number;
  editorExtractionMs: number;
  mainWorldEditorMs: number;
  signatureMs: number;
  totalMs: number;
}

/** Sanitized local performance data. Never includes question, editor, or sample text. */
export interface PerformanceRecord {
  timestamp: number;
  modelIds: string[];
  apiKeySlot?: ApiKeySlotId;
  inputTokens: number | null;
  outputTokens: number | null;
  attempts: number;
  retries: number;
  cacheHit: boolean;
  captureMs: number;
  browserProbeMs: number;
  questionExtractionMs: number;
  sampleExtractionMs: number;
  editorExtractionMs: number;
  mainWorldEditorMs: number;
  signatureMs: number;
  promptBuildMs: number;
  modelRequestMs: number;
  responseParseMs: number;
  gccCompileMs: number;
  sampleExecutionMs: number;
  helperRoundTripMs: number;
  compileOk: boolean | null;
  sampleTestsPassed: number | null;
  sampleTestCount: number | null;
  totalMs: number;
  errorCode?: string;
  errorStatus?: number;
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
  language?: string;
  blanks?: Array<{ index: number; code: string }>;
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
  type?: 'mcq';
  language?: string;
  code?: string;
  blanks?: Array<{ index: number; code: string }>;
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
  apiKeySlots: Record<ApiKeySlotId, ApiKeySlot>;
  apiKeySlotStatus: Partial<Record<ApiKeySlotId, ApiKeySlotStatus>>;
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
  editorSelectorsByHost: Record<string, string>;
  writeMode: WriteMode;
  typingAnimation: boolean;
  typingCharsPerSecond: number;
}

export const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: '',
  apiKeySlots: {
    primary: { apiKey: '', model: '' },
    backup1: { apiKey: '', model: '' },
    backup2: { apiKey: '', model: '' },
  },
  apiKeySlotStatus: {},
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
  editorSelectorsByHost: {},
  writeMode: 'replace',
  typingAnimation: false,
  typingCharsPerSecond: 60,
};

export const PROMPT_VERSION = '3';

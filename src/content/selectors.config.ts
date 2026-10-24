/**
 * Configurable DOM selectors and page signals for CodeTantra-like layouts.
 * Tune here when the host changes markup (see docs/ASSUMPTIONS.md).
 */

export const EDITOR_ROOT_SELECTORS = [
  '.monaco-editor',
  '.ace_editor',
  '.CodeMirror',
  '.cm-editor',
  '[data-testid="code-editor"]',
  '.code-editor',
] as const;

export const MONACO_SELECTORS = {
  root: '.monaco-editor',
  viewLines: '.view-lines',
  viewLine: '.view-line',
  lineNumbers: '.margin-view-overlays .line-numbers',
  lineNumberCell: '.line-numbers',
} as const;

export const ACE_SELECTORS = {
  root: '.ace_editor',
  line: '.ace_line',
  gutter: '.ace_gutter-cell',
} as const;

export const CODEMIRROR5_SELECTORS = {
  root: '.CodeMirror',
  line: '.CodeMirror-line',
  gutter: '.CodeMirror-linenumber',
} as const;

export const CODEMIRROR6_SELECTORS = {
  root: '.cm-editor',
  line: '.cm-line',
  gutter: '.cm-gutterElement',
} as const;

export const QUESTION_REGION_SELECTORS = [
  '[data-testid="question-panel"]',
  '.question-panel',
  '.problem-statement',
  '.question-description',
  'main .left-panel',
  'main .pane-left',
  '.split-pane-left',
  '[role="main"] section:first-of-type',
] as const;

export const HEADING_SELECTORS = [
  'h1',
  'h2.question-title',
  '.question-heading',
  '[data-testid="question-title"]',
] as const;

export const SECTION_LABEL_PATTERNS = {
  constraints: /\bconstraints?\b/i,
  inputFormat: /\binput\s*format\b/i,
  outputFormat: /\boutput\s*format\b/i,
} as const;

export const SAMPLE_TEST_CASES_LABELS = [
  'Sample Test Cases',
  'Sample test cases',
  'Sample Tests',
] as const;

export const TEST_CASES_TAB_LABELS = ['Test cases', 'Test Cases', 'Testcases'] as const;

export const SAMPLE_ACCORDION_SELECTORS = [
  '[data-testid="sample-test-cases"]',
  '.sample-test-cases',
  '.accordion-item:has(.accordion-header)',
  'details.sample-cases',
  '[aria-label*="Sample Test"]',
] as const;

export const SAMPLE_INPUT_LABELS = ['Input', 'Stdin', 'Standard Input'] as const;
export const SAMPLE_OUTPUT_LABELS = ['Output', 'Stdout', 'Expected Output'] as const;

export const ACTION_BUTTON_LABELS = {
  submit: ['Submit', 'Submit Code', 'Submit Answer'],
  run: ['Run', 'Run Code', 'Compile & Run', 'Execute'],
} as const;

export const TERMINAL_LABELS = ['Terminal', 'Console', 'Output', 'Execution Result'] as const;

/** Elements excluded from question text and signatures. */
export const NOISE_SELECTORS = [
  '.timer-chip',
  '.countdown',
  '[data-testid="timer"]',
  '.time-remaining',
  '.help-widget',
  '.stuck-widget',
  '[aria-label*="Are you stuck"]',
  '.are-you-stuck',
  '#help-floating',
  '.toast',
  '.notification',
] as const;

export const TIMER_CHIP_SELECTORS = NOISE_SELECTORS.filter((s) =>
  /timer|countdown|time-remaining/i.test(s),
);

export const HELP_WIDGET_SELECTORS = NOISE_SELECTORS.filter((s) =>
  /help|stuck|widget/i.test(s),
);

/** Placeholder markers in editor / statement for fill-in-blank detection. */
export const PLACEHOLDER_MARKERS = [
  '/* TODO',
  '// TODO',
  '// Write the code',
  '____',
  '___',
  '<blank>',
  'FILL_IN',
  'FILL IN',
  'YOUR CODE HERE',
  'INSERT CODE',
  '<<<',
  '>>>',
  '/* YOUR CODE',
  '/* your code */',
  '/* Write your code',
] as const;

export const QUIZ_URL_PATH_PATTERNS = [
  /\/quiz\b/i,
  /\/assessment\b/i,
  /\/exam\b/i,
  /\/mcq\b/i,
  /question-type=quiz/i,
] as const;

export const QUIZ_HEADING_PATTERNS = [
  /^quiz\b/i,
  /\bquiz\s*:/i,
  /\bmultiple\s+choice\s+quiz\b/i,
  /\bassessment\b/i,
] as const;

export const CODING_URL_PATH_PATTERNS = [
  /\/practice\b/i,
  /\/coding\b/i,
  /\/problem\b/i,
  /\/challenge\b/i,
  /\/assignment\b/i,
] as const;

export const IFRAME_EDITOR_SELECTORS = ['iframe.editor-frame', 'iframe[src*="editor"]'] as const;

export const SELECTORS_CONFIG = {
  editorRoots: EDITOR_ROOT_SELECTORS,
  monaco: MONACO_SELECTORS,
  ace: ACE_SELECTORS,
  cm5: CODEMIRROR5_SELECTORS,
  cm6: CODEMIRROR6_SELECTORS,
  questionRegions: QUESTION_REGION_SELECTORS,
  headings: HEADING_SELECTORS,
  sectionLabels: SECTION_LABEL_PATTERNS,
  sampleLabels: SAMPLE_TEST_CASES_LABELS,
  testTabLabels: TEST_CASES_TAB_LABELS,
  sampleAccordion: SAMPLE_ACCORDION_SELECTORS,
  sampleInputLabels: SAMPLE_INPUT_LABELS,
  sampleOutputLabels: SAMPLE_OUTPUT_LABELS,
  actionButtons: ACTION_BUTTON_LABELS,
  terminalLabels: TERMINAL_LABELS,
  noise: NOISE_SELECTORS,
  timer: TIMER_CHIP_SELECTORS,
  helpWidget: HELP_WIDGET_SELECTORS,
  placeholders: PLACEHOLDER_MARKERS,
  quizUrl: QUIZ_URL_PATH_PATTERNS,
  quizHeading: QUIZ_HEADING_PATTERNS,
  codingUrl: CODING_URL_PATH_PATTERNS,
  iframeEditor: IFRAME_EDITOR_SELECTORS,
} as const;

export type SelectorsConfig = typeof SELECTORS_CONFIG;

import type { ProbeResult } from '../shared/types';
import {
  ACTION_BUTTON_LABELS,
  CODING_URL_PATH_PATTERNS,
  EDITOR_ROOT_SELECTORS,
  QUIZ_HEADING_PATTERNS,
  QUIZ_URL_PATH_PATTERNS,
  SAMPLE_TEST_CASES_LABELS,
  TERMINAL_LABELS,
  TEST_CASES_TAB_LABELS,
} from './selectors.config';

function safePath(doc: Document): string {
  try {
    return doc.defaultView?.location?.pathname ?? '';
  } catch {
    return '';
  }
}

function hasEditor(doc: Document): boolean {
  for (const sel of EDITOR_ROOT_SELECTORS) {
    if (doc.querySelector(sel)) return true;
  }
  return false;
}

function bodyIncludes(doc: Document, needles: readonly string[]): boolean {
  const text = doc.body?.textContent ?? '';
  return needles.some((n) => text.includes(n));
}

function headingMatchesQuiz(doc: Document): boolean {
  const headings = doc.querySelectorAll('h1, h2, h3, .question-heading, [data-testid="question-title"]');
  for (const h of headings) {
    const t = (h.textContent ?? '').trim();
    if (QUIZ_HEADING_PATTERNS.some((re) => re.test(t))) return true;
  }
  return false;
}

function urlMatches(path: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(path));
}

/**
 * Classify page kind from independent DOM / URL signals. Never throws.
 */
export function pageProbe(doc: Document): ProbeResult {
  const evidence: string[] = [];
  try {
    const path = safePath(doc);
    const editor = hasEditor(doc);
    const sampleLabel = bodyIncludes(doc, SAMPLE_TEST_CASES_LABELS);
    const testTab = bodyIncludes(doc, TEST_CASES_TAB_LABELS);
    const terminal = bodyIncludes(doc, TERMINAL_LABELS);
    const submitRun =
      bodyIncludes(doc, ACTION_BUTTON_LABELS.submit) ||
      bodyIncludes(doc, ACTION_BUTTON_LABELS.run);
    const quizUrl = urlMatches(path, QUIZ_URL_PATH_PATTERNS);
    const codingUrl = urlMatches(path, CODING_URL_PATH_PATTERNS);
    const quizHeading = headingMatchesQuiz(doc);

    if (editor) evidence.push('editor-present');
    if (sampleLabel) evidence.push('sample-test-cases-label');
    if (testTab) evidence.push('test-cases-tab-label');
    if (terminal) evidence.push('terminal-label');
    if (submitRun) evidence.push('submit-or-run-label');
    if (quizUrl) evidence.push('quiz-url-path');
    if (codingUrl) evidence.push('coding-url-path');
    if (quizHeading) evidence.push('quiz-heading');

    let quizScore = 0;
    let codingScore = 0;

    if (quizUrl) quizScore += 3;
    if (quizHeading) quizScore += 2;
    if (!editor && !sampleLabel && !testTab) quizScore += 1;

    if (editor) codingScore += 3;
    if (sampleLabel || testTab) codingScore += 2;
    if (terminal) codingScore += 1;
    if (submitRun) codingScore += 1;
    if (codingUrl) codingScore += 1;

    if (quizScore >= 3 && quizScore > codingScore) {
      const confidence = Math.min(0.95, 0.5 + quizScore * 0.1);
      return { kind: 'quiz', confidence, evidence };
    }

    if (codingScore >= 2) {
      const confidence = Math.min(0.98, 0.45 + codingScore * 0.08);
      return { kind: 'coding', confidence, evidence };
    }

    if (quizScore > 0 && quizScore >= codingScore) {
      return { kind: 'quiz', confidence: 0.4 + quizScore * 0.05, evidence };
    }

    return { kind: 'other', confidence: evidence.length ? 0.35 : 0.15, evidence };
  } catch (err) {
    return {
      kind: 'other',
      confidence: 0,
      evidence: [`probe-error:${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

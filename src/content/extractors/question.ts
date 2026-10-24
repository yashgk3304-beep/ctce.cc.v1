import type { ExtractResult, QuestionData } from '../../shared/types';
import { normalizeText, stripTimerNoise } from '../../shared/normalize';
import {
  HEADING_SELECTORS,
  NOISE_SELECTORS,
  QUESTION_REGION_SELECTORS,
  SECTION_LABEL_PATTERNS,
} from '../selectors.config';

function cloneWithoutNoise(root: ParentNode, doc: Document): HTMLElement {
  const host = doc.createElement('div');
  if (root instanceof HTMLElement) {
    host.innerHTML = root.innerHTML;
  } else if (root instanceof DocumentFragment) {
    host.append(...Array.from(root.childNodes).map((n) => n.cloneNode(true)));
  }
  for (const sel of NOISE_SELECTORS) {
    host.querySelectorAll(sel).forEach((el) => el.remove());
  }
  return host;
}

function findQuestionRoot(doc: Document): HTMLElement | null {
  for (const sel of QUESTION_REGION_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el instanceof HTMLElement && (el.textContent?.trim().length ?? 0) > 40) {
      return el;
    }
  }
  return doc.body instanceof HTMLElement ? doc.body : null;
}

function extractHeading(doc: Document, region: HTMLElement): string {
  for (const sel of HEADING_SELECTORS) {
    const el = region.querySelector(sel) ?? doc.querySelector(sel);
    const text = normalizeText(stripTimerNoise(el?.textContent ?? ''));
    if (text.length > 0 && text.length < 300) return text;
  }
  return '';
}

function splitSections(text: string): {
  statement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
} {
  const lines = normalizeText(stripTimerNoise(text)).split('\n');
  let constraints = '';
  let inputFormat = '';
  let outputFormat = '';
  const statementLines: string[] = [];
  let mode: 'statement' | 'constraints' | 'input' | 'output' = 'statement';

  for (const line of lines) {
    if (SECTION_LABEL_PATTERNS.constraints.test(line)) {
      mode = 'constraints';
      constraints += line.replace(SECTION_LABEL_PATTERNS.constraints, '').trim() + '\n';
      continue;
    }
    if (SECTION_LABEL_PATTERNS.inputFormat.test(line)) {
      mode = 'input';
      inputFormat += line.replace(SECTION_LABEL_PATTERNS.inputFormat, '').trim() + '\n';
      continue;
    }
    if (SECTION_LABEL_PATTERNS.outputFormat.test(line)) {
      mode = 'output';
      outputFormat += line.replace(SECTION_LABEL_PATTERNS.outputFormat, '').trim() + '\n';
      continue;
    }
    switch (mode) {
      case 'constraints':
        constraints += line + '\n';
        break;
      case 'input':
        inputFormat += line + '\n';
        break;
      case 'output':
        outputFormat += line + '\n';
        break;
      default:
        statementLines.push(line);
    }
  }

  return {
    statement: statementLines.join('\n').trim(),
    constraints: constraints.trim(),
    inputFormat: inputFormat.trim(),
    outputFormat: outputFormat.trim(),
  };
}

export function extractQuestion(doc: Document): ExtractResult<QuestionData> {
  const evidence: string[] = [];
  const warnings: string[] = [];
  try {
    const root = findQuestionRoot(doc);
    if (!root) {
      return {
        ok: false,
        value: null,
        confidence: 0,
        evidence: ['no-question-region'],
        warnings: [],
      };
    }
    evidence.push('question-region');

    const cleaned = cloneWithoutNoise(root, doc);
    const heading = extractHeading(doc, cleaned);
    if (heading) evidence.push('heading');

    const raw = cleaned.textContent ?? '';
    const parts = splitSections(raw);

    if (!parts.statement && !heading) {
      warnings.push('empty-statement');
    }

    const confidence =
      0.35 +
      (heading ? 0.15 : 0) +
      (parts.statement.length > 50 ? 0.25 : parts.statement.length > 10 ? 0.15 : 0) +
      (parts.constraints || parts.inputFormat || parts.outputFormat ? 0.1 : 0);

    return {
      ok: Boolean(parts.statement || heading),
      value: {
        heading,
        statement: parts.statement,
        constraints: parts.constraints,
        inputFormat: parts.inputFormat,
        outputFormat: parts.outputFormat,
      },
      confidence: Math.min(confidence, 0.95),
      evidence,
      warnings,
    };
  } catch (err) {
    return {
      ok: false,
      value: null,
      confidence: 0,
      evidence: [`extract-question-error:${err instanceof Error ? err.message : String(err)}`],
      warnings,
    };
  }
}

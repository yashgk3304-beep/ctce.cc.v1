import type { Classification, PageKind, QuestionType } from '../../shared/types';
import { STAGE1_RULES, type RuleField, type Stage1Rule } from './rules';

export interface ClassifierStage1Input {
  probeKind: PageKind;
  urlPath: string;
  heading: string;
  statement: string;
  editorText: string;
  /** Optional raw HTML snippet for MCQ DOM hints (no execution). */
  htmlHint?: string;
}

function fieldText(input: ClassifierStage1Input, field: RuleField): string {
  switch (field) {
    case 'heading':
      return input.heading;
    case 'statement':
      return input.statement;
    case 'editor':
      return input.editorText;
    case 'urlPath':
      return input.urlPath;
    case 'probeKind':
      return input.probeKind;
    case 'combined':
      return `${input.heading}\n${input.statement}\n${input.editorText}\n${input.htmlHint ?? ''}`;
    default:
      return '';
  }
}

export function countPatternHits(text: string, patterns: RegExp[]): number {
  let hits = 0;
  for (const re of patterns) {
    if (re.test(text)) hits += 1;
  }
  return hits;
}

export function ruleMatches(rule: Stage1Rule, input: ClassifierStage1Input): { matched: boolean; evidence: string[] } {
  if (rule.fallback) {
    return { matched: true, evidence: [rule.id] };
  }
  if (rule.requiresQuizProbe && input.probeKind !== 'quiz') {
    return { matched: false, evidence: [] };
  }
  const corpus = fieldText(input, rule.field);
  const hits = countPatternHits(corpus, rule.patterns);
  const need = rule.minHits ?? 1;
  if (hits >= need) {
    return { matched: true, evidence: [`${rule.id}:${hits}`] };
  }
  return { matched: false, evidence: [] };
}

export function classifyWithRules(
  input: ClassifierStage1Input,
  rules: Stage1Rule[] = STAGE1_RULES,
): Classification {
  for (const rule of rules) {
    const { matched, evidence } = ruleMatches(rule, input);
    if (!matched) continue;
    return {
      type: rule.type,
      confidence: rule.baseConfidence,
      evidence,
      stage: 1,
    };
  }
  return {
    type: 'unknown',
    confidence: 0.2,
    evidence: ['no-rule-match'],
    stage: 1,
  };
}

export function classifyStage1(input: ClassifierStage1Input): Classification {
  return classifyWithRules(input);
}

export function isCodingType(type: QuestionType): boolean {
  return (
    type === 'complete_program' ||
    type === 'fill_in_blank' ||
    type === 'debugging' ||
    type === 'unknown'
  );
}

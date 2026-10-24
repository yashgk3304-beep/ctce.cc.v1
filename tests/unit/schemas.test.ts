import { describe, expect, it } from 'vitest';
import {
  parseJsonLoose,
  validateClassification,
  validateCodeAnswer,
  validateMcqAnswer,
} from '../../src/shared/schemas';

describe('schema validation', () => {
  it('rejects classification with extra keys', () => {
    const raw = { type: 'quiz', confidence: 0.5, evidence: [], extra: true };
    expect(validateClassification(raw).success).toBe(false);
  });

  it('rejects invalid confidence', () => {
    expect(validateClassification({ type: 'quiz', confidence: 2, evidence: [] }).success).toBe(false);
  });

  it('accepts valid code answer', () => {
    const raw = {
      type: 'fill_in_blank',
      final_code: 'int main(){return 0;}',
      edits: [],
      bugs: [],
      explanation: [],
      assumptions: [],
      confidence: 0.9,
    };
    expect(validateCodeAnswer(raw).success).toBe(true);
  });

  it('rejects code answer missing fields', () => {
    expect(validateCodeAnswer({ type: 'debugging' }).success).toBe(false);
  });

  it('parseJsonLoose strips fences', () => {
    const obj = parseJsonLoose('```json\n{"type":"unknown","confidence":0.1,"evidence":[]}\n```');
    expect(validateClassification(obj).success).toBe(true);
  });

  it('mcq malformed selected type', () => {
    expect(
      validateMcqAnswer({
        selected: 'not-array',
        options: [],
        needs_code_run: false,
        code_to_run: null,
        needs_user_decision: false,
        confidence: 0.5,
      }).success,
    ).toBe(false);
  });
});

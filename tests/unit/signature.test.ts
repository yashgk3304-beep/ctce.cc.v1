import { describe, expect, it } from 'vitest';
import { buildSignature, normalizeStatement } from '../../src/content/signature';
import type { EditorData, QuestionData, SamplesData } from '../../src/shared/types';

const question: QuestionData = {
  heading: 'Sum',
  statement: 'Add two numbers',
  constraints: '',
  inputFormat: '',
  outputFormat: '',
};

const samples: SamplesData = { status: 'ok', tests: [{ id: '1', input: '10 5', expected: '15' }] };

const editor: EditorData = {
  engine: 'monaco',
  fileName: 'main.c',
  text: 'int main(){}',
  visibleLineStart: 1,
  visibleLineEnd: 3,
  partial: false,
  source: 'dom',
};

describe('buildSignature', () => {
  it('timer ticks do not change signature', async () => {
    const q1 = { ...question, heading: 'Sum 07:54' };
    const q2 = { ...question, heading: 'Sum 07:12' };
    const s1 = await buildSignature(q1, samples, editor);
    const s2 = await buildSignature(q2, samples, editor);
    expect(s1).toBe(s2);
  });

  it('normalizeStatement strips timer from statement', () => {
    const n = normalizeStatement({ ...question, statement: 'Work fast 1:02:03 now' });
    expect(n).not.toMatch(/1:02:03/);
  });

  it('different editor changes signature', async () => {
    const a = await buildSignature(question, samples, editor);
    const b = await buildSignature(question, samples, { ...editor, text: 'int main(){ return 1; }' });
    expect(a).not.toBe(b);
  });
});

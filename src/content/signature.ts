import { signatureFromParts } from '../shared/hash';
import { mapWhitespaceGlyphs, normalizeText, stripTimerNoise } from '../shared/normalize';
import type { EditorData, QuestionData, SamplesData } from '../shared/types';

export function serializeSamples(samples: SamplesData): string {
  return samples.tests
    .map((t) => `IN:${t.input}\nOUT:${t.expected}`)
    .join('\n---\n');
}

export function normalizeStatement(question: QuestionData): string {
  const parts = [
    question.heading,
    question.statement,
    question.constraints,
    question.inputFormat,
    question.outputFormat,
  ]
    .map((p) => stripTimerNoise(normalizeText(p)))
    .filter(Boolean);
  return parts.join('\n\n');
}

export function normalizeEditorForSignature(editor: EditorData): string {
  return stripTimerNoise(mapWhitespaceGlyphs(normalizeText(editor.text)));
}

/** Stable hash input: statement + samples + editor; timer/help already stripped from statement. */
export async function buildSignature(
  question: QuestionData,
  samples: SamplesData,
  editor: EditorData,
): Promise<string> {
  const statement = normalizeStatement(question);
  const sampleBlock = serializeSamples(samples);
  const editorBlock = normalizeEditorForSignature(editor);
  return signatureFromParts(statement, sampleBlock, editorBlock);
}

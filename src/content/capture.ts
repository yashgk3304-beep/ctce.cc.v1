import { pageProbe } from './probe';
import { extractQuestion } from './extractors/question';
import { extractSamples } from './extractors/samples';
import { extractEditor } from './extractors/editor';
import { buildSignature } from './signature';
import type { PageSnapshot } from '../shared/types';

export async function captureSnapshot(tabId: number, frameId: number, doc: Document): Promise<PageSnapshot> {
  const probe = pageProbe(doc);
  const question = extractQuestion(doc);
  const samples = extractSamples(doc);
  const editor = extractEditor(doc);
  const signature = await buildSignature(
    question.value ?? { heading: '', statement: '', constraints: '', inputFormat: '', outputFormat: '' },
    samples.value ?? { status: 'missing', tests: [] },
    editor.value ?? {
      engine: 'unknown',
      fileName: '',
      text: '',
      visibleLineStart: 1,
      visibleLineEnd: 1,
      partial: false,
      source: 'dom',
    },
  );
  return {
    tabId,
    frameId,
    probe,
    question,
    samples,
    editor,
    signature,
    capturedAt: Date.now(),
  };
}

import { pageProbe } from './probe';
import { extractQuestion } from './extractors/question';
import { extractSamples } from './extractors/samples';
import { extractEditor } from './extractors/editor';
import { buildSignature } from './signature';
import type { CaptureTiming, PageSnapshot } from '../shared/types';
import { logStageTiming } from '../shared/timing';

export async function captureSnapshot(
  tabId: number,
  frameId: number,
  doc: Document,
  debugTimings = false,
): Promise<PageSnapshot> {
  const captureStarted = performance.now();
  let stageStarted = performance.now();
  const probe = pageProbe(doc);
  const probeMs = performance.now() - stageStarted;
  logStageTiming(debugTimings, 'browser_page_probe', stageStarted, { pageKind: probe.kind });
  stageStarted = performance.now();
  const question = extractQuestion(doc);
  const questionExtractionMs = performance.now() - stageStarted;
  logStageTiming(debugTimings, 'browser_question_extraction', stageStarted);
  stageStarted = performance.now();
  const samples = extractSamples(doc);
  const sampleExtractionMs = performance.now() - stageStarted;
  logStageTiming(debugTimings, 'browser_sample_extraction', stageStarted);
  stageStarted = performance.now();
  const editor = extractEditor(doc);
  const editorExtractionMs = performance.now() - stageStarted;
  logStageTiming(debugTimings, 'browser_editor_extraction', stageStarted);
  stageStarted = performance.now();
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
  const signatureMs = performance.now() - stageStarted;
  logStageTiming(debugTimings, 'snapshot_signature', stageStarted);
  const captureTiming: CaptureTiming = {
    probeMs,
    questionExtractionMs,
    sampleExtractionMs,
    editorExtractionMs,
    mainWorldEditorMs: 0,
    signatureMs,
    totalMs: performance.now() - captureStarted,
  };
  const snapshot = {
    tabId,
    frameId,
    probe,
    question,
    samples,
    editor,
    signature,
    capturedAt: Date.now(),
    captureTiming,
  };
  logStageTiming(debugTimings, 'browser_capture_total', captureStarted, {
    pageKind: probe.kind,
    questionFound: question.ok,
    samplesFound: samples.ok,
    editorFound: editor.ok,
  });
  return snapshot;
}

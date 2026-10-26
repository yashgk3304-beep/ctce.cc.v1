import type { CodeAnswer, Settings } from '../shared/types';
import type { SuggestionPayload } from '../shared/messages';
import {
  runEditorTask,
  type EditorCandidateReport,
  type EditorTaskRequest,
  type EditorTaskResult,
} from '../injected/editorTask';
import { loadSettings, saveSettings } from './settingsStore';

interface FrameCandidate extends EditorCandidateReport {
  frameId: number;
}

interface FrameScan {
  frameId: number;
  host: string;
  candidates: EditorCandidateReport[];
  error?: string;
}

interface SavedWrite {
  frameId: number;
  selector: string;
  host: string;
  previousText: string;
}

const WRITE_PREFIX = 'ctc_last_write_tab_';
const STRATEGY_PREFIX = 'ctc_last_writer_strategy_tab_';

async function scanFrames(tabId: number): Promise<FrameScan[]> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: runEditorTask,
      args: [{ action: 'scan' } satisfies EditorTaskRequest],
    });
    return results.map((item) => ({
      frameId: item.frameId,
      host: item.result?.host ?? '',
      candidates: item.result?.candidates ?? [],
      error: item.result?.error,
    }));
  } catch (error) {
    return [{ frameId: 0, host: '', candidates: [], error: safeMessage(error) }];
  }
}

function flattenCandidates(scans: FrameScan[]): FrameCandidate[] {
  return scans.flatMap((frame) => frame.candidates.map((candidate) => ({
    ...candidate,
    frameId: frame.frameId,
  })));
}

function chooseCandidate(
  candidates: FrameCandidate[],
  pageHost: string,
  savedSelector?: string,
): { candidate?: FrameCandidate; reason: string } {
  const saved = savedSelector
    ? candidates.find((candidate) => candidate.selector === savedSelector)
    : undefined;
  if (saved) return { candidate: saved, reason: `remembered selector for ${pageHost}` };
  const focused = candidates.filter((candidate) => candidate.focused);
  if (focused.length === 1) return { candidate: focused[0], reason: 'only focused editor candidate' };
  const largest = [...candidates].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (largest) return { candidate: largest, reason: 'largest visible editor candidate' };
  return { reason: 'no eligible visible editor candidate' };
}

async function executeInFrame(
  tabId: number,
  frameId: number,
  request: EditorTaskRequest,
): Promise<EditorTaskResult> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    world: 'MAIN',
    func: runEditorTask,
    args: [request],
  });
  if (!result?.result) throw new Error('The selected page frame returned no editor result.');
  return result.result;
}

export async function writeSuggestionToEditor(
  tabId: number,
  pageHost: string,
  suggestion: SuggestionPayload,
  settings: Settings,
): Promise<EditorTaskResult & { needsPick?: boolean; restoreAvailable?: boolean }> {
  if (suggestion.classification.type === 'quiz' || suggestion.classification.type === 'unknown') {
    return { ok: false, action: 'write', host: pageHost, error: 'This question type is not eligible for writing.' };
  }
  if (!suggestion.answer || !('final_code' in suggestion.answer)) {
    return { ok: false, action: 'write', host: pageHost, error: 'There is no complete code answer to write.' };
  }
  const scans = await scanFrames(tabId);
  const candidates = flattenCandidates(scans);
  const savedSelector = settings.editorSelectorsByHost[pageHost];
  const choice = chooseCandidate(candidates, pageHost, savedSelector);
  if (!choice.candidate) {
    return { ok: false, action: 'write', host: pageHost, candidates: [], error: 'No visible, eligible editor was found. Use Diagnose editor for details.' };
  }
  const uniqueFocused = candidates.filter((candidate) => candidate.focused).length === 1;
  if (candidates.length > 1 && !savedSelector && !uniqueFocused) {
    return {
      ok: false,
      action: 'write',
      host: pageHost,
      candidates: candidates.map(({ frameId: _frameId, ...candidate }) => candidate),
      chosenSelector: choice.candidate.selector,
      chosenReason: choice.reason,
      needsPick: true,
      error: 'More than one editor is visible. Choose Pick code box before writing.',
    };
  }
  const answer = suggestion.answer as CodeAnswer;
  const result = await executeInFrame(tabId, choice.candidate.frameId, {
    action: 'write',
    selector: choice.candidate.selector,
    answerType: answer.type,
    code: answer.final_code,
    blanks: answer.blanks,
    edits: answer.edits,
    mode: settings.writeMode,
    typingAnimation: settings.typingAnimation,
    typingCharsPerSecond: settings.typingCharsPerSecond,
  });
  const restoreAvailable = result.previousText !== undefined;
  if (restoreAvailable) {
    const savedWrite: SavedWrite = {
      frameId: choice.candidate.frameId,
      selector: choice.candidate.selector,
      host: pageHost,
      previousText: result.previousText ?? '',
    };
    await chrome.storage.session.set({ [`${WRITE_PREFIX}${tabId}`]: savedWrite });
  }
  if (result.strategy) await chrome.storage.session.set({ [`${STRATEGY_PREFIX}${tabId}`]: result.strategy });
  return { ...result, chosenReason: choice.reason, previousText: undefined, restoreAvailable };
}

export async function restorePreviousWrite(tabId: number): Promise<EditorTaskResult> {
  const key = `${WRITE_PREFIX}${tabId}`;
  const stored = await chrome.storage.session.get(key);
  const last = stored[key] as SavedWrite | undefined;
  if (!last) return { ok: false, action: 'restore', host: '', error: 'There is no previous extension write to restore.' };
  const result = await executeInFrame(tabId, last.frameId, {
    action: 'restore',
    selector: last.selector,
    code: last.previousText,
    mode: 'replace',
  });
  if (result.ok) {
    await chrome.storage.session.remove(key);
    if (result.strategy) await chrome.storage.session.set({ [`${STRATEGY_PREFIX}${tabId}`]: result.strategy });
  }
  return result;
}

export async function diagnoseEditor(tabId: number, pageHost: string): Promise<string> {
  const scans = await scanFrames(tabId);
  const candidates = flattenCandidates(scans);
  const settings = await loadSettings();
  const savedSelector = settings.editorSelectorsByHost[pageHost];
  const choice = chooseCandidate(candidates, pageHost, savedSelector);
  const session = await chrome.storage.session.get(`${STRATEGY_PREFIX}${tabId}`);
  const report = {
    pageHost,
    frames: scans.map((frame) => ({
      frameId: frame.frameId,
      host: frame.host,
      candidateCount: frame.candidates.length,
      candidates: frame.candidates,
      ...(frame.error ? { error: frame.error } : {}),
    })),
    chosen: choice.candidate
      ? {
          frameId: choice.candidate.frameId,
          selector: choice.candidate.selector,
          reason: savedSelector && choice.candidate.selector === savedSelector ? 'remembered selector' : choice.reason,
        }
      : null,
    lastSuccessfulStrategy: session[`${STRATEGY_PREFIX}${tabId}`] ?? null,
  };
  return JSON.stringify(report, null, 2);
}

export async function beginEditorPickMode(tabId: number, pageHost: string): Promise<{ ok: boolean; error?: string }> {
  const scans = await scanFrames(tabId);
  const frames = scans.filter((frame) => frame.candidates.length > 0);
  if (frames.length === 0) return { ok: false, error: 'No editor candidates were found to choose from.' };
  for (const frame of frames) {
    try {
      await chrome.tabs.sendMessage(
        tabId,
        {
          type: 'EDITOR_PICK_MODE',
          payload: { selectors: frame.candidates.map((candidate) => candidate.selector), pageHost },
        },
        { frameId: frame.frameId },
      );
    } catch {
      // A frame may have navigated since the scan; other frames can still be picked.
    }
  }
  return { ok: true };
}

export async function savePickedEditor(
  tabId: number,
  pageHost: string,
  selector: string,
  frameId: number,
): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({
    editorSelectorsByHost: { ...settings.editorSelectorsByHost, [pageHost]: selector },
  });
  const frames = await scanFrames(tabId);
  await Promise.all(frames.map(async (frame) => {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'EDITOR_PICKED',
        payload: { selector, pageHost, frameId },
      }, { frameId: frame.frameId });
    } catch {
      // Persisting the picker choice is enough if a frame navigated.
    }
  }));
}

export async function cancelEditorPickMode(tabId: number): Promise<void> {
  const frames = await scanFrames(tabId);
  await Promise.all(frames.map(async (frame) => {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PICK_EDITOR_CANCEL', payload: {} }, { frameId: frame.frameId });
    } catch {
      // A navigated frame has no picker listeners left.
    }
  }));
}

export async function selectMcqAnswers(tabId: number, optionIds: string[]): Promise<EditorTaskResult> {
  const scans = await scanFrames(tabId);
  // MCQ controls are often in a separate frame from the editor; inspect every frame.
  const frames = scans;
  if (frames.length === 0) return { ok: false, action: 'select-mcq', host: '', error: 'No question frame was available for option matching.' };
  const results = await Promise.all(frames.map(async (frame) => {
    try {
      return await executeInFrame(tabId, frame.frameId, { action: 'select-mcq', optionIds });
    } catch (error) {
      return { ok: false, action: 'select-mcq', host: frame.host, error: safeMessage(error) } as EditorTaskResult;
    }
  }));
  const selectedIds = [...new Set(results.flatMap((result) => result.selectedIds ?? []))];
  const uniqueWanted = [...new Set(optionIds.map((id) => id.trim().toUpperCase()).filter(Boolean))];
  return {
    ok: uniqueWanted.every((id) => selectedIds.includes(id)),
    action: 'select-mcq',
    host: scans[0]?.host ?? '',
    selectedIds,
    error: uniqueWanted.every((id) => selectedIds.includes(id))
      ? undefined
      : `Selected ${selectedIds.length} of ${uniqueWanted.length} proposed answer(s). No submission was made.`,
  };
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
}

/**
 * Content script: visible-page probe, extraction, reporting, picker, and top-frame panel.
 * Page edits are issued only after a trusted user click on an extension-panel action.
 */
import type { Envelope, SuggestionPayload } from '../shared/messages';
import type { PageSnapshot, PanelState, Settings } from '../shared/types';
import { captureSnapshot } from './capture';
import { startChangeTracker } from './changeTracker';
import { buildPageStructureReport } from './diagnostics';
import { mountPanel, type PanelApi, type PanelOperationResult } from './panel/mount';
import { pageProbe } from './probe';
import { redactObjectDeep } from '../shared/redact';

const isTop = window === window.top;
let panel: PanelApi | null = null;
let lastSnapshotSignature = '';
let lastEditorText = '';
let approved = false;
let muted = false;
let keepAlivePort: chrome.runtime.Port | null = null;
let disposeTracker: (() => void) | null = null;
let publicSettings: Omit<Settings, 'geminiApiKey'> & { geminiApiKey: ''; hasApiKey?: boolean } | null =
  null;
let lastSuggestion: SuggestionPayload | null = null;
let latestTrackedSnapshot: PageSnapshot | null = null;
let quizInert = pageProbe(document).kind === 'quiz';
let editorPickCleanup: (() => void) | null = null;

function send(type: Envelope['type'], payload: unknown) {
  if (quizInert) return;
  try {
    void chrome.runtime.sendMessage({ type, payload }).catch(() => showInvalidated());
  } catch {
    showInvalidated();
  }
}

function showInvalidated() {
  disposeTracker?.();
  panel?.setBanner('Reload this page');
  panel?.setState('Error', 'Reload this page');
}

function clearEditorPicker() {
  editorPickCleanup?.();
  editorPickCleanup = null;
}

function startEditorPicker(selectors: string[]) {
  clearEditorPicker();
  const outlines = new Map<HTMLElement, { outline: string; outlineOffset: string }>();
  for (const selector of selectors) {
    try {
      for (const node of document.querySelectorAll<HTMLElement>(selector)) {
        outlines.set(node, { outline: node.style.outline, outlineOffset: node.style.outlineOffset });
        node.style.outline = '3px solid #ff9800';
        node.style.outlineOffset = '2px';
      }
    } catch {
      // A selector may have become invalid after a page re-render.
    }
  }
  const onClick = (event: MouseEvent) => {
    if (!event.isTrusted) return;
    const path = event.composedPath().filter((item): item is Element => item instanceof Element);
    for (const target of path) {
      let matchedSelector: string | undefined;
      for (const selector of selectors) {
        try {
          if (target.matches(selector)) {
            matchedSelector = selector;
            break;
          }
        } catch {
          // Ignore an invalid selector produced before a page re-render.
        }
      }
      if (!matchedSelector) continue;
      clearEditorPicker();
      send('EDITOR_PICKED', { selector: matchedSelector, pageHost: window.location.hostname });
      return;
    }
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    clearEditorPicker();
    send('CANCEL_EDITOR_PICK', {});
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown, true);
  editorPickCleanup = () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeydown, true);
    for (const [node, previous] of outlines) {
      node.style.outline = previous.outline;
      node.style.outlineOffset = previous.outlineOffset;
    }
  };
}

function ensurePanel() {
  if (!isTop || panel) return;
  panel = mountPanel(
    document,
    {
      onResuggest: () => send('REQUEST_SUGGEST', { snapshot: undefined }),
      onStronger: () => send('REQUEST_SUGGEST', { stronger: true }),
      onVerify: () => send('VERIFY_CODE', verifyPayload()),
      onApprove: () => {
        approved = true;
        send('APPROVE', { signature: lastSnapshotSignature });
      },
      onCopy: (text) => {
        void navigator.clipboard.writeText(text).then(() => {
          panel?.setOperationStatus('Copied.', true);
        }).catch(() => {
          panel?.setOperationStatus('Clipboard access was unavailable. Select and copy the text manually.', false);
        });
      },
      onShowPayload: () => {
        panel?.setBanner(JSON.stringify(lastSuggestion?.redactedPayloadPreview ?? {}, null, 2).slice(0, 4000));
      },
      onReport: () => send('REPORT_PROBLEM', { report: buildPageStructureReport(document) }),
      onMute: () => {
        muted = true;
        send('MUTE_PAGE', { signature: lastSnapshotSignature });
        panel?.setState('Idle', 'Muted for this page');
      },
      onCheckMyCode: () => send('CHECK_MY_CODE', verifyPayload(lastEditorText)),
      onTypePick: (t) => send('TYPE_PICK', { signature: lastSnapshotSignature, type: t }),
      onNotQuiz: () => send('NOT_QUIZ', { signature: lastSnapshotSignature }),
      onRunAnyway: () => send('VERIFY_CODE', { ...verifyPayload(), allowFileIo: true }),
      onPosition: (pos) => send('SET_SETTINGS', { panelPosition: pos }),
      onWrite: async (suggestion): Promise<PanelOperationResult> => {
        const result = await chrome.runtime.sendMessage({
          type: 'WRITE_ANSWER',
          payload: { signature: suggestion.signature, suggestion },
        }) as PanelOperationResult;
        return result;
      },
      onRestore: async (): Promise<PanelOperationResult> => await chrome.runtime.sendMessage({
        type: 'RESTORE_WRITE', payload: {},
      }) as PanelOperationResult,
      onDiagnoseEditor: async (): Promise<PanelOperationResult> => await chrome.runtime.sendMessage({
        type: 'DIAGNOSE_EDITOR', payload: {},
      }) as PanelOperationResult,
      onPickEditor: async (): Promise<PanelOperationResult> => await chrome.runtime.sendMessage({
        type: 'PICK_EDITOR', payload: {},
      }) as PanelOperationResult,
      onSelectMcq: async (suggestion): Promise<PanelOperationResult> => {
        const answer = suggestion.answer && 'options' in suggestion.answer ? suggestion.answer : null;
        return await chrome.runtime.sendMessage({
          type: 'SELECT_MCQ_ANSWERS',
          payload: {
            signature: suggestion.signature,
            type: suggestion.classification.type,
            optionIds: answer?.selected ?? [],
          },
        }) as PanelOperationResult;
      },
      onReadScreen: () => {
        const snapshot = latestTrackedSnapshot;
        if (!snapshot) throw new Error('No visible page snapshot is available.');
        return redactObjectDeep({
          question: snapshot.question.value?.statement.slice(0, 8_000) ?? '',
          constraints: snapshot.question.value?.constraints.slice(0, 2_000) ?? '',
          visibleEditor: snapshot.editor.value?.text.slice(0, 12_000) ?? '',
          visibleSamples: (snapshot.samples.value?.tests ?? []).slice(0, 8).map((test) => ({
            input: test.input.slice(0, 1_000),
            expected: test.expected.slice(0, 1_000),
          })),
        });
      },
      onAsk: async (question, screenContext): Promise<PanelOperationResult> => await chrome.runtime.sendMessage({
        type: 'ASK_ANYTHING',
        payload: { question, ...(screenContext === undefined ? {} : { includeScreen: true, screenContext }) },
      }) as PanelOperationResult,
    },
    {
      autoExpand: publicSettings?.autoExpand ?? true,
      hintFirst: publicSettings?.hintFirst ?? false,
      theme: publicSettings?.theme ?? 'system',
      panelPosition: publicSettings?.panelPosition ?? null,
    },
  );
}

function verifyPayload(code?: string) {
  const tests = lastSuggestion
    ? ((lastSuggestion.redactedPayloadPreview as { samples?: { tests?: unknown } })?.samples?.tests ?? [])
    : [];
  const fromAnswer =
    lastSuggestion?.answer && 'final_code' in lastSuggestion.answer
      ? lastSuggestion.answer.final_code
      : '';
  return { code: code ?? fromAnswer, tests };
}

async function reportFrame(knownSnapshot?: PageSnapshot) {
  if (quizInert) return;
  const snapshot = knownSnapshot ?? await captureSnapshot(0, 0, document, publicSettings?.logging ?? false);
  const probe = snapshot.probe;
  if (probe.kind === 'quiz') {
    // Cancel any active suggestion before making this frame inert. No page data
    // is sent in this cancellation message.
    send('ABORT', { signature: lastSnapshotSignature });
    quizInert = true;
    disposeTracker?.();
    stopKeepAlive();
    panel?.destroy();
    panel = null;
    return;
  }
  if (muted) return;
  if (!chrome.runtime?.id) {
    showInvalidated();
    return;
  }
  if (probe.kind === 'other' && probe.confidence < 0.4) {
    if (isTop) {
      ensurePanel();
      panel?.setState('Idle', "Couldn't read this page reliably");
    }
  }
  lastSnapshotSignature = snapshot.signature;
  lastEditorText = snapshot.editor.value?.text ?? '';
  if (approved && panel) panel.setCompare(lastEditorText);

  send('FRAME_REPORT', { snapshot });

  if (!isTop) return;
  ensurePanel();
  if (probe.kind !== 'coding') {
    panel?.setState('Idle', 'Not sure this is a coding page');
    return;
  }
  if (snapshot.samples.value?.status === 'collapsed') {
    panel?.setState('WaitingForSamples', 'Expand Sample Test Cases on the page (we will not click it).');
  } else if (snapshot.editor.value?.partial) {
    panel?.setBanner('Scroll the editor to the top so line 1 is visible.');
    panel?.setState('Reading');
  } else {
    panel?.setState('Reading');
    panel?.setBanner('');
  }
}

function startKeepAlive() {
  try {
    keepAlivePort?.disconnect();
  } catch {
    /* ignore */
  }
  try {
    keepAlivePort = chrome.runtime.connect({ name: 'keepalive' });
  } catch {
    showInvalidated();
  }
}

function stopKeepAlive() {
  try {
    keepAlivePort?.disconnect();
  } catch {
    /* ignore */
  }
  keepAlivePort = null;
}

if (!quizInert) chrome.runtime.onMessage.addListener((message: Envelope, _sender, sendResponse) => {
  if (quizInert) {
    sendResponse({ ok: false });
    return;
  }
  if (message.type === 'TOGGLE_PANEL' && isTop) {
    ensurePanel();
    panel?.toggle();
    sendResponse({ ok: true });
    return;
  }
  if (message.type === 'EDITOR_PICK_MODE') {
    const payload = message.payload as { selectors?: string[] };
    startEditorPicker(Array.isArray(payload.selectors) ? payload.selectors : []);
    sendResponse({ ok: true });
    return;
  }
  if (message.type === 'PICK_EDITOR_CANCEL') {
    clearEditorPicker();
    if (isTop) panel?.setOperationStatus('Editor picking canceled.');
    sendResponse({ ok: true });
    return;
  }
  if (message.type === 'EDITOR_PICKED') {
    clearEditorPicker();
    if (isTop) panel?.setOperationStatus('Editor choice saved for this hostname.');
    sendResponse({ ok: true });
    return;
  }
  if (message.type === 'DIAGNOSTICS_REPORT') {
    sendResponse({
      ok: true,
      report: JSON.stringify(buildPageStructureReport(document), null, 2),
    });
    return;
  }
  if (message.type === 'PIPELINE_STATUS' && isTop) {
    const p = message.payload as { state: PanelState; error?: string };
    ensurePanel();
    panel?.setState(p.state, p.error);
    if (p.state === 'Thinking') startKeepAlive();
    if (p.state === 'Ready' || p.state === 'Error' || p.state === 'Stale') stopKeepAlive();
    sendResponse({ ok: true });
    return;
  }
  if (message.type === 'SUGGESTION' && isTop) {
    ensurePanel();
    lastSuggestion = message.payload as SuggestionPayload;
    panel?.setSuggestion(lastSuggestion);
    panel?.setState(
      lastSuggestion.badge.kind === 'STALE'
        ? 'Stale'
        : lastSuggestion.badge.kind === 'NEEDS_YOUR_DECISION'
          ? 'NeedsDecision'
          : 'Ready',
    );
    stopKeepAlive();
    sendResponse({ ok: true });
    return;
  }
  sendResponse({ ok: true });
});

if (!quizInert) void chrome.runtime
  .sendMessage({ type: 'GET_SETTINGS', payload: {} })
  .then((res: { settings?: typeof publicSettings }) => {
    publicSettings = res?.settings ?? null;
    disposeTracker = startChangeTracker(document, async () => {
      latestTrackedSnapshot = await captureSnapshot(
        0,
        0,
        document,
        publicSettings?.logging ?? false,
      );
      return latestTrackedSnapshot.signature;
    }, (sig) => {
      if (sig !== lastSnapshotSignature && lastSuggestion) {
        panel?.setState('Stale', 'Page changed — previous suggestion is STALE.');
      }
      const snapshot = latestTrackedSnapshot?.signature === sig ? latestTrackedSnapshot : undefined;
      void reportFrame(snapshot);
    });
  })
  .catch(() => {
    showInvalidated();
  });

if (!quizInert) {
  setInterval(() => {
    if (!chrome.runtime?.id) showInvalidated();
  }, 4000);
}

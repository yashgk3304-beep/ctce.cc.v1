/**
 * Content script: read-only probe, extract, report, panel (top frame).
 * Never types, clicks, or patches the page.
 */
import type { Envelope, SuggestionPayload } from '../shared/messages';
import type { PanelState, Settings } from '../shared/types';
import { captureSnapshot } from './capture';
import { startChangeTracker } from './changeTracker';
import { buildPageStructureReport } from './diagnostics';
import { mountPanel, type PanelApi } from './panel/mount';
import { pageProbe } from './probe';

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

function send(type: Envelope['type'], payload: unknown) {
  try {
    void chrome.runtime.sendMessage({ type, payload });
  } catch {
    showInvalidated();
  }
}

function showInvalidated() {
  disposeTracker?.();
  panel?.setBanner('Reload this page');
  panel?.setState('Error', 'Reload this page');
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
        void navigator.clipboard.writeText(text);
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

async function reportFrame() {
  if (muted) return;
  if (!chrome.runtime?.id) {
    showInvalidated();
    return;
  }
  const probe = pageProbe(document);
  if (probe.kind === 'other' && probe.confidence < 0.4) {
    if (isTop) {
      ensurePanel();
      panel?.setState('Idle', "Couldn't read this page reliably");
    }
  }
  const snapshot = await captureSnapshot(0, 0, document);
  lastSnapshotSignature = snapshot.signature;
  lastEditorText = snapshot.editor.value?.text ?? '';
  if (approved && panel) panel.setCompare(lastEditorText);

  send('FRAME_REPORT', { snapshot });

  if (!isTop) return;
  ensurePanel();
  if (probe.kind === 'quiz') {
    panel?.setState('QuizIgnored', 'Quiz detected, assistant is off');
    return;
  }
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

chrome.runtime.onMessage.addListener((message: Envelope, _sender, sendResponse) => {
  if (message.type === 'TOGGLE_PANEL' && isTop) {
    ensurePanel();
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

void chrome.runtime
  .sendMessage({ type: 'GET_SETTINGS', payload: {} })
  .then((res: { settings?: typeof publicSettings }) => {
    publicSettings = res?.settings ?? null;
    disposeTracker = startChangeTracker(document, async () => {
      const snap = await captureSnapshot(0, 0, document);
      return snap.signature;
    }, (sig) => {
      if (sig !== lastSnapshotSignature && lastSuggestion) {
        panel?.setState('Stale', 'Page changed — previous suggestion is STALE.');
      }
      void reportFrame();
    });
  })
  .catch(() => {
    showInvalidated();
  });

setInterval(() => {
  if (!chrome.runtime?.id) showInvalidated();
}, 4000);

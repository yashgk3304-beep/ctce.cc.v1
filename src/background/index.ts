/**
 * Service worker: message router, Gemini, queue, cache, helper client.
 * API key never leaves this worker toward content scripts.
 */
import { isEnvelope, type Envelope } from '../shared/messages';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';
import {
  bumpDailyRequestCount,
  loadSettings,
  publicSettings,
  saveSettings,
} from './settingsStore';
import { SuggestionCache } from './cache';
import { GeminiProvider } from './llm/geminiProvider';
import { pickDefaultModels } from './llm/modelPick';
import { RequestQueue } from './queue';
import { helperHealth, helperVerify } from './helperClient';
import { runPipeline } from './pipeline';
import type { PageSnapshot } from '../shared/types';

const cache = new SuggestionCache();
const queue = new RequestQueue();
const frameBest = new Map<number, { frameId: number; snapshot: PageSnapshot; score: number }>();

function scoreSnapshot(s: PageSnapshot): number {
  let n = s.probe.confidence * 10;
  if (s.editor.ok) n += 5;
  if (s.samples.ok && s.samples.value?.status === 'ok') n += 3;
  if (s.question.ok) n += 2;
  return n;
}

chrome.runtime.onInstalled.addListener(() => {
  void loadSettings();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-panel') return;
  void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId == null) return;
    void chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_PANEL', payload: {} });
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'keepalive') return;
  const tick = setInterval(() => {
    try {
      port.postMessage({ ping: true });
    } catch {
      clearInterval(tick);
    }
  }, 20_000);
  port.onDisconnect.addListener(() => clearInterval(tick));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

async function handleMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (!isEnvelope(message)) return { ok: false, error: 'Invalid message' };
  const msg = message as Envelope;
  const tabId = sender.tab?.id ?? msg.tabId;
  const frameId = sender.frameId ?? msg.frameId ?? 0;

  switch (msg.type) {
    case 'KEEPALIVE':
      return { ok: true };

    case 'GET_SETTINGS': {
      const s = await loadSettings();
      return { ok: true, settings: publicSettings(s), full: s };
    }

    case 'SET_SETTINGS': {
      const payload = msg.payload as Partial<Settings> & { __clearCache?: boolean };
      if (payload.__clearCache) {
        await cache.clear();
        return { ok: true };
      }
      const { __clearCache: _, ...rest } = payload;
      const s = await saveSettings(rest);
      return { ok: true, settings: publicSettings(s) };
    }

    case 'LOAD_MODELS': {
      const s = await loadSettings();
      if (!s.geminiApiKey) return { ok: false, error: 'Add your Gemini key in Options' };
      const provider = new GeminiProvider(s.geminiApiKey);
      const models = await provider.listModels();
      const { fast, strong } = pickDefaultModels(models);
      await saveSettings({
        models,
        fastModel: s.fastModel || fast,
        strongModel: s.strongModel || strong,
      });
      return { ok: true, models, fast: s.fastModel || fast, strong: s.strongModel || strong };
    }

    case 'TEST_HELPER': {
      const s = await loadSettings();
      try {
        const h = await helperHealth(s.helperPort, s.helperToken);
        return { ok: true, ...h };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    case 'FRAME_REPORT': {
      const snapshot = (msg.payload as { snapshot: PageSnapshot }).snapshot;
      if (tabId == null) return { ok: false };
      const score = scoreSnapshot(snapshot);
      const prev = frameBest.get(tabId);
      if (!prev || score >= prev.score || prev.snapshot.signature !== snapshot.signature) {
        if (!prev || score >= prev.score) {
          frameBest.set(tabId, { frameId, snapshot, score });
        }
      }
      // Top frame owns panel; pipeline starts from best frame data
      if (frameId === 0 || score >= (prev?.score ?? 0)) {
        void maybePipeline(tabId, snapshot);
      }
      return { ok: true };
    }

    case 'REQUEST_SUGGEST': {
      if (tabId == null) return { ok: false };
      const snap =
        (msg.payload as { snapshot?: PageSnapshot }).snapshot ??
        frameBest.get(tabId)?.snapshot;
      if (!snap) return { ok: false, error: 'No page snapshot' };
      return queue.enqueue(snap.signature, () => runSuggest(tabId, snap, false));
    }

    case 'VERIFY_CODE':
    case 'CHECK_MY_CODE': {
      const s = await loadSettings();
      const { code, tests } = msg.payload as {
        code: string;
        tests: Array<{ id: string; input: string; expected: string }>;
      };
      try {
        const result = await helperVerify(s.helperPort, s.helperToken, {
          code,
          tests,
          std: s.cStandard,
          timeoutMs: s.testTimeoutMs,
          o2Check: s.o2UbCheck,
        });
        return { ok: true, result };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    case 'DIAGNOSTICS_REPORT': {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const t = tabs[0];
      if (!t?.id) return { ok: false, error: 'No active tab' };
      try {
        const report = await chrome.tabs.sendMessage(t.id, {
          type: 'DIAGNOSTICS_REPORT',
          payload: {},
        });
        return report;
      } catch {
        return { ok: false, error: 'Open a CodeTantra coding tab first.' };
      }
    }

    case 'ABORT': {
      queue.abort((msg.payload as { signature?: string }).signature);
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unhandled ${msg.type}` };
  }
}

async function maybePipeline(tabId: number, snapshot: PageSnapshot) {
  const s = await loadSettings();
  if (!s.consentAccepted || !s.autoSuggest) return;
  if (snapshot.probe.kind === 'quiz') {
    await chrome.tabs.sendMessage(tabId, {
      type: 'PIPELINE_STATUS',
      payload: { state: 'QuizIgnored' },
    });
    return;
  }
  if (snapshot.probe.kind !== 'coding') return;
  void queue.enqueue(snapshot.signature, () => runSuggest(tabId, snapshot, true));
}

async function runSuggest(tabId: number, snapshot: PageSnapshot, fromAuto: boolean) {
  const s = await loadSettings();
  if (!s.geminiApiKey) {
    await chrome.tabs.sendMessage(tabId, {
      type: 'PIPELINE_STATUS',
      payload: {
        state: 'Error',
        error: 'Add your Gemini key in Options',
      },
    });
    return { ok: false };
  }

  const keepAlive = setInterval(() => {
    void chrome.runtime.getPlatformInfo();
  }, 20_000);

  try {
    await bumpDailyRequestCount();
    const result = await runPipeline({
      snapshot,
      settings: s,
      cache,
      stronger: false,
    });
    await chrome.tabs.sendMessage(tabId, {
      type: 'SUGGESTION',
      payload: result,
    });
    return { ok: true, result, fromAuto };
  } catch (e) {
    await chrome.tabs.sendMessage(tabId, {
      type: 'PIPELINE_STATUS',
      payload: { state: 'Error', error: String(e) },
    });
    return { ok: false, error: String(e) };
  } finally {
    clearInterval(keepAlive);
  }
}

// Ensure DEFAULT_SETTINGS referenced for tree-shaking clarity
void DEFAULT_SETTINGS;

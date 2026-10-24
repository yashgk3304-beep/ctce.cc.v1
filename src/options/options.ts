import { DEFAULT_SETTINGS, type Settings } from '../shared/types';
import { HOST_CONFIG } from '../shared/hostConfig';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function getSettings(): Promise<Settings> {
  const res = (await chrome.runtime.sendMessage({
    type: 'GET_SETTINGS',
    payload: {},
  })) as { settings?: Settings };
  return res?.settings ?? { ...DEFAULT_SETTINGS };
}

async function setSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'SET_SETTINGS', payload: patch });
}

function fillModels(select: HTMLSelectElement, models: string[], current: string) {
  select.replaceChildren();
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = models.length ? 'Select…' : 'Load models first';
  select.appendChild(empty);
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === current) opt.selected = true;
    select.appendChild(opt);
  }
}

async function refreshUi() {
  const s = await getSettings();
  const consent = $('consent');
  const main = $('main-options');
  if (!s.consentAccepted) {
    consent.hidden = false;
  } else {
    consent.hidden = true;
  }
  main.style.opacity = s.consentAccepted ? '1' : '0.5';
  ($('api-key') as HTMLInputElement).value = s.geminiApiKey ? '••••••••••••' : '';
  ($('api-key') as HTMLInputElement).dataset.dirty = '';
  fillModels($('fast-model') as HTMLSelectElement, s.models, s.fastModel);
  fillModels($('strong-model') as HTMLSelectElement, s.models, s.strongModel);
  ($('auto-suggest') as HTMLInputElement).checked = s.autoSuggest;
  ($('auto-expand') as HTMLInputElement).checked = s.autoExpand;
  ($('auto-verify') as HTMLInputElement).checked = s.autoVerify;
  ($('hint-first') as HTMLInputElement).checked = s.hintFirst;
  ($('o2-ub') as HTMLInputElement).checked = s.o2UbCheck;
  ($('c-standard') as HTMLInputElement).value = s.cStandard;
  ($('test-timeout') as HTMLInputElement).value = String(s.testTimeoutMs);
  ($('helper-port') as HTMLInputElement).value = String(s.helperPort || HOST_CONFIG.helperPort);
  ($('helper-token') as HTMLInputElement).value = s.helperToken ? '••••••••' : '';
  ($('helper-token') as HTMLInputElement).dataset.dirty = '';
  ($('logging') as HTMLInputElement).checked = s.logging;
  $('daily-count').textContent = String(s.dailyRequestCount);
}

function setStatus(id: string, text: string, ok?: boolean) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('ok', ok === true);
  el.classList.toggle('bad', ok === false);
}

async function init() {
  await refreshUi();

  $('accept-consent').addEventListener('click', async () => {
    await setSettings({ consentAccepted: true });
    await refreshUi();
  });

  ($('api-key') as HTMLInputElement).addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    t.dataset.dirty = '1';
  });

  ($('helper-token') as HTMLInputElement).addEventListener('input', (e) => {
    (e.target as HTMLInputElement).dataset.dirty = '1';
  });

  $('save-key').addEventListener('click', async () => {
    const input = $('api-key') as HTMLInputElement;
    const patch: Partial<Settings> = {};
    if (input.dataset.dirty === '1') {
      patch.geminiApiKey = input.value.trim();
    }
    patch.fastModel = ($('fast-model') as HTMLSelectElement).value;
    patch.strongModel = ($('strong-model') as HTMLSelectElement).value;
    patch.autoSuggest = ($('auto-suggest') as HTMLInputElement).checked;
    patch.autoExpand = ($('auto-expand') as HTMLInputElement).checked;
    patch.autoVerify = ($('auto-verify') as HTMLInputElement).checked;
    patch.hintFirst = ($('hint-first') as HTMLInputElement).checked;
    patch.o2UbCheck = ($('o2-ub') as HTMLInputElement).checked;
    patch.cStandard = ($('c-standard') as HTMLInputElement).value.trim() || 'gnu11';
    patch.testTimeoutMs = Number(($('test-timeout') as HTMLInputElement).value) || 2000;
    patch.helperPort = Number(($('helper-port') as HTMLInputElement).value) || HOST_CONFIG.helperPort;
    const tok = $('helper-token') as HTMLInputElement;
    if (tok.dataset.dirty === '1') patch.helperToken = tok.value.trim();
    patch.logging = ($('logging') as HTMLInputElement).checked;
    await setSettings(patch);
    setStatus('model-status', 'Saved.', true);
    await refreshUi();
  });

  $('load-models').addEventListener('click', async () => {
    setStatus('model-status', 'Loading models…');
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'LOAD_MODELS',
        payload: {},
      })) as { ok?: boolean; error?: string; models?: string[]; fast?: string; strong?: string };
      if (!res?.ok) {
        setStatus('model-status', res?.error ?? 'Failed to load models', false);
        return;
      }
      setStatus(
        'model-status',
        `Loaded ${(res.models ?? []).length} models. Fast=${res.fast} Strong=${res.strong}`,
        true,
      );
      await refreshUi();
    } catch (e) {
      setStatus('model-status', String(e), false);
    }
  });

  $('test-helper').addEventListener('click', async () => {
    await setSettings({
      helperPort: Number(($('helper-port') as HTMLInputElement).value) || HOST_CONFIG.helperPort,
      ...(($('helper-token') as HTMLInputElement).dataset.dirty === '1'
        ? { helperToken: ($('helper-token') as HTMLInputElement).value.trim() }
        : {}),
    });
    setStatus('helper-status', 'Testing…');
    const res = (await chrome.runtime.sendMessage({
      type: 'TEST_HELPER',
      payload: {},
    })) as { ok?: boolean; error?: string; gccVersion?: string };
    if (res?.ok) {
      setStatus('helper-status', `OK — ${res.gccVersion ?? 'gcc'}`, true);
    } else {
      setStatus('helper-status', res?.error ?? 'Helper unreachable', false);
    }
  });

  $('clear-cache').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'SET_SETTINGS', payload: { __clearCache: true } });
    setStatus('model-status', 'Cache cleared.', true);
  });

  $('copy-diag').addEventListener('click', async () => {
    setStatus('diag-status', 'Requesting report from active CodeTantra tab…');
    const res = (await chrome.runtime.sendMessage({
      type: 'DIAGNOSTICS_REPORT',
      payload: {},
    })) as { ok?: boolean; report?: string; error?: string };
    if (!res?.ok || !res.report) {
      setStatus('diag-status', res?.error ?? 'Open a CodeTantra tab first.', false);
      return;
    }
    await navigator.clipboard.writeText(res.report);
    setStatus('diag-status', 'Copied page-structure report to clipboard.', true);
  });

  // Persist behaviour toggles on change
  for (const id of [
    'auto-suggest',
    'auto-expand',
    'auto-verify',
    'hint-first',
    'o2-ub',
    'logging',
  ]) {
    $(id).addEventListener('change', () => {
      void $('save-key').dispatchEvent(new Event('click'));
    });
  }
}

void init();

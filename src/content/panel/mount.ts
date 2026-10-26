/**
 * Shadow-DOM review panel. May listen and write only inside its own shadow root.
 */
import type { PanelState, Settings, VerificationBadge } from '../../shared/types';
import type { SuggestionPayload } from '../../shared/messages';
import { badgeLabel, isLenientMode } from '../../shared/badges';
import { BADGE_COPY } from '../../shared/badges';
import { firstMismatch, likelyTypos } from '../../background/compare';
import { PANEL_CSS } from './styles';
import { renderHighlighted } from './highlight';
import { redactObjectDeep } from '../../shared/redact';

export interface PanelOperationResult {
  ok: boolean;
  error?: string;
  report?: string;
  lineCount?: number;
  restoreAvailable?: boolean;
  answer?: string;
  apiKeySlot?: string;
  selectedIds?: string[];
}

export interface PanelApi {
  setState: (state: PanelState, extra?: string) => void;
  setSuggestion: (s: SuggestionPayload) => void;
  setCompare: (text: string) => void;
  setBanner: (text: string) => void;
  setOperationStatus: (text: string, ok?: boolean) => void;
  setEditorReport: (report: string) => void;
  toggle: () => void;
  destroy: () => void;
  host: HTMLElement;
}

const FORBIDDEN_PHRASES = /\b(correct|safe to submit)\b/i;

export function mountPanel(
  doc: Document,
  handlers: {
    onResuggest: () => void;
    onStronger: () => void;
    onVerify: () => void;
    onApprove: () => void;
    onCopy: (text: string) => void;
    onShowPayload: () => void;
    onReport: () => void;
    onMute: () => void;
    onCheckMyCode: () => void;
    onTypePick: (t: string) => void;
    onNotQuiz: () => void;
    onRunAnyway: () => void;
    onPosition: (pos: { x: number; y: number; w: number; h: number }) => void;
    onWrite: (suggestion: SuggestionPayload) => Promise<PanelOperationResult>;
    onRestore: () => Promise<PanelOperationResult>;
    onDiagnoseEditor: () => Promise<PanelOperationResult>;
    onPickEditor: () => Promise<PanelOperationResult>;
    onSelectMcq: (suggestion: SuggestionPayload) => Promise<PanelOperationResult>;
    onReadScreen: () => unknown;
    onAsk: (question: string, screenContext?: unknown) => Promise<PanelOperationResult>;
  },
  settings: Pick<Settings, 'autoExpand' | 'hintFirst' | 'theme' | 'panelPosition'>,
): PanelApi {
  const existing = doc.getElementById('ctc-assistant-host');
  existing?.remove();

  const host = doc.createElement('div');
  host.id = 'ctc-assistant-host';
  host.style.position = 'fixed';
  host.style.zIndex = '2147483646';
  host.style.right = '16px';
  host.style.bottom = '16px';
  host.style.width = '380px';
  host.style.height = '56px';
  host.setAttribute('data-ctc', 'host');
  doc.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = PANEL_CSS;
  const root = doc.createElement('div');
  root.className = 'ctc-root';
  root.setAttribute('role', 'complementary');
  root.setAttribute('aria-label', 'CT-C Assistant');
  const theme =
    settings.theme === 'system'
      ? matchMediaSafe(doc, '(prefers-color-scheme: dark)')
        ? 'dark'
        : 'light'
      : settings.theme;
  root.dataset.theme = theme;

  const header = el(doc, 'div', 'ctc-header');
  header.setAttribute('role', 'button');
  const pill = el(doc, 'span', 'ctc-pill');
  pill.textContent = 'CT-C: Idle';
  const toggle = btn(doc, 'Show', 'ghost');
  header.append(pill, toggle);

  const body = el(doc, 'div', 'ctc-body');
  body.hidden = true;
  const banner = el(doc, 'div', 'ctc-banner');
  banner.hidden = true;
  const status = el(doc, 'p', 'ctc-muted');
  status.id = 'ctc-status';
  const badgeEl = el(doc, 'span', 'ctc-badge');
  badgeEl.hidden = true;
  const views = el(doc, 'div', '');
  const actions = el(doc, 'div', 'ctc-actions');
  const operationStatus = el(doc, 'p', 'ctc-operation-status');
  operationStatus.setAttribute('role', 'status');
  const utilityActions = el(doc, 'div', 'ctc-actions');
  const bRestore = btn(doc, 'Restore previous', 'ghost');
  const bDiagnose = btn(doc, 'Diagnose editor', 'ghost');
  const bPick = btn(doc, 'Pick code box', 'ghost');
  bRestore.hidden = true;
  utilityActions.append(bRestore, bDiagnose, bPick);
  const editorReport = el(doc, 'details', 'ctc-editor-report');
  const editorReportSummary = el(doc, 'summary', '');
  editorReportSummary.textContent = 'Editor diagnosis';
  const editorReportCopy = btn(doc, 'Copy diagnosis', 'ghost');
  const editorReportPre = el(doc, 'pre', 'ctc-code');
  editorReport.append(editorReportSummary, editorReportCopy, editorReportPre);
  editorReport.hidden = true;
  const askSection = el(doc, 'section', 'ctc-ask');
  const askHeading = el(doc, 'h3', '');
  askHeading.textContent = 'Ask Anything';
  const askInput = doc.createElement('textarea');
  askInput.rows = 3;
  askInput.maxLength = 8000;
  askInput.placeholder = 'Ask a coding or programming question';
  askInput.setAttribute('aria-label', 'Ask Anything question');
  const askButtons = el(doc, 'div', 'ctc-actions');
  const bReadScreen = btn(doc, 'Read screen', 'ghost');
  const bAsk = btn(doc, 'Ask');
  askButtons.append(bReadScreen, bAsk);
  const askPreviewLabel = el(doc, 'p', 'ctc-muted');
  askPreviewLabel.textContent = 'Preview of the message sent:';
  const askPreview = el(doc, 'pre', 'ctc-ask-preview');
  const askAnswer = el(doc, 'div', 'ctc-ask-answer');
  askSection.append(askHeading, askInput, askButtons, askPreviewLabel, askPreview, askAnswer);
  const resize = el(doc, 'div', 'ctc-resize');

  const bResuggest = btn(doc, 'Re-suggest');
  const bStrong = btn(doc, 'Try stronger model', 'ghost');
  const bVerify = btn(doc, 'Verify now', 'ghost');
  const bApprove = btn(doc, 'Approve');
  const bCopy = btn(doc, 'Copy', 'ghost');
  const bPayload = btn(doc, 'Show exactly what was sent to Gemini', 'ghost');
  const bReport = btn(doc, 'Report a problem', 'ghost');
  const bMute = btn(doc, 'Mute for this page', 'ghost');
  const bCheck = btn(doc, 'Check my code', 'ghost');
  const bAnyway = btn(doc, 'Run anyway', 'ghost');
  bAnyway.hidden = true;
  actions.append(bResuggest, bStrong, bVerify, bApprove, bCopy, bCheck, bAnyway, bPayload, bReport, bMute);

  body.append(banner, status, badgeEl, views, actions, operationStatus, utilityActions, editorReport, askSection);
  root.append(header, body, resize);
  shadow.append(style, root);

  let expanded = false;
  let current: SuggestionPayload | null = null;
  let approvedCode = '';
  let lastCode = '';
  let readScreenForMessage = false;
  let screenContextForMessage: unknown;
  let currentPreview = '';
  let currentEditorReport = '';

  const setExpanded = (v: boolean) => {
    expanded = v;
    body.hidden = !v;
    host.style.height = v ? `${settings.panelPosition?.h ?? 420}px` : '56px';
    host.style.width = `${settings.panelPosition?.w ?? 380}px`;
    toggle.textContent = v ? 'Hide' : 'Show';
  };

  if (settings.panelPosition) {
    host.style.left = `${settings.panelPosition.x}px`;
    host.style.top = `${settings.panelPosition.y}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    host.style.width = `${settings.panelPosition.w}px`;
  }

  toggle.addEventListener('click', () => setExpanded(!expanded));

  const stopKeys = (ev: Event) => {
    ev.stopPropagation();
  };
  root.addEventListener('keydown', stopKeys);
  root.addEventListener('keyup', stopKeys);
  root.addEventListener('keypress', stopKeys);
  root.addEventListener('input', stopKeys);
  root.addEventListener('beforeinput', stopKeys);
  root.addEventListener('paste', stopKeys);

  let drag: { dx: number; dy: number } | null = null;
  header.addEventListener('mousedown', (ev) => {
    drag = { dx: ev.clientX - host.getBoundingClientRect().left, dy: ev.clientY - host.getBoundingClientRect().top };
  });
  const onMove = (ev: MouseEvent) => {
    if (!drag) return;
    host.style.left = `${ev.clientX - drag.dx}px`;
    host.style.top = `${ev.clientY - drag.dy}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  };
  const onUp = () => {
    if (drag) {
      persistPos();
    }
    drag = null;
  };
  shadow.addEventListener('mousemove', onMove as EventListener);
  shadow.addEventListener('mouseup', onUp);

  let resizing = false;
  resize.addEventListener('mousedown', () => {
    resizing = true;
  });
  shadow.addEventListener('mousemove', (ev) => {
    const e = ev as MouseEvent;
    if (!resizing) return;
    const r = host.getBoundingClientRect();
    host.style.width = `${Math.max(280, e.clientX - r.left)}px`;
    host.style.height = `${Math.max(120, e.clientY - r.top)}px`;
  });
  shadow.addEventListener('mouseup', () => {
    if (resizing) persistPos();
    resizing = false;
  });

  function persistPos() {
    const r = host.getBoundingClientRect();
    handlers.onPosition({ x: r.left, y: r.top, w: r.width, h: r.height });
  }

  bResuggest.addEventListener('click', () => handlers.onResuggest());
  bStrong.addEventListener('click', () => handlers.onStronger());
  bVerify.addEventListener('click', () => handlers.onVerify());
  bApprove.addEventListener('click', () => {
    if (current?.answer && 'final_code' in current.answer) {
      approvedCode = current.answer.final_code;
    }
    handlers.onApprove();
  });
  bCopy.addEventListener('click', () => handlers.onCopy(lastCode));
  bPayload.addEventListener('click', () => handlers.onShowPayload());
  bReport.addEventListener('click', () => handlers.onReport());
  bMute.addEventListener('click', () => handlers.onMute());
  bCheck.addEventListener('click', () => handlers.onCheckMyCode());
  bAnyway.addEventListener('click', () => handlers.onRunAnyway());
  bRestore.addEventListener('click', async (event) => {
    if (!event.isTrusted) return;
    setOperationStatus('Restoring the previous editor text…');
    try {
      const result = await handlers.onRestore();
      setOperationStatus(result.ok ? `Restored (${result.lineCount ?? 0} lines).` : result.error ?? 'Restore failed.', result.ok);
      if (result.ok) bRestore.hidden = true;
    } catch {
      setOperationStatus('Restore failed. The editor may have changed or navigated.', false);
    }
  });
  bDiagnose.addEventListener('click', async (event) => {
    if (!event.isTrusted) return;
    setOperationStatus('Scanning editor frames…');
    try {
      const result = await handlers.onDiagnoseEditor();
      if (!result.ok || !result.report) {
        setOperationStatus(result.error ?? 'Could not diagnose the editor.', false);
        return;
      }
      setEditorReport(result.report);
      setOperationStatus('Editor diagnosis is ready to copy.', true);
    } catch {
      setOperationStatus('Could not diagnose the editor.', false);
    }
  });
  bPick.addEventListener('click', async (event) => {
    if (!event.isTrusted) return;
    setOperationStatus('Choose the code editor on the page. Press Escape to cancel.');
    try {
      const result = await handlers.onPickEditor();
      if (!result.ok) setOperationStatus(result.error ?? 'No editor candidates were found.', false);
    } catch {
      setOperationStatus('Could not start editor picking.', false);
    }
  });
  editorReportCopy.addEventListener('click', () => handlers.onCopy(currentEditorReport));

  const refreshAskPreview = () => {
    const payload = {
      question: askInput.value.trim(),
      ...(readScreenForMessage ? { screenContext: screenContextForMessage } : {}),
    };
    currentPreview = JSON.stringify(redactObjectDeep(payload), null, 2);
    askPreview.textContent = currentPreview;
  };
  askInput.addEventListener('input', refreshAskPreview);
  bReadScreen.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    try {
      screenContextForMessage = handlers.onReadScreen();
      readScreenForMessage = true;
      refreshAskPreview();
      setOperationStatus('Visible screen context is included in this message preview.', true);
    } catch {
      screenContextForMessage = undefined;
      readScreenForMessage = false;
      setOperationStatus('Could not read the current visible screen.', false);
    }
  });
  bAsk.addEventListener('click', async (event) => {
    if (!event.isTrusted) return;
    const question = askInput.value.trim();
    if (!question) {
      setOperationStatus('Write a question first.', false);
      return;
    }
    bAsk.disabled = true;
    askAnswer.textContent = 'Thinking…';
    try {
      const result = await handlers.onAsk(question, readScreenForMessage ? screenContextForMessage : undefined);
      if (!result.ok) {
        askAnswer.textContent = result.error ?? 'The request failed.';
      } else {
        askAnswer.textContent = `${result.answer ?? ''}${result.apiKeySlot ? `\n\nAnswered using ${slotName(result.apiKeySlot)}.` : ''}`;
      }
    } catch {
      askAnswer.textContent = 'The request failed. Check the API key and try again.';
    } finally {
      bAsk.disabled = false;
      askInput.value = '';
      readScreenForMessage = false;
      screenContextForMessage = undefined;
      refreshAskPreview();
    }
  });
  refreshAskPreview();

  function setState(state: PanelState, extra?: string) {
    pill.textContent = `CT-C: ${labelFor(state)}`;
    status.textContent = extra ?? state;
    if (FORBIDDEN_PHRASES.test(status.textContent)) status.textContent = state;
  }

  function setBanner(text: string) {
    banner.hidden = !text;
    banner.textContent = text;
  }

  function setOperationStatus(text: string, ok?: boolean) {
    operationStatus.textContent = text;
    operationStatus.classList.toggle('ok', ok === true);
    operationStatus.classList.toggle('bad', ok === false);
  }

  function setEditorReport(report: string) {
    editorReport.hidden = false;
    editorReportPre.textContent = report;
    currentEditorReport = report;
  }

  function setSuggestion(s: SuggestionPayload) {
    current = s;
    renderBadge(badgeEl, s.badge);
    views.replaceChildren();
    if (s.cached) {
      const c = el(doc, 'p', 'ctc-muted');
      c.textContent = 'cached';
      views.appendChild(c);
    }
    if (s.badge.kind === 'NEEDS_YOUR_DECISION' && !s.answer) {
      const p = el(doc, 'p', '');
      p.textContent = `Local guess vs model: ${s.classification.type}. Pick a type:`;
      views.appendChild(p);
      for (const t of ['complete_program', 'fill_in_blank', 'debugging', 'mcq_multi', 'mcq_single']) {
        const b = btn(doc, t, 'ghost');
        b.addEventListener('click', () => handlers.onTypePick(t));
        views.appendChild(b);
      }
    }
    const ans = s.answer;
    let codeActionRow: HTMLElement | null = null;
    if (s.apiKeySlot) {
      const slotInfo = el(doc, 'p', 'ctc-muted');
      slotInfo.textContent = `Answered using ${slotName(s.apiKeySlot)}.`;
      views.appendChild(slotInfo);
    }
    if (ans && 'final_code' in ans) {
      lastCode = ans.final_code;
      if (settings.hintFirst) {
        const expl = el(doc, 'div', '');
        for (const line of ans.explanation) {
          const p = el(doc, 'p', '');
          p.textContent = line;
          expl.appendChild(p);
        }
        const reveal = btn(doc, 'Reveal code', 'ghost');
        const pre = el(doc, 'div', 'ctc-code') as HTMLElement;
        pre.hidden = true;
        reveal.addEventListener('click', () => {
          pre.hidden = false;
          if (codeActionRow) codeActionRow.hidden = false;
        });
        views.append(expl, reveal, pre);
        renderHighlighted(pre, ans.final_code, new Set(ans.edits.map((e) => e.line)));
      } else if (ans.type === 'fill_in_blank') {
        const table = doc.createElement('table');
        const head = doc.createElement('tr');
        for (const h of ['Line', 'Where', 'Type this']) {
          const th = doc.createElement('th');
          th.textContent = h;
          head.appendChild(th);
        }
        table.appendChild(head);
        for (const ed of ans.edits) {
          const tr = doc.createElement('tr');
          for (const cell of [String(ed.line), ed.before, ed.after]) {
            const td = doc.createElement('td');
            td.textContent = cell;
            tr.appendChild(td);
          }
          table.appendChild(tr);
        }
        const pre = el(doc, 'div', 'ctc-code');
        renderHighlighted(pre, ans.final_code, new Set(ans.edits.map((e) => e.line)));
        views.append(table, pre);
        for (const line of ans.explanation) {
          const p = el(doc, 'p', '');
          p.textContent = line;
          views.appendChild(p);
        }
      } else if (ans.type === 'debugging') {
        const ul = doc.createElement('ul');
        for (const b of ans.bugs) {
          const li = doc.createElement('li');
          li.textContent = `L${b.line}: ${b.issue} → ${b.fix}`;
          ul.appendChild(li);
        }
        const pre = el(doc, 'div', 'ctc-code');
        renderHighlighted(pre, ans.final_code);
        views.append(ul, pre);
      } else {
        const pre = el(doc, 'div', 'ctc-code');
        renderHighlighted(pre, ans.final_code);
        views.appendChild(pre);
        for (const line of ans.explanation) {
          const p = el(doc, 'p', '');
          p.textContent = line;
          views.appendChild(p);
        }
      }
      bAnyway.hidden = !/file I\/O/i.test(s.badge.kind === 'NEEDS_YOUR_DECISION' ? s.badge.reason : '');
      const writeButtons = el(doc, 'div', 'ctc-actions');
      codeActionRow = writeButtons;
      writeButtons.hidden = settings.hintFirst;
      const write = btn(doc, 'Write to editor');
      const copyAnswer = btn(doc, 'Copy', 'ghost');
      write.addEventListener('click', async (event) => {
        if (!event.isTrusted) return;
        setOperationStatus('Writing to the selected editor…');
        try {
          const result = await handlers.onWrite(s);
          setOperationStatus(result.ok ? `Written (${result.lineCount ?? 0} lines).` : result.error ?? 'The editor rejected the write.', result.ok);
          bRestore.hidden = !result.restoreAvailable;
        } catch {
          setOperationStatus('The write failed. Copy the answer for manual pasting.', false);
        }
      });
      copyAnswer.addEventListener('click', () => handlers.onCopy(ans.final_code));
      writeButtons.append(write, copyAnswer);
      views.appendChild(writeButtons);
    } else if (ans && 'options' in ans) {
      lastCode = ans.code_to_run ?? '';
      const ul = doc.createElement('ul');
      for (const o of ans.options) {
        const li = doc.createElement('li');
        li.textContent = `${o.correct ? '✓' : '✗'} ${o.id}: ${o.reason}`;
        ul.appendChild(li);
      }
      views.appendChild(ul);
      if (ans.selected.length) {
        const select = btn(doc, 'Select answers');
        select.addEventListener('click', async (event) => {
          if (!event.isTrusted) return;
          setOperationStatus('Selecting only the proposed answers…');
          try {
            const result = await handlers.onSelectMcq(s);
            setOperationStatus(result.ok ? `Selected ${result.selectedIds?.join(', ') ?? ans.selected.join(', ')}. No submission was made.` : result.error ?? 'Some proposed answers were not found.', result.ok);
          } catch {
            setOperationStatus('Could not select the proposed answers.', false);
          }
        });
        const copyAnswer = btn(doc, 'Copy', 'ghost');
        copyAnswer.addEventListener('click', () => handlers.onCopy(ans.code_to_run ?? ans.selected.join(', ')));
        const controls = el(doc, 'div', 'ctc-actions');
        controls.append(select, copyAnswer);
        views.appendChild(controls);
      }
    }
    if (s.history.length) {
      const d = doc.createElement('details');
      const sum = doc.createElement('summary');
      sum.textContent = 'Attempt history';
      d.appendChild(sum);
      for (const h of s.history) {
        const p = el(doc, 'p', 'ctc-muted');
        p.textContent = `#${h.attempt} ${h.status} ${h.detail ?? ''}`;
        d.appendChild(p);
      }
      views.appendChild(d);
    }
    if (settings.autoExpand && (s.answer || s.badge.kind === 'NEEDS_YOUR_DECISION')) {
      setExpanded(true);
    }
  }

  function setCompare(editorText: string) {
    if (!approvedCode) return;
    const exp = approvedCode.split('\n');
    const act = editorText.split('\n');
    const mismatch = firstMismatch(exp, act, true);
    const box = el(doc, 'div', 'ctc-banner');
    if (!mismatch) {
      box.textContent = `Compare: ${Math.min(exp.length, act.length)} lines matching.`;
    } else {
      const typos = likelyTypos(editorText);
      box.textContent = `First mismatch line ${mismatch.line} col ${mismatch.column}. Expected «${mismatch.expected}» got «${mismatch.actual}». ${typos.join('; ')}`;
    }
    views.prepend(box);
  }

  function renderBadge(target: HTMLElement, badge: VerificationBadge) {
    target.hidden = false;
    target.textContent = badgeLabel(badge);
    target.title = badge.kind === 'PASSED_VISIBLE_SAMPLES' ? BADGE_COPY.passedTooltip : '';
    target.classList.toggle(
      'warn',
      badge.kind === 'PASSED_VISIBLE_SAMPLES' && isLenientMode(badge.compareMode),
    );
    target.classList.toggle('bad', badge.kind === 'COMPILE_ERROR' || badge.kind === 'PARTIAL');
  }

  return {
    setState,
    setSuggestion,
    setCompare,
    setBanner,
    setOperationStatus,
    setEditorReport,
    toggle: () => setExpanded(!expanded),
    destroy: () => host.remove(),
    host,
  };
}

function el(doc: Document, tag: string, cls: string): HTMLElement {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

function btn(doc: Document, label: string, cls = ''): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (cls) b.className = cls;
  return b;
}

function slotName(slot: string): string {
  return slot === 'backup1' ? 'Backup 1' : slot === 'backup2' ? 'Backup 2' : 'Primary';
}

function labelFor(state: PanelState): string {
  switch (state) {
    case 'Idle':
      return 'Ready';
    case 'Reading':
      return 'Reading';
    case 'WaitingForSamples':
      return 'Waiting for samples';
    case 'Thinking':
      return 'Thinking';
    case 'Verifying':
      return 'Verifying';
    case 'Ready':
      return 'Ready';
    case 'NeedsDecision':
      return 'Needs you';
    case 'Error':
      return 'Error';
    case 'QuizIgnored':
      return 'Quiz off';
    case 'Stale':
      return 'Stale';
    default:
      return state;
  }
}

function matchMediaSafe(doc: Document, q: string): boolean {
  try {
    return Boolean(doc.defaultView?.matchMedia(q).matches);
  } catch {
    return false;
  }
}

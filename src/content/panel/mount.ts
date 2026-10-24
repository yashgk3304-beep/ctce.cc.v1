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

export interface PanelApi {
  setState: (state: PanelState, extra?: string) => void;
  setSuggestion: (s: SuggestionPayload) => void;
  setCompare: (text: string) => void;
  setBanner: (text: string) => void;
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

  body.append(banner, status, badgeEl, views, actions);
  root.append(header, body, resize);
  shadow.append(style, root);

  let expanded = false;
  let current: SuggestionPayload | null = null;
  let approvedCode = '';
  let lastCode = '';

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

  function setState(state: PanelState, extra?: string) {
    pill.textContent = `CT-C: ${labelFor(state)}`;
    status.textContent = extra ?? state;
    if (FORBIDDEN_PHRASES.test(status.textContent)) status.textContent = state;
  }

  function setBanner(text: string) {
    banner.hidden = !text;
    banner.textContent = text;
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
    } else if (ans && 'options' in ans) {
      lastCode = ans.code_to_run ?? '';
      const ul = doc.createElement('ul');
      for (const o of ans.options) {
        const li = doc.createElement('li');
        li.textContent = `${o.correct ? '✓' : '✗'} ${o.id}: ${o.reason}`;
        ul.appendChild(li);
      }
      views.appendChild(ul);
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

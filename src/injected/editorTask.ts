import type { CodeEdit, EditorEngine } from '../shared/types';

export interface EditorTaskRequest {
  action: 'scan' | 'write' | 'restore' | 'select-mcq';
  selector?: string;
  answerType?: 'complete_program' | 'fill_in_blank' | 'debugging';
  code?: string;
  blanks?: Array<{ index: number; code: string }>;
  edits?: CodeEdit[];
  optionIds?: string[];
  mode?: 'replace' | 'insert';
  typingAnimation?: boolean;
  typingCharsPerSecond?: number;
}

export interface EditorCandidateReport {
  type: EditorEngine | 'textarea' | 'contenteditable';
  selector: string;
  host: string;
  width: number;
  height: number;
  readOnly: boolean;
  lineCount: number;
  first150Characters: string;
  focused: boolean;
}

export interface EditorTaskResult {
  ok: boolean;
  action: EditorTaskRequest['action'];
  host: string;
  candidates?: EditorCandidateReport[];
  chosenSelector?: string;
  chosenReason?: string;
  strategy?: string;
  attempts?: Array<{ strategy: string; matched: boolean }>;
  lineCount?: number;
  readOnly?: boolean;
  selectedIds?: string[];
  previousText?: string;
  error?: string;
}

interface TextRange {
  from: number;
  to: number;
  text: string;
}

interface MonacoModel {
  getValue?: () => string;
  getOptions?: () => { readOnly?: boolean };
  getFullModelRange?: () => unknown;
  getPositionAt?: (offset: number) => { lineNumber: number; column: number };
}

interface MonacoEditor {
  getDomNode?: () => Element | null;
  getModel?: () => MonacoModel | null;
  executeEdits?: (source: string, edits: Array<{ range: unknown; text: string }>) => boolean;
  getSelection?: () => {
    getStartPosition?: () => { lineNumber: number; column: number };
    getEndPosition?: () => { lineNumber: number; column: number };
  } | null;
  getPosition?: () => { lineNumber: number; column: number } | null;
  setPosition?: (position: unknown) => void;
  focus?: () => void;
}

interface AceSession {
  getValue?: () => string;
  setValue?: (value: string) => void;
  replace?: (range: { start: { row: number; column: number }; end: { row: number; column: number } }, value: string) => void;
  getDocument?: () => {
    indexToPosition?: (offset: number) => { row: number; column: number };
  };
}

interface AceEditor {
  session?: AceSession;
  env?: { editor?: AceEditor };
  getValue?: () => string;
  setValue?: (value: string, cursorPosition?: number) => void;
  getReadOnly?: () => boolean;
  focus?: () => void;
}

interface CodeMirror5 {
  getValue?: () => string;
  setValue?: (value: string) => void;
  getOption?: (name: string) => unknown;
  getCursor?: (which?: string) => { line: number; ch: number };
  indexFromPos?: (position: { line: number; ch: number }) => number;
  posFromIndex?: (offset: number) => { line: number; ch: number };
  replaceRange?: (text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) => void;
  focus?: () => void;
}

interface CodeMirror6 {
  state?: {
    doc?: { toString?: () => string; length?: number };
    selection?: { main?: { from: number; to: number } };
  };
  dispatch?: (transaction: { changes?: unknown; selection?: unknown }) => void;
  focus?: () => void;
}

interface EditorWindow extends Window {
  monaco?: { editor?: { getEditors?: () => MonacoEditor[]; getModels?: () => MonacoModel[] } };
}

/**
 * Serialized by chrome.scripting.executeScript into the page's MAIN world.
 * Keep all runtime helpers nested so this function has no extension-world
 * dependencies after Chrome serializes it.
 */
export async function runEditorTask(request: EditorTaskRequest): Promise<EditorTaskResult> {
  const host = window.location.host;
  const attempts: Array<{ strategy: string; matched: boolean }> = [];
  const normLf = (value: string) => value.replace(/\r\n?/g, '\n');
  const normalizedCode = (value: string) => `${normLf(value).replace(/\n*$/, '')}\n`;
  const countLines = (value: string) => {
    const text = normLf(value);
    if (!text) return 0;
    const count = text.split('\n').length;
    return text.endsWith('\n') ? count - 1 : count;
  };
  const win = window as EditorWindow;

  function escapeCss(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.codePointAt(0)?.toString(16) ?? ''} `);
  }

  function selectorFor(element: Element): string {
    if (element.id) return `#${escapeCss(element.id)}`;
    const classes = [...element.classList].filter(Boolean).slice(0, 3);
    if (classes.length) {
      const selector = `${element.tagName.toLowerCase()}${classes.map((name) => `.${escapeCss(name)}`).join('')}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement && parts.length < 6) {
      let part = current.tagName.toLowerCase();
      const siblings = current.parentElement
        ? [...current.parentElement.children].filter((child) => child.tagName === current?.tagName)
        : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      current = current.parentElement;
      const candidate = parts.join(' > ');
      try {
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      } catch {
        // Keep extending the selector.
      }
    }
    return parts.join(' > ') || element.tagName.toLowerCase();
  }

  function isVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight &&
      style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function isExcluded(element: Element): boolean {
    const parts: string[] = [];
    let current: Element | null = element;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      parts.push(
        current.getAttribute('aria-label') ?? '',
        current.getAttribute('placeholder') ?? '',
        current.getAttribute('name') ?? '',
        current.getAttribute('id') ?? '',
        current.getAttribute('class') ?? '',
        current.getAttribute('data-testid') ?? '',
      );
      if (current.tagName === 'LABEL') parts.push(current.textContent ?? '');
    }
    return /\b(stdin|standard input|custom input|program input|sample input|output|console|terminal|search|filter)\b/i.test(parts.join(' '));
  }

  function textOf(element: Element, type: string, editor?: MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6): string {
    try {
      if (type === 'monaco') {
        const model = (editor as MonacoEditor | undefined)?.getModel?.();
        return model?.getValue?.() ?? '';
      }
      if (type === 'ace') {
        const ace = editor as AceEditor | undefined;
        return ace?.session?.getValue?.() ?? ace?.getValue?.() ?? '';
      }
      if (type === 'codemirror5') return (editor as CodeMirror5 | undefined)?.getValue?.() ?? '';
      if (type === 'codemirror6') {
        return (editor as CodeMirror6 | undefined)?.state?.doc?.toString?.() ?? element.textContent ?? '';
      }
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value;
      return (element as HTMLElement).innerText ?? element.textContent ?? '';
    } catch {
      return element.textContent ?? '';
    }
  }

  function apiFor(element: Element, type: EditorCandidateReport['type']): MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6 | undefined {
    if (type === 'monaco') {
      const monacoApi = win.monaco?.editor;
      const matchingEditor = (monacoApi?.getEditors?.() ?? []).find((editor) => editor.getDomNode?.() === element);
      if (matchingEditor) return matchingEditor;
      const models = monacoApi?.getModels?.() ?? [];
      const firstModel = models.length === 1 ? models[0] : undefined;
      return firstModel ? { getModel: () => firstModel, getDomNode: () => element } : undefined;
    }
    if (type === 'ace') {
      const root = element as Element & { env?: { editor?: AceEditor } };
      // `ace.edit(element)` constructs an editor when one is missing, so never
      // call it during diagnostics or candidate scans.
      return root.env?.editor;
    }
    if (type === 'codemirror5') return (element as Element & { CodeMirror?: CodeMirror5 }).CodeMirror;
    if (type === 'codemirror6') return (element as Element & { cmView?: { view?: CodeMirror6 } }).cmView?.view;
    return undefined;
  }

  function readOnly(element: Element, type: EditorCandidateReport['type'], editor?: MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6): boolean {
    if (element.getAttribute('aria-readonly') === 'true') return true;
    if (type === 'monaco') {
      const model = (editor as MonacoEditor | undefined)?.getModel?.();
      return Boolean(model?.getOptions?.().readOnly);
    }
    if (type === 'ace') return Boolean((editor as AceEditor | undefined)?.getReadOnly?.());
    if (type === 'codemirror5') return Boolean((editor as CodeMirror5 | undefined)?.getOption?.('readOnly'));
    if (type === 'codemirror6') {
      const content = element as HTMLElement;
      return content.contentEditable === 'false' || content.getAttribute('aria-readonly') === 'true';
    }
    return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
      ? element.readOnly || element.disabled
      : !(element as HTMLElement).isContentEditable;
  }

  function allCandidates(): Array<{ element: Element; type: EditorCandidateReport['type']; editor?: MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6; report: EditorCandidateReport }> {
    const found = new Map<Element, EditorCandidateReport['type']>();
    for (const editor of win.monaco?.editor?.getEditors?.() ?? []) {
      const node = editor.getDomNode?.();
      if (node) found.set(node, 'monaco');
    }
    const selectors: Array<[string, EditorCandidateReport['type']]> = [
      ['.monaco-editor', 'monaco'],
      ['.ace_editor', 'ace'],
      ['.CodeMirror', 'codemirror5'],
      ['.cm-content', 'codemirror6'],
      ['textarea', 'textarea'],
      ['input:not([type]), input[type="text"]', 'textarea'],
      ['[contenteditable="true"], [contenteditable=""]', 'contenteditable'],
    ];
    for (const [selector, type] of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (type === 'codemirror6' && element.closest('.CodeMirror')) continue;
        if (type === 'textarea' && element.closest('.monaco-editor, .ace_editor, .CodeMirror, .cm-editor')) continue;
        if (type === 'contenteditable' && element.closest('.monaco-editor, .ace_editor, .CodeMirror, .cm-editor')) continue;
        found.set(element, type);
      }
    }
    const results: Array<{ element: Element; type: EditorCandidateReport['type']; editor?: MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6; report: EditorCandidateReport }> = [];
    for (const [element, type] of found) {
      if (!isVisible(element) || isExcluded(element)) continue;
      const editor = apiFor(element, type);
      const text = textOf(element, type, editor);
      const rect = element.getBoundingClientRect();
      const focused = element === document.activeElement || element.contains(document.activeElement);
      results.push({
        element,
        type,
        editor,
        report: {
          type: type === 'unknown' ? 'unknown' : type,
          selector: selectorFor(element),
          host,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          readOnly: readOnly(element, type, editor),
          lineCount: countLines(text),
          first150Characters: text.slice(0, 150),
          focused,
        },
      });
    }
    return results;
  }

  function getOffsets(adapter: { type: EditorCandidateReport['type']; editor?: MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6; element: Element; value: string }): { from: number; to: number } {
    const { type, editor, element, value } = adapter;
    if (type === 'monaco') {
      const monaco = editor as MonacoEditor | undefined;
      const model = monaco?.getModel?.();
      const selection = monaco?.getSelection?.();
      const start = selection?.getStartPosition?.();
      const end = selection?.getEndPosition?.();
      const offsetAt = (position: { lineNumber: number; column: number } | undefined) => {
        if (!position) return model?.getPositionAt?.(0) ? 0 : value.length;
        const lines = value.split('\n');
        let offset = 0;
        for (let i = 0; i < position.lineNumber - 1; i += 1) offset += (lines[i]?.length ?? 0) + 1;
        return offset + Math.max(0, position.column - 1);
      };
      if (start && end) return { from: offsetAt(start), to: offsetAt(end) };
    }
    if (type === 'codemirror5') {
      const cm = editor as CodeMirror5 | undefined;
      const from = cm?.getCursor?.('from');
      const to = cm?.getCursor?.('to');
      if (from && to) return { from: cm?.indexFromPos?.(from) ?? 0, to: cm?.indexFromPos?.(to) ?? value.length };
    }
    if (type === 'codemirror6') {
      const main = (editor as CodeMirror6 | undefined)?.state?.selection?.main;
      if (main) return { from: main.from, to: main.to };
    }
    if (type === 'ace') {
      const ace = editor as AceEditor | undefined;
      const range = (ace as AceEditor & { selection?: { getRange?: () => { start: { row: number; column: number }; end: { row: number; column: number } } } } | undefined)?.selection?.getRange?.();
      const indexAt = (point: { row: number; column: number }) => {
        const lines = value.split('\n');
        let offset = 0;
        for (let i = 0; i < point.row; i += 1) offset += (lines[i]?.length ?? 0) + 1;
        return offset + point.column;
      };
      if (range) return { from: indexAt(range.start), to: indexAt(range.end) };
    }
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return { from: element.selectionStart ?? value.length, to: element.selectionEnd ?? value.length };
    }
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && element.contains(range.startContainer)) {
      const before = document.createRange();
      before.selectNodeContents(element);
      before.setEnd(range.startContainer, range.startOffset);
      const from = before.toString().length;
      return { from, to: from + range.toString().length };
    }
    const position = (editor as MonacoEditor | undefined)?.getPosition?.();
    if (position) {
      const lines = value.split('\n');
      let offset = 0;
      for (let i = 0; i < position.lineNumber - 1; i += 1) offset += (lines[i]?.length ?? 0) + 1;
      offset += Math.max(0, position.column - 1);
      return { from: offset, to: offset };
    }
    return { from: value.length, to: value.length };
  }

  function monacoRange(model: MonacoModel, from: number, to: number): {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } {
    const start = model.getPositionAt?.(from);
    const end = model.getPositionAt?.(to);
    if (!start || !end) throw new Error('Monaco position mapping is unavailable');
    return {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    };
  }

  function dispatchInput(element: Element): void {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function plainExecCommand(element: Element, value: string): void {
    const target = element as HTMLElement;
    target.focus();
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      element.select();
      if (typeof document.execCommand === 'function') document.execCommand('insertText', false, value);
      return;
    }
    const selection = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (typeof document.execCommand === 'function') document.execCommand('insertText', false, value);
  }

  function nativeValueFallback(element: Element, value: string): void {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(element, value);
      dispatchInput(element);
      return;
    }
    if ((element as HTMLElement).isContentEditable) {
      (element as HTMLElement).textContent = value;
      dispatchInput(element);
    }
  }

  function setFull(adapter: { type: EditorCandidateReport['type']; editor?: MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6; element: Element }, value: string, mode: 'replace' | 'insert'): void {
    const { type, editor, element } = adapter;
    const current = textOf(element, type, editor);
    let next = value;
    let selection: { from: number; to: number } | undefined;
    if (mode === 'insert') {
      selection = getOffsets({ ...adapter, value: current });
      next = `${current.slice(0, selection.from)}${value}${current.slice(selection.to)}`;
    }
    if (type === 'monaco') {
      const instance = editor as MonacoEditor | undefined;
      const model = instance?.getModel?.();
      const range = mode === 'insert' && selection && model?.getPositionAt
        ? monacoRange(model, selection.from, selection.to)
        : model?.getFullModelRange?.();
      if (!range || !instance?.executeEdits?.('ctc-assistant', [{ range, text: value }])) throw new Error('Monaco rejected executeEdits');
      instance.focus?.();
      return;
    }
    if (type === 'ace') {
      const instance = editor as AceEditor | undefined;
      if (mode === 'insert' && selection && instance?.session?.replace && instance.session.getDocument?.()?.indexToPosition) {
        const doc = instance.session.getDocument();
        const indexToPosition = doc?.indexToPosition;
        if (!doc || !indexToPosition) throw new Error('Ace position mapping is unavailable');
        const start = indexToPosition(selection.from);
        const end = indexToPosition(selection.to);
        instance.session.replace({ start, end }, value);
      } else if (instance?.setValue) {
        instance.setValue(next, -1);
      } else {
        throw new Error('Ace editor API is unavailable');
      }
      instance?.focus?.();
      return;
    }
    if (type === 'codemirror5') {
      const instance = editor as CodeMirror5 | undefined;
      if (mode === 'insert' && selection && instance?.replaceRange && instance.posFromIndex) {
        instance.replaceRange(value, instance.posFromIndex(selection.from), instance.posFromIndex(selection.to));
      } else if (instance?.setValue) {
        instance.setValue(next);
      } else {
        throw new Error('CodeMirror 5 API is unavailable');
      }
      instance.focus?.();
      return;
    }
    if (type === 'codemirror6') {
      const instance = editor as CodeMirror6 | undefined;
      const length = instance?.state?.doc?.length;
      if (length === undefined || !instance?.dispatch) throw new Error('CodeMirror 6 API is unavailable');
      if (mode === 'insert' && selection) {
        instance.dispatch({ changes: { from: selection.from, to: selection.to, insert: value } });
      } else {
        instance.dispatch({ changes: { from: 0, to: length, insert: next } });
      }
      instance.focus?.();
      return;
    }
    plainExecCommand(element, next);
  }

  function replaceRanges(adapter: { type: EditorCandidateReport['type']; editor?: MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6; element: Element }, ranges: TextRange[]): void {
    const { type, editor, element } = adapter;
    if (type === 'monaco') {
      const instance = editor as MonacoEditor | undefined;
      const model = instance?.getModel?.();
      if (!model?.getPositionAt || !instance?.executeEdits) throw new Error('Monaco range API is unavailable');
      const apiEdits = [...ranges].sort((a, b) => b.from - a.from).map((range) => ({
        range: monacoRange(model, range.from, range.to),
        text: range.text,
      }));
      if (!instance.executeEdits('ctc-assistant-fill', apiEdits)) throw new Error('Monaco rejected blank edits');
      return;
    }
    if (type === 'ace') {
      const session = (editor as AceEditor | undefined)?.session;
      const doc = session?.getDocument?.();
      if (!session?.replace || !doc?.indexToPosition) throw new Error('Ace range API is unavailable');
      for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
        const start = doc.indexToPosition(range.from);
        const end = doc.indexToPosition(range.to);
        session.replace({ start, end }, range.text);
      }
      return;
    }
    if (type === 'codemirror5') {
      const cm = editor as CodeMirror5 | undefined;
      if (!cm?.replaceRange || !cm.posFromIndex) throw new Error('CodeMirror 5 range API is unavailable');
      for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
        cm.replaceRange(range.text, cm.posFromIndex(range.from), cm.posFromIndex(range.to));
      }
      return;
    }
    if (type === 'codemirror6') {
      const cm = editor as CodeMirror6 | undefined;
      if (!cm?.dispatch) throw new Error('CodeMirror 6 range API is unavailable');
      cm.dispatch({ changes: ranges.map(({ from, to, text }) => ({ from, to, insert: text })) });
      return;
    }
    const current = textOf(element, type, editor);
    let next = current;
    for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
      next = `${next.slice(0, range.from)}${range.text}${next.slice(range.to)}`;
    }
    plainExecCommand(element, next);
    if (normLf(textOf(element, type, editor)) !== normLf(next)) nativeValueFallback(element, next);
  }

  function makeExplicitBlankRanges(source: string, blanks: Array<{ index: number; code: string }>, edits: CodeEdit[]): TextRange[] {
    const slots: Array<{ from: number; to: number; indent: string }> = [];
    const lines = source.split('\n');
    let offset = 0;
    for (const line of lines) {
      const underscores = /_{2,}/g;
      let match: RegExpExecArray | null;
      while ((match = underscores.exec(line))) {
        slots.push({ from: offset + match.index, to: offset + match.index + match[0].length, indent: line.slice(0, match.index).match(/^[ \t]*/)?.[0] ?? '' });
      }
      if (slots.length === 0 || !line.trim().includes('_')) {
        const marker = /^([ \t]*)(?:(?:\/\/|\/\*|\*|#)\s*)?(?:write(?:\s+your)?\s+code\s+here|insert\s+(?:code|your\s+code)\s+here|implement\s+(?:this|here)|complete\s+this\s+code).*?(?:\*\/)?[ \t]*$/i.exec(line);
        if (marker) slots.push({ from: offset + (marker[1]?.length ?? 0), to: offset + line.length, indent: marker[1] ?? '' });
      }
      offset += line.length + 1;
    }
    if (slots.length === 0 && edits.length) {
      offset = 0;
      for (const edit of [...edits].sort((a, b) => a.line - b.line)) {
        const lineIndex = edit.line - 1;
        const line = lines[lineIndex];
        if (line === undefined) continue;
        const lineStart = lines.slice(0, lineIndex).reduce((sum, item) => sum + item.length + 1, 0);
        const indent = line.match(/^[ \t]*/)?.[0] ?? '';
        let from = lineStart;
        let to = lineStart + line.length;
        const marker = line.indexOf(edit.before);
        if (edit.before && marker >= 0) {
          from += marker;
          to = from + edit.before.length;
        }
        slots.push({ from, to, indent });
      }
    }
    return slots.flatMap((slot, index) => {
      const blank = blanks.find((item) => item.index === index);
      const code = blank?.code ?? edits[index]?.after;
      if (code === undefined) return [];
      const indented = normLf(code).split('\n').map((line, row) => row === 0 || !line ? line : `${slot.indent}${line}`).join('\n');
      return [{ from: slot.from, to: slot.to, text: indented }];
    });
  }

  function makeBlankRanges(
    source: string,
    blanks: Array<{ index: number; code: string }>,
    edits: CodeEdit[],
    completedCode: string,
  ): TextRange[] {
    const explicit = makeExplicitBlankRanges(source, blanks, edits);
    if (explicit.length) return explicit;

    const sourceLines = normLf(source).split('\n');
    const finalLines = normLf(completedCode).replace(/\n*$/, '').split('\n');
    const slots: Array<{ from: number; to: number; lineIndex: number; markerIndex: number; kind: 'underscore' | 'comment' }> = [];
    if (!source.trim() && blanks.length) {
      const blank = blanks.find((item) => item.index === 0);
      if (blank) return [{ from: 0, to: source.length, text: normLf(blank.code).replace(/\n*$/, '') }];
    }
    let offset = 0;
    for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
      const line = sourceLines[lineIndex] ?? '';
      const matches = [...line.matchAll(/_{2,}/g)];
      if (matches.length) {
        for (let markerIndex = 0; markerIndex < matches.length; markerIndex += 1) {
          const match = matches[markerIndex];
          if (!match) continue;
          const start = match.index ?? 0;
          slots.push({ from: offset + start, to: offset + start + match[0].length, lineIndex, markerIndex, kind: 'underscore' });
        }
      } else if (/^\s*(?:(?:\/\/|\/\*|\*|#)\s*)?(?:write(?:\s+your)?\s+code\s+here|insert\s+(?:code|your\s+code)\s+here|implement\s+(?:this|here)|complete\s+this\s+code).*?(?:\*\/)?\s*$/i.test(line)) {
        slots.push({ from: offset, to: offset + line.length, lineIndex, markerIndex: 0, kind: 'comment' });
      }
      offset += line.length + 1;
    }

    const underscoreCaptures = new Map<number, string[]>();
    for (const lineIndex of new Set(slots.filter((slot) => slot.kind === 'underscore').map((slot) => slot.lineIndex))) {
      const line = sourceLines[lineIndex] ?? '';
      const parts = line.split(/_{2,}/g);
      const pattern = new RegExp(`^${parts.map(escapeRegex).join('([\\s\\S]*?)')}$`);
      const candidate = finalLines.find((lineText) => pattern.test(lineText));
      const captures = candidate === undefined ? null : pattern.exec(candidate);
      if (captures) underscoreCaptures.set(lineIndex, captures.slice(1));
    }

    return slots.flatMap((slot, index) => {
      const supplied = blanks.find((blank) => blank.index === index)?.code;
      if (supplied !== undefined) return [{ from: slot.from, to: slot.to, text: normLf(supplied).replace(/\n*$/, '') }];
      if (slot.kind === 'underscore') {
        const text = underscoreCaptures.get(slot.lineIndex)?.[slot.markerIndex];
        return text === undefined ? [] : [{ from: slot.from, to: slot.to, text }];
      }

      const previousLine = [...sourceLines.slice(0, slot.lineIndex)].reverse().find((line) => line.trim());
      const followingLine = sourceLines.slice(slot.lineIndex + 1).find((line) => line.trim());
      const previousAt = previousLine === undefined ? -1 : finalLines.indexOf(previousLine);
      const followingAt = followingLine === undefined
        ? finalLines.length
        : finalLines.findIndex((line, lineIndex) => lineIndex > previousAt && line === followingLine);
      if (followingAt < 0 || (previousLine !== undefined && previousAt < 0)) return [];
      const inserted = finalLines.slice(previousAt + 1, followingAt);
      while (inserted.length && inserted[inserted.length - 1] === '') inserted.pop();
      return inserted.length ? [{ from: slot.from, to: slot.to, text: inserted.join('\n') }] : [];
    });
  }

  function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  }

  async function animateWrite(adapter: { type: EditorCandidateReport['type']; editor?: MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6; element: Element }, code: string, mode: 'replace' | 'insert', cps: number): Promise<void> {
    const charsPerSecond = Math.max(1, Math.min(1000, cps));
    const chunkSize = Math.max(1, Math.floor(charsPerSecond / 10));
    const interval = Math.max(10, Math.round((chunkSize / charsPerSecond) * 1000));
    const original = textOf(adapter.element, adapter.type, adapter.editor);
    const selection = mode === 'insert' ? getOffsets({ ...adapter, value: original }) : undefined;
    const prefix = selection ? original.slice(0, selection.from) : '';
    const suffix = selection ? original.slice(selection.to) : '';
    const partialValue = (end: number) => selection ? `${prefix}${code.slice(0, end)}${suffix}` : code.slice(0, end);
    for (let end = chunkSize; end < code.length; end += chunkSize) {
      setFull(adapter, partialValue(end), 'replace');
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    setFull(adapter, partialValue(code.length), 'replace');
  }

  function recordAttempt(strategy: string, expected: string, adapter: { type: EditorCandidateReport['type']; editor?: MonacoEditor | AceEditor | CodeMirror5 | CodeMirror6; element: Element }): boolean {
    const matched = normLf(textOf(adapter.element, adapter.type, adapter.editor)) === normLf(expected);
    attempts.push({ strategy, matched });
    return matched;
  }

  if (request.action === 'scan') {
    const candidates = allCandidates().map((item) => item.report);
    const focused = candidates.filter((candidate) => candidate.focused);
    const chosen = focused.length === 1
      ? { candidate: focused[0], reason: 'only focused candidate' }
      : candidates.length
        ? { candidate: [...candidates].sort((a, b) => b.width * b.height - a.width * a.height)[0], reason: 'largest visible candidate' }
        : { candidate: undefined, reason: 'no eligible visible editor found' };
    return {
      ok: candidates.length > 0,
      action: request.action,
      host,
      candidates,
      chosenSelector: chosen.candidate?.selector,
      chosenReason: chosen.reason,
      error: candidates.length ? undefined : 'No visible, eligible editor was found in this frame.',
    };
  }

  if (request.action === 'select-mcq') {
    const wanted = new Set((request.optionIds ?? []).map((id) => id.trim().toUpperCase()).filter(Boolean));
    if (wanted.size === 0) return { ok: false, action: request.action, host, error: 'No proposed option IDs were provided.' };
    const selected: string[] = [];
    const controls = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]')].filter((control) => isVisible(control) && !isExcluded(control));
    for (const control of controls) {
      const labelText = control.labels ? [...control.labels].map((label) => label.textContent ?? '').join(' ') : '';
      const parentText = control.parentElement?.textContent ?? '';
      const description = `${control.value} ${control.id} ${control.getAttribute('aria-label') ?? ''} ${labelText} ${parentText}`;
      const option = /^\s*(?:\(?([A-H]|\d{1,2})\)?[).:\s-]|\s*([A-H]|\d{1,2})\s*$)/i.exec(description);
      const id = (option?.[1] ?? option?.[2] ?? '').toUpperCase();
      if (!id || !wanted.has(id)) continue;
      control.checked = true;
      dispatchInput(control);
      if (control.checked) selected.push(id);
    }
    return {
      ok: selected.length === wanted.size,
      action: request.action,
      host,
      selectedIds: selected,
      error: selected.length === wanted.size ? undefined : `Selected ${selected.length} of ${wanted.size} proposed option(s); unmatched: ${[...wanted].filter((id) => !selected.includes(id)).join(', ')}`,
    };
  }

  const scan = allCandidates();
  const chosen = scan.find((candidate) => candidate.report.selector === request.selector);
  if (!chosen) {
    return { ok: false, action: request.action, host, candidates: scan.map((candidate) => candidate.report), error: 'The chosen editor is no longer present. Scan again and choose the current editor.' };
  }
  const adapter = { type: chosen.type, editor: chosen.editor, element: chosen.element };
  const before = textOf(chosen.element, chosen.type, chosen.editor);
  const selectedMode = request.mode ?? 'replace';
  const type = request.answerType;
  const code = normalizedCode(request.code ?? '');
  if (chosen.report.readOnly) {
    return { ok: false, action: request.action, host, chosenSelector: request.selector, readOnly: true, error: 'The selected editor is read-only.' };
  }
  if (request.action === 'write' && !code.trim()) {
    return { ok: false, action: request.action, host, chosenSelector: request.selector, error: 'The proposed answer is empty.' };
  }

  if (request.action === 'write' && type === 'fill_in_blank') {
    const ranges = makeBlankRanges(before, request.blanks ?? [], request.edits ?? [], request.code ?? '');
    if (ranges.length === 0) {
      return { ok: false, action: request.action, host, chosenSelector: request.selector, error: 'No visible blank markers or line edits could be mapped to the proposed fill-ins.' };
    }
    let expected = before;
    for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
      expected = `${expected.slice(0, range.from)}${range.text}${expected.slice(range.to)}`;
    }
    try {
      replaceRanges(adapter, ranges);
    } catch {
      // The individual-range fallback below keeps the original lines intact.
    }
    if (recordAttempt('multi-range blank editor API', expected, adapter)) {
      return { ok: true, action: request.action, host, chosenSelector: request.selector, strategy: attempts.at(-1)?.strategy, attempts, lineCount: countLines(expected), previousText: before };
    }
    const afterMultiRange = normLf(textOf(chosen.element, chosen.type, chosen.editor));
    if (afterMultiRange !== normLf(before)) {
      return {
        ok: false,
        action: request.action,
        host,
        chosenSelector: request.selector,
        readOnly: chosen.report.readOnly,
        attempts,
        previousText: before,
        error: 'Some blank edits were accepted but the complete result did not verify. Restore previous before continuing.',
      };
    }
    let currentExpected = before;
    for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
      const partial = `${currentExpected.slice(0, range.from)}${range.text}${currentExpected.slice(range.to)}`;
      try {
        replaceRanges(adapter, [range]);
      } catch {
        // Read-back determines whether the page accepted this individual edit.
      }
      currentExpected = partial;
      if (!recordAttempt('single-blank fallback', partial, adapter)) break;
    }
    const matched = normLf(textOf(chosen.element, chosen.type, chosen.editor)) === normLf(expected);
    if (matched) return { ok: true, action: request.action, host, chosenSelector: request.selector, strategy: attempts.at(-1)?.strategy, attempts, lineCount: countLines(expected), previousText: before };
    const partialWrite = normLf(textOf(chosen.element, chosen.type, chosen.editor)) !== normLf(before);
    return {
      ok: false,
      action: request.action,
      host,
      chosenSelector: request.selector,
      readOnly: chosen.report.readOnly,
      attempts,
      ...(partialWrite ? { previousText: before } : {}),
      error: chosen.report.readOnly
        ? 'The editor rejected edits in one or more read-only ranges.'
        : partialWrite
          ? 'Some blanks changed but not all read-back checks passed. Restore previous before continuing.'
          : 'The editor did not retain the proposed blank edits.',
    };
  }

  if (chosen.report.readOnly) {
    return { ok: false, action: request.action, host, chosenSelector: request.selector, readOnly: true, error: 'The selected editor is read-only.' };
  }
  const full = request.action === 'restore' ? normLf(request.code ?? '') : code;
  const expected = selectedMode === 'insert' && request.action !== 'restore'
    ? (() => {
        const selection = getOffsets({ ...adapter, value: before });
        return `${before.slice(0, selection.from)}${full}${before.slice(selection.to)}`;
      })()
    : full;
  if (request.typingAnimation && request.action === 'write') {
    try {
      await animateWrite(adapter, full, selectedMode, request.typingCharsPerSecond ?? 60);
    } catch {
      // Try the direct editor API and then the DOM fallback below.
    }
    if (recordAttempt('typing animation editor API', expected, adapter)) {
      return { ok: true, action: request.action, host, chosenSelector: request.selector, strategy: attempts.at(-1)?.strategy, attempts, lineCount: countLines(expected), previousText: before };
    }
  }
  try {
    setFull(adapter, full, request.action === 'restore' ? 'replace' : selectedMode);
  } catch {
    // Verify the read-back before using the generic text-control fallback.
  }
  if (recordAttempt(`${chosen.type} editor API`, expected, adapter)) {
    return { ok: true, action: request.action, host, chosenSelector: request.selector, strategy: attempts.at(-1)?.strategy, attempts, lineCount: countLines(expected), previousText: before };
  }
  if (chosen.type === 'textarea' || chosen.type === 'contenteditable') {
    try {
      nativeValueFallback(chosen.element, expected);
    } catch {
      // A failed native setter is reported below with the actual read-back result.
    }
    if (recordAttempt('native value setter and input/change events', expected, adapter)) {
      return { ok: true, action: request.action, host, chosenSelector: request.selector, strategy: attempts.at(-1)?.strategy, attempts, lineCount: countLines(expected), previousText: before };
    }
  }
  const actual = normLf(textOf(chosen.element, chosen.type, chosen.editor));
  return {
    ok: false,
    action: request.action,
    host,
    chosenSelector: request.selector,
    readOnly: chosen.report.readOnly,
    attempts,
    error: actual === normLf(before)
      ? 'The editor value did not change. It may be read-only or use an unsupported editor API.'
      : 'The editor changed but its read-back did not match the proposed text.',
  };
}

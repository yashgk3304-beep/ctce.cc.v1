/**
 * MAIN-world read-only editor accessors. No DOM writes, no events, no storage.
 */

export interface MainWorldEditorSnapshot {
  engine: 'monaco' | 'ace' | 'codemirror5' | 'codemirror6' | 'unknown';
  text: string;
  fileName: string;
}

declare global {
  interface Window {
    monaco?: { editor?: { getEditors?: () => Array<{ getValue?: () => string; getModel?: () => { getValue?: () => string } | null }> } };
    ace?: { edit?: (id: string) => { getValue?: () => string; getSession?: () => { getValue?: () => string } } };
  }
}

function readMonaco(): string | null {
  const editors = window.monaco?.editor?.getEditors?.();
  if (!editors?.length) return null;
  const ed = editors[0];
  const fromEditor = ed?.getValue?.();
  if (typeof fromEditor === 'string') return fromEditor;
  const fromModel = ed?.getModel?.()?.getValue?.();
  return typeof fromModel === 'string' ? fromModel : null;
}

function readAce(): string | null {
  const nodes = document.querySelectorAll('.ace_editor');
  for (const node of nodes) {
    const id = node.id;
    if (!id || !window.ace?.edit) continue;
    try {
      const session = window.ace.edit(id)?.getSession?.();
      const val = session?.getValue?.() ?? window.ace.edit(id)?.getValue?.();
      if (typeof val === 'string') return val;
    } catch {
      // read-only probe — ignore
    }
  }
  return null;
}

function readCodeMirror5(): string | null {
  const CM = (window as unknown as { CodeMirror?: { fromTextArea?: unknown; instances?: Array<{ getValue?: () => string }> } }).CodeMirror;
  const instances = CM?.instances;
  if (instances?.length) {
    const val = instances[0]?.getValue?.();
    if (typeof val === 'string') return val;
  }
  const el = document.querySelector('.CodeMirror');
  const cm = (el as unknown as { CodeMirror?: { getValue?: () => string } } | null)?.CodeMirror;
  const val = cm?.getValue?.();
  return typeof val === 'string' ? val : null;
}

function readCodeMirror6(): string | null {
  const view = document.querySelector('.cm-editor');
  const state = (view as unknown as { cmView?: { state?: { doc?: { toString?: () => string } } } } | null)?.cmView;
  const text = state?.state?.doc?.toString?.();
  return typeof text === 'string' ? text : null;
}

export function readEditorMainWorld(): MainWorldEditorSnapshot {
  if (document.querySelector('.monaco-editor')) {
    const text = readMonaco() ?? '';
    return { engine: 'monaco', text, fileName: 'main.c' };
  }
  if (document.querySelector('.ace_editor')) {
    return { engine: 'ace', text: readAce() ?? '', fileName: 'main.c' };
  }
  if (document.querySelector('.cm-editor')) {
    return { engine: 'codemirror6', text: readCodeMirror6() ?? '', fileName: 'main.c' };
  }
  if (document.querySelector('.CodeMirror')) {
    return { engine: 'codemirror5', text: readCodeMirror5() ?? '', fileName: 'main.c' };
  }
  return { engine: 'unknown', text: '', fileName: 'main.c' };
}

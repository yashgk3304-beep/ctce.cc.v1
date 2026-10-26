/** Tiny bundled C tokenizer — no remote code. */

export interface Token {
  kind: 'kw' | 'str' | 'cmt' | 'num' | 'plain';
  text: string;
}

const KW =
  /^(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool|_Complex|_Imaginary)\b/;

export function tokenizeC(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const n = end === -1 ? src.length : end;
      out.push({ kind: 'cmt', text: src.slice(i, n) });
      i = n;
      continue;
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const n = end === -1 ? src.length : end + 2;
      out.push({ kind: 'cmt', text: src.slice(i, n) });
      i = n;
      continue;
    }
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== q) {
        if (src[j] === '\\') j += 2;
        else j += 1;
      }
      out.push({ kind: 'str', text: src.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(src[i] ?? '')) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j] ?? '')) j += 1;
      out.push({ kind: 'num', text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(src[i] ?? '')) {
      let j = i;
      while (j < src.length && /\w/.test(src[j] ?? '')) j += 1;
      const word = src.slice(i, j);
      out.push({ kind: KW.test(word) ? 'kw' : 'plain', text: word });
      i = j;
      continue;
    }
    out.push({ kind: 'plain', text: src[i] ?? '' });
    i += 1;
  }
  return out;
}

export function renderHighlighted(pre: HTMLElement, code: string, changedLines?: Set<number>): void {
  pre.replaceChildren();
  const lines = code.split('\n');
  lines.forEach((line, idx) => {
    const row = pre.ownerDocument.createElement('div');
    row.className = 'ctc-line' + (changedLines?.has(idx + 1) ? ' ctc-changed' : '');
    const num = pre.ownerDocument.createElement('span');
    num.className = 'ctc-ln';
    num.textContent = String(idx + 1);
    const body = pre.ownerDocument.createElement('span');
    body.className = 'ctc-lc';
    for (const tok of tokenizeC(line + '\n')) {
      const s = pre.ownerDocument.createElement('span');
      s.className = `ctc-t-${tok.kind}`;
      s.textContent = tok.text;
      body.appendChild(s);
    }
    row.append(num, body);
    pre.appendChild(row);
  });
}

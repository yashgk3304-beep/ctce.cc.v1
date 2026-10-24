export function toLf(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function collapseWs(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export function echoAwareExpected(expected, sampleInput) {
  let out = toLf(expected);
  if (!String(sampleInput).trim()) return out;
  const tokens = toLf(sampleInput).trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const idx = out.indexOf(token);
    if (idx === -1) continue;
    let end = idx + token.length;
    if (out[end] === '\n' || out[end] === '\r') end += 1;
    out = out.slice(0, idx) + out.slice(end);
  }
  return out;
}

export function matchModes(expected, actual, sampleInput = '') {
  const exp = toLf(expected);
  const act = toLf(actual);
  return {
    strict: exp === act,
    trimmed: exp.trim() === act.trim(),
    whitespaceInsensitive: collapseWs(exp) === collapseWs(act),
    echoAware: collapseWs(echoAwareExpected(exp, sampleInput)) === collapseWs(act),
  };
}

export function unifiedDiff(expected, actual) {
  const e = toLf(expected).split('\n');
  const a = toLf(actual).split('\n');
  const lines = [];
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n; i++) {
    if (e[i] === a[i]) continue;
    if (e[i] !== undefined) lines.push(`- ${e[i]}`);
    if (a[i] !== undefined) lines.push(`+ ${a[i]}`);
  }
  return lines.join('\n');
}

export function anyPass(matches) {
  return matches.strict || matches.trimmed || matches.whitespaceInsensitive || matches.echoAware;
}

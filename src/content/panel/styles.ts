export const PANEL_CSS = `
:host { all: initial; }
.ctc-root {
  font-family: "Segoe UI", Candara, sans-serif;
  font-size: 13px;
  color: var(--ink, #1c1a17);
  background: var(--card, #fffdf9);
  border: 1px solid var(--line, #d9d2c5);
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(20,16,8,.18);
  display: flex;
  flex-direction: column;
  min-width: 280px;
  min-height: 48px;
  overflow: hidden;
}
.ctc-root[data-theme="dark"] {
  --ink: #f3efe6;
  --card: #221e19;
  --line: #3a342c;
  --muted: #b0a898;
  --accent: #7aa2ff;
  --warn: #e6b800;
  --ok: #6dca8a;
  --bad: #ff8a80;
  background: var(--card);
  color: var(--ink);
}
.ctc-root[data-theme="light"] {
  --ink: #1c1a17;
  --card: #fffdf9;
  --line: #d9d2c5;
  --muted: #5c574f;
  --accent: #0b5fff;
  --warn: #8a6d00;
  --ok: #0a7a3e;
  --bad: #a11;
}
.ctc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: grab;
  background: rgba(11,95,255,.06);
  user-select: none;
}
.ctc-pill { font-weight: 650; letter-spacing: .02em; }
.ctc-body { padding: 8px 10px 12px; overflow: auto; flex: 1; }
.ctc-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 11px;
  font-weight: 650;
}
.ctc-badge.warn { color: var(--warn); border-color: var(--warn); }
.ctc-badge.bad { color: var(--bad); border-color: var(--bad); }
.ctc-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
button {
  font: inherit;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--accent);
  color: #fff;
  padding: 5px 9px;
  cursor: pointer;
}
button.ghost { background: transparent; color: var(--ink); }
.ctc-code {
  font-family: Consolas, "Cascadia Mono", monospace;
  font-size: 12px;
  background: rgba(0,0,0,.04);
  border-radius: 8px;
  overflow: auto;
  max-height: 280px;
  margin: 8px 0;
}
.ctc-line { display: flex; white-space: pre; }
.ctc-ln { width: 2.5em; color: var(--muted, #888); text-align: right; padding-right: 8px; user-select: none; }
.ctc-changed { background: rgba(11,95,255,.12); }
.ctc-t-kw { color: #0b5fff; font-weight: 650; }
.ctc-t-str { color: #0a7a3e; }
.ctc-t-cmt { color: #888; font-style: italic; }
.ctc-t-num { color: #a15c00; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
td, th { border-bottom: 1px solid var(--line); padding: 4px; text-align: left; vertical-align: top; }
.ctc-banner { padding: 6px 8px; background: #fff3cd; color: #5c4800; border-radius: 8px; margin: 6px 0; }
.ctc-resize {
  align-self: flex-end;
  width: 14px; height: 14px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--line) 50%);
}
details { margin: 6px 0; }
.ctc-muted { color: var(--muted, #666); }
`;

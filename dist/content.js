(function() {
  "use strict";
  const EDITOR_ROOT_SELECTORS = [
    ".monaco-editor",
    ".ace_editor",
    ".CodeMirror",
    ".cm-editor",
    '[data-testid="code-editor"]',
    ".code-editor"
  ];
  const MONACO_SELECTORS = {
    root: ".monaco-editor",
    viewLine: ".view-line",
    lineNumberCell: ".line-numbers"
  };
  const ACE_SELECTORS = {
    root: ".ace_editor",
    line: ".ace_line",
    gutter: ".ace_gutter-cell"
  };
  const CODEMIRROR5_SELECTORS = {
    root: ".CodeMirror",
    line: ".CodeMirror-line",
    gutter: ".CodeMirror-linenumber"
  };
  const CODEMIRROR6_SELECTORS = {
    root: ".cm-editor",
    line: ".cm-line",
    gutter: ".cm-gutterElement"
  };
  const QUESTION_REGION_SELECTORS = [
    '[data-testid="question-panel"]',
    ".question-panel",
    ".problem-statement",
    ".question-description",
    "main .left-panel",
    "main .pane-left",
    ".split-pane-left",
    '[role="main"] section:first-of-type'
  ];
  const HEADING_SELECTORS = [
    "h1",
    "h2.question-title",
    ".question-heading",
    '[data-testid="question-title"]'
  ];
  const SECTION_LABEL_PATTERNS = {
    constraints: /\bconstraints?\b/i,
    inputFormat: /\binput\s*format\b/i,
    outputFormat: /\boutput\s*format\b/i
  };
  const SAMPLE_TEST_CASES_LABELS = [
    "Sample Test Cases",
    "Sample test cases",
    "Sample Tests"
  ];
  const TEST_CASES_TAB_LABELS = ["Test cases", "Test Cases", "Testcases"];
  const SAMPLE_ACCORDION_SELECTORS = [
    '[data-testid="sample-test-cases"]',
    ".sample-test-cases",
    ".accordion-item:has(.accordion-header)",
    "details.sample-cases",
    '[aria-label*="Sample Test"]'
  ];
  const SAMPLE_INPUT_LABELS = ["Input", "Stdin", "Standard Input"];
  const SAMPLE_OUTPUT_LABELS = ["Output", "Stdout", "Expected Output"];
  const ACTION_BUTTON_LABELS = {
    submit: ["Submit", "Submit Code", "Submit Answer"],
    run: ["Run", "Run Code", "Compile & Run", "Execute"]
  };
  const TERMINAL_LABELS = ["Terminal", "Console", "Output", "Execution Result"];
  const NOISE_SELECTORS = [
    ".timer-chip",
    ".countdown",
    '[data-testid="timer"]',
    ".time-remaining",
    ".help-widget",
    ".stuck-widget",
    '[aria-label*="Are you stuck"]',
    ".are-you-stuck",
    "#help-floating",
    ".toast",
    ".notification"
  ];
  NOISE_SELECTORS.filter(
    (s) => /timer|countdown|time-remaining/i.test(s)
  );
  NOISE_SELECTORS.filter(
    (s) => /help|stuck|widget/i.test(s)
  );
  const QUIZ_URL_PATH_PATTERNS = [
    /\/quiz\b/i,
    /\/assessment\b/i,
    /\/exam\b/i,
    /\/mcq\b/i,
    /question-type=quiz/i
  ];
  const QUIZ_HEADING_PATTERNS = [
    /^quiz\b/i,
    /\bquiz\s*:/i,
    /\bmultiple\s+choice\s+quiz\b/i,
    /\bassessment\b/i
  ];
  const CODING_URL_PATH_PATTERNS = [
    /\/practice\b/i,
    /\/coding\b/i,
    /\/problem\b/i,
    /\/challenge\b/i,
    /\/assignment\b/i
  ];
  const IFRAME_EDITOR_SELECTORS = ["iframe.editor-frame", 'iframe[src*="editor"]'];
  function safePath(doc) {
    try {
      return doc.defaultView?.location?.pathname ?? "";
    } catch {
      return "";
    }
  }
  function hasEditor(doc) {
    for (const sel of EDITOR_ROOT_SELECTORS) {
      if (doc.querySelector(sel)) return true;
    }
    return false;
  }
  function bodyIncludes(doc, needles) {
    const text = doc.body?.textContent ?? "";
    return needles.some((n) => text.includes(n));
  }
  function headingMatchesQuiz(doc) {
    const headings = doc.querySelectorAll('h1, h2, h3, .question-heading, [data-testid="question-title"]');
    for (const h of headings) {
      const t = (h.textContent ?? "").trim();
      if (QUIZ_HEADING_PATTERNS.some((re) => re.test(t))) return true;
    }
    return false;
  }
  function urlMatches(path, patterns) {
    return patterns.some((re) => re.test(path));
  }
  function pageProbe(doc) {
    const evidence = [];
    try {
      const path = safePath(doc);
      const editor = hasEditor(doc);
      const sampleLabel = bodyIncludes(doc, SAMPLE_TEST_CASES_LABELS);
      const testTab = bodyIncludes(doc, TEST_CASES_TAB_LABELS);
      const terminal = bodyIncludes(doc, TERMINAL_LABELS);
      const submitRun = bodyIncludes(doc, ACTION_BUTTON_LABELS.submit) || bodyIncludes(doc, ACTION_BUTTON_LABELS.run);
      const quizUrl = urlMatches(path, QUIZ_URL_PATH_PATTERNS);
      const codingUrl = urlMatches(path, CODING_URL_PATH_PATTERNS);
      const quizHeading = headingMatchesQuiz(doc);
      if (editor) evidence.push("editor-present");
      if (sampleLabel) evidence.push("sample-test-cases-label");
      if (testTab) evidence.push("test-cases-tab-label");
      if (terminal) evidence.push("terminal-label");
      if (submitRun) evidence.push("submit-or-run-label");
      if (quizUrl) evidence.push("quiz-url-path");
      if (codingUrl) evidence.push("coding-url-path");
      if (quizHeading) evidence.push("quiz-heading");
      let codingScore = 0;
      if (editor) codingScore += 3;
      if (sampleLabel || testTab) codingScore += 2;
      if (terminal) codingScore += 1;
      if (submitRun) codingScore += 1;
      if (codingUrl) codingScore += 1;
      if (quizUrl || quizHeading) {
        return { kind: "quiz", confidence: quizUrl && quizHeading ? 0.95 : 0.85, evidence };
      }
      if (codingScore >= 2) {
        const confidence = Math.min(0.98, 0.45 + codingScore * 0.08);
        return { kind: "coding", confidence, evidence };
      }
      return { kind: "other", confidence: evidence.length ? 0.35 : 0.15, evidence };
    } catch (err) {
      return {
        kind: "other",
        confidence: 0,
        evidence: [`probe-error:${err instanceof Error ? err.message : String(err)}`]
      };
    }
  }
  const NBSP = /\u00A0/g;
  const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
  const SMART_QUOTES = /[\u2018\u2019]/g;
  const SMART_DOUBLE = /[\u201C\u201D]/g;
  function normalizeText(input) {
    return input.replace(NBSP, " ").replace(ZERO_WIDTH, "").replace(SMART_QUOTES, "'").replace(SMART_DOUBLE, '"').replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function mapWhitespaceGlyphs(text) {
    return text.replace(/\u00B7/g, " ").replace(/\u00B7/g, " ").replace(/\u2022/g, " ").replace(/\u2192/g, "	").replace(/\u21E5/g, "	").replace(/\u00A0/g, " ").replace(ZERO_WIDTH, "");
  }
  const TIMER_CHIP_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
  function stripTimerNoise(text) {
    return text.replace(TIMER_CHIP_RE, "");
  }
  function toLf(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
  function cloneWithoutNoise(root, doc) {
    const host = doc.createElement("div");
    if (root instanceof HTMLElement) {
      host.appendChild(root.cloneNode(true));
    } else if (root instanceof DocumentFragment) {
      host.append(...Array.from(root.childNodes).map((n) => n.cloneNode(true)));
    }
    for (const sel of NOISE_SELECTORS) {
      host.querySelectorAll(sel).forEach((el2) => el2.remove());
    }
    return host;
  }
  function findQuestionRoot(doc) {
    for (const sel of QUESTION_REGION_SELECTORS) {
      const el2 = doc.querySelector(sel);
      if (el2 instanceof HTMLElement && (el2.textContent?.trim().length ?? 0) > 40) {
        return el2;
      }
    }
    return doc.body instanceof HTMLElement ? doc.body : null;
  }
  function extractHeading(doc, region) {
    for (const sel of HEADING_SELECTORS) {
      const el2 = region.querySelector(sel) ?? doc.querySelector(sel);
      const text = normalizeText(stripTimerNoise(el2?.textContent ?? ""));
      if (text.length > 0 && text.length < 300) return text;
    }
    return "";
  }
  function splitSections(text) {
    const lines = normalizeText(stripTimerNoise(text)).split("\n");
    let constraints = "";
    let inputFormat = "";
    let outputFormat = "";
    const statementLines = [];
    let mode = "statement";
    for (const line of lines) {
      if (SECTION_LABEL_PATTERNS.constraints.test(line)) {
        mode = "constraints";
        constraints += line.replace(SECTION_LABEL_PATTERNS.constraints, "").trim() + "\n";
        continue;
      }
      if (SECTION_LABEL_PATTERNS.inputFormat.test(line)) {
        mode = "input";
        inputFormat += line.replace(SECTION_LABEL_PATTERNS.inputFormat, "").trim() + "\n";
        continue;
      }
      if (SECTION_LABEL_PATTERNS.outputFormat.test(line)) {
        mode = "output";
        outputFormat += line.replace(SECTION_LABEL_PATTERNS.outputFormat, "").trim() + "\n";
        continue;
      }
      switch (mode) {
        case "constraints":
          constraints += line + "\n";
          break;
        case "input":
          inputFormat += line + "\n";
          break;
        case "output":
          outputFormat += line + "\n";
          break;
        default:
          statementLines.push(line);
      }
    }
    return {
      statement: statementLines.join("\n").trim(),
      constraints: constraints.trim(),
      inputFormat: inputFormat.trim(),
      outputFormat: outputFormat.trim()
    };
  }
  function extractQuestion(doc) {
    const evidence = [];
    const warnings = [];
    try {
      const root = findQuestionRoot(doc);
      if (!root) {
        return {
          ok: false,
          value: null,
          confidence: 0,
          evidence: ["no-question-region"],
          warnings: []
        };
      }
      evidence.push("question-region");
      const cleaned = cloneWithoutNoise(root, doc);
      const heading = extractHeading(doc, cleaned);
      if (heading) evidence.push("heading");
      const raw = cleaned.textContent ?? "";
      const parts = splitSections(raw);
      if (!parts.statement && !heading) {
        warnings.push("empty-statement");
      }
      const confidence = 0.35 + (heading ? 0.15 : 0) + (parts.statement.length > 50 ? 0.25 : parts.statement.length > 10 ? 0.15 : 0) + (parts.constraints || parts.inputFormat || parts.outputFormat ? 0.1 : 0);
      return {
        ok: Boolean(parts.statement || heading),
        value: {
          heading,
          statement: parts.statement,
          constraints: parts.constraints,
          inputFormat: parts.inputFormat,
          outputFormat: parts.outputFormat
        },
        confidence: Math.min(confidence, 0.95),
        evidence,
        warnings
      };
    } catch (err) {
      return {
        ok: false,
        value: null,
        confidence: 0,
        evidence: [`extract-question-error:${err instanceof Error ? err.message : String(err)}`],
        warnings
      };
    }
  }
  function findAccordion(doc) {
    for (const sel of SAMPLE_ACCORDION_SELECTORS) {
      const el2 = doc.querySelector(sel);
      if (el2) return el2;
    }
    for (const label of SAMPLE_TEST_CASES_LABELS) {
      const headers = doc.querySelectorAll('button, summary, .accordion-header, [role="button"]');
      for (const h of headers) {
        if ((h.textContent ?? "").includes(label)) {
          return h.closest("details, .accordion-item, section, div") ?? h.parentElement;
        }
      }
    }
    return null;
  }
  function isCollapsed(accordion, doc) {
    if (!accordion) return false;
    const DetailsElement = doc.defaultView?.HTMLDetailsElement;
    if (DetailsElement && accordion instanceof DetailsElement && !accordion.open) return true;
    const aria = accordion.getAttribute("aria-expanded");
    if (aria === "false") return true;
    const panel2 = accordion.querySelector('.accordion-collapse, .collapse, [data-testid="sample-panel"]');
    const HTMLElementClass = doc.defaultView?.HTMLElement;
    if (HTMLElementClass && panel2 instanceof HTMLElementClass) {
      const hidden = panel2.hidden || panel2.classList.contains("collapse") || panel2.getAttribute("aria-hidden") === "true";
      if (hidden && !(panel2.textContent ?? "").trim()) return true;
    }
    const bodyText = accordion.textContent ?? "";
    const hasIo = SAMPLE_INPUT_LABELS.some((l) => bodyText.includes(l));
    if (!hasIo && SAMPLE_TEST_CASES_LABELS.some((l) => bodyText.includes(l))) return true;
    return false;
  }
  function findTestCasesTabPanel(doc) {
    for (const label of TEST_CASES_TAB_LABELS) {
      const tabs = doc.querySelectorAll('[role="tab"], .nav-link, button');
      for (const tab of tabs) {
        if ((tab.textContent ?? "").trim() === label) {
          const panelId = tab.getAttribute("aria-controls");
          if (panelId) {
            const panel2 = doc.getElementById(panelId);
            if (panel2) return panel2;
          }
          return tab.closest(".tab-pane")?.parentElement ?? tab.parentElement;
        }
      }
    }
    return null;
  }
  function labelBlock(root, labels) {
    for (const label of labels) {
      const nodes = root.querySelectorAll("label, strong, span, th, dt, h4, h5, p");
      for (const node of nodes) {
        const t = (node.textContent ?? "").trim();
        if (t === label || t.startsWith(`${label}:`)) {
          const next = node.nextElementSibling;
          if (next) {
            const fromPre = next.querySelector("pre");
            if (fromPre) return preserveWhitespace(fromPre.textContent ?? "");
            if (next.tagName === "PRE") return preserveWhitespace(next.textContent ?? "");
            return preserveWhitespace(next.textContent ?? "");
          }
          const parent = node.parentElement;
          if (parent) {
            const pre = parent.querySelector("pre");
            if (pre) return preserveWhitespace(pre.textContent ?? "");
          }
        }
      }
    }
    return null;
  }
  function preserveWhitespace(text) {
    return toLf(text).replace(/\u00A0/g, " ");
  }
  function parseTableCase(table) {
    const rows = [...table.querySelectorAll("tr")];
    let input = "";
    let expected = "";
    for (const row of rows) {
      const cells = [...row.querySelectorAll("td, th")].map((c) => preserveWhitespace(c.textContent ?? ""));
      if (cells.length >= 2) {
        const head = cells[0]?.toLowerCase() ?? "";
        if (head.includes("input")) input = cells[1] ?? "";
        if (head.includes("output") || head.includes("expected")) expected = cells[1] ?? "";
      }
    }
    if (input || expected) return { input, expected };
    return null;
  }
  function parseBlocks(root) {
    const tests = [];
    const tables = root.querySelectorAll("table");
    tables.forEach((table, i) => {
      const parsed = parseTableCase(table);
      if (parsed) {
        tests.push({
          id: `table-${i + 1}`,
          input: parsed.input,
          expected: parsed.expected
        });
      }
    });
    if (tests.length === 0) {
      const input = labelBlock(root, SAMPLE_INPUT_LABELS);
      const output = labelBlock(root, SAMPLE_OUTPUT_LABELS);
      if (input !== null || output !== null) {
        tests.push({
          id: "block-1",
          input: input ?? "",
          expected: output ?? ""
        });
      }
    }
    const pres = root.querySelectorAll("pre");
    if (tests.length === 0 && pres.length >= 2) {
      tests.push({
        id: "pre-pair-1",
        input: preserveWhitespace(pres[0]?.textContent ?? ""),
        expected: preserveWhitespace(pres[1]?.textContent ?? "")
      });
    }
    return tests;
  }
  function resolveStatus(collapsed, tests, parsedAny) {
    if (collapsed) return "collapsed";
    if (tests.length === 0) return parsedAny ? "unparsed" : "missing";
    const complete = tests.every((t) => t.input.length > 0 || t.expected.length > 0);
    if (!complete) return "unparsed";
    return "ok";
  }
  function extractSamples(doc) {
    const evidence = [];
    const warnings = [];
    try {
      const accordion = findAccordion(doc);
      const tabPanel = findTestCasesTabPanel(doc);
      const roots = [];
      if (accordion) {
        evidence.push("sample-accordion");
        roots.push(accordion);
      }
      if (tabPanel) {
        evidence.push("test-cases-tab");
        roots.push(tabPanel);
      }
      if (roots.length === 0 && doc.body) {
        evidence.push("body-fallback");
        roots.push(doc.body);
      }
      const collapsed = isCollapsed(accordion, doc);
      if (collapsed) warnings.push("samples-collapsed");
      const tests = [];
      let parsedAny = false;
      for (const root of roots) {
        const chunk = parseBlocks(root);
        if (chunk.length) parsedAny = true;
        tests.push(...chunk);
      }
      const deduped = [];
      const seen = /* @__PURE__ */ new Set();
      for (const t of tests) {
        const key = `${t.input}>>>${t.expected}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(t);
      }
      const status = resolveStatus(collapsed, deduped, parsedAny);
      const confidence = status === "ok" ? 0.85 : status === "collapsed" ? 0.5 : status === "unparsed" ? 0.35 : 0.2;
      return {
        ok: status === "ok",
        value: { status, tests: deduped },
        confidence,
        evidence,
        warnings
      };
    } catch (err) {
      return {
        ok: false,
        value: { status: "missing", tests: [] },
        confidence: 0,
        evidence: [`extract-samples-error:${err instanceof Error ? err.message : String(err)}`],
        warnings
      };
    }
  }
  function detectEditorEngine(doc) {
    if (doc.querySelector(MONACO_SELECTORS.root)) {
      return { engine: "monaco", root: doc.querySelector(MONACO_SELECTORS.root) };
    }
    if (doc.querySelector(ACE_SELECTORS.root)) {
      return { engine: "ace", root: doc.querySelector(ACE_SELECTORS.root) };
    }
    if (doc.querySelector(CODEMIRROR6_SELECTORS.root)) {
      return { engine: "codemirror6", root: doc.querySelector(CODEMIRROR6_SELECTORS.root) };
    }
    if (doc.querySelector(CODEMIRROR5_SELECTORS.root)) {
      return { engine: "codemirror5", root: doc.querySelector(CODEMIRROR5_SELECTORS.root) };
    }
    for (const sel of EDITOR_ROOT_SELECTORS) {
      const root = doc.querySelector(sel);
      if (root) return { engine: "unknown", root };
    }
    return { engine: "unknown", root: null };
  }
  function parseLineNumber(text) {
    const n = parseInt(text.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  function visibleRangeMonaco(root) {
    const nums = [...root.querySelectorAll(MONACO_SELECTORS.lineNumberCell)].map((el2) => parseLineNumber(el2.textContent ?? "")).filter((n) => n !== null);
    if (nums.length === 0) return { start: 1, end: 1 };
    return { start: Math.min(...nums), end: Math.max(...nums) };
  }
  function visibleRangeAce(root) {
    const nums = [...root.querySelectorAll(ACE_SELECTORS.gutter)].map((el2) => parseLineNumber(el2.textContent ?? "")).filter((n) => n !== null);
    if (nums.length === 0) return { start: 1, end: 1 };
    return { start: Math.min(...nums), end: Math.max(...nums) };
  }
  function visibleRangeCm5(root) {
    const nums = [...root.querySelectorAll(CODEMIRROR5_SELECTORS.gutter)].map((el2) => parseLineNumber(el2.textContent ?? "")).filter((n) => n !== null);
    if (nums.length === 0) return { start: 1, end: 1 };
    return { start: Math.min(...nums), end: Math.max(...nums) };
  }
  function visibleRangeCm6(root) {
    const nums = [...root.querySelectorAll(CODEMIRROR6_SELECTORS.gutter)].map((el2) => parseLineNumber(el2.textContent ?? "")).filter((n) => n !== null);
    if (nums.length === 0) return { start: 1, end: 1 };
    return { start: Math.min(...nums), end: Math.max(...nums) };
  }
  function extractMonacoLines(root) {
    const lines = [...root.querySelectorAll(MONACO_SELECTORS.viewLine)];
    return lines.map((l) => mapWhitespaceGlyphs(l.textContent ?? "")).join("\n");
  }
  function extractAceLines(root) {
    const lines = [...root.querySelectorAll(ACE_SELECTORS.line)];
    return lines.map((l) => mapWhitespaceGlyphs(l.textContent ?? "")).join("\n");
  }
  function extractCm5Lines(root) {
    const lines = [...root.querySelectorAll(CODEMIRROR5_SELECTORS.line)];
    return lines.map((l) => mapWhitespaceGlyphs(l.textContent ?? "")).join("\n");
  }
  function extractCm6Lines(root) {
    const lines = [...root.querySelectorAll(CODEMIRROR6_SELECTORS.line)];
    return lines.map((l) => mapWhitespaceGlyphs(l.textContent ?? "")).join("\n");
  }
  function guessFileName(root, doc) {
    const tab = doc.querySelector('.editor-tab.active, .file-tab.active, [data-testid="active-file"]') ?? root.closest("[data-filename]");
    const fromAttr = tab?.getAttribute("data-filename") ?? root.getAttribute("data-filename");
    if (fromAttr) return fromAttr;
    const label = tab?.textContent?.trim();
    if (label && /\.c\b/i.test(label)) return label;
    return "main.c";
  }
  function extractEditor(doc) {
    const evidence = [];
    const warnings = [];
    try {
      const { engine, root } = detectEditorEngine(doc);
      if (!root) {
        return {
          ok: false,
          value: null,
          confidence: 0,
          evidence: ["no-editor"],
          warnings
        };
      }
      evidence.push(`engine:${engine}`);
      let text = "";
      let range = { start: 1, end: 1 };
      switch (engine) {
        case "monaco":
          text = extractMonacoLines(root);
          range = visibleRangeMonaco(root);
          break;
        case "ace":
          text = extractAceLines(root);
          range = visibleRangeAce(root);
          break;
        case "codemirror5":
          text = extractCm5Lines(root);
          range = visibleRangeCm5(root);
          break;
        case "codemirror6":
          text = extractCm6Lines(root);
          range = visibleRangeCm6(root);
          break;
        default:
          text = mapWhitespaceGlyphs(root.textContent ?? "");
          range = { start: 1, end: Math.max(1, text.split("\n").length) };
          warnings.push("unknown-engine-fallback");
      }
      text = toLf(text);
      const partial = range.start !== 1;
      if (partial) {
        warnings.push("partial-editor");
        evidence.push(`visible-lines:${range.start}-${range.end}`);
      }
      const fileName = guessFileName(root, doc);
      const confidence = partial ? 0.55 : text.length > 0 ? 0.88 : 0.3;
      return {
        ok: text.length > 0,
        value: {
          engine,
          fileName,
          text,
          visibleLineStart: range.start,
          visibleLineEnd: range.end,
          partial,
          source: "dom"
        },
        confidence,
        evidence,
        warnings
      };
    } catch (err) {
      return {
        ok: false,
        value: null,
        confidence: 0,
        evidence: [`extract-editor-error:${err instanceof Error ? err.message : String(err)}`],
        warnings
      };
    }
  }
  async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    if (typeof globalThis.crypto?.subtle?.digest === "function") {
      const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    throw new Error("Web Crypto SHA-256 is unavailable");
  }
  async function signatureFromParts(statement, samples, editor) {
    const payload = `${statement}
---
${samples}
---
${editor}`;
    return sha256Hex(payload);
  }
  function serializeSamples(samples) {
    return samples.tests.map((t) => `IN:${t.input}
OUT:${t.expected}`).join("\n---\n");
  }
  function normalizeStatement(question) {
    const parts = [
      question.heading,
      question.statement,
      question.constraints,
      question.inputFormat,
      question.outputFormat
    ].map((p) => stripTimerNoise(normalizeText(p))).filter(Boolean);
    return parts.join("\n\n");
  }
  function normalizeEditorForSignature(editor) {
    return stripTimerNoise(mapWhitespaceGlyphs(normalizeText(editor.text)));
  }
  async function buildSignature(question, samples, editor) {
    const statement = normalizeStatement(question);
    const sampleBlock = serializeSamples(samples);
    const editorBlock = normalizeEditorForSignature(editor);
    return signatureFromParts(statement, sampleBlock, editorBlock);
  }
  function logStageTiming(enabled, stage, startedAt, fields = {}) {
    if (!enabled) return;
    const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
    console.info("[ctc-timing]", { stage, elapsedMs, ...fields });
  }
  async function captureSnapshot(tabId, frameId, doc, debugTimings = false) {
    const captureStarted = performance.now();
    let stageStarted = performance.now();
    const probe = pageProbe(doc);
    const probeMs = performance.now() - stageStarted;
    logStageTiming(debugTimings, "browser_page_probe", stageStarted, { pageKind: probe.kind });
    stageStarted = performance.now();
    const question = extractQuestion(doc);
    const questionExtractionMs = performance.now() - stageStarted;
    logStageTiming(debugTimings, "browser_question_extraction", stageStarted);
    stageStarted = performance.now();
    const samples = extractSamples(doc);
    const sampleExtractionMs = performance.now() - stageStarted;
    logStageTiming(debugTimings, "browser_sample_extraction", stageStarted);
    stageStarted = performance.now();
    const editor = extractEditor(doc);
    const editorExtractionMs = performance.now() - stageStarted;
    logStageTiming(debugTimings, "browser_editor_extraction", stageStarted);
    stageStarted = performance.now();
    const signature = await buildSignature(
      question.value ?? { heading: "", statement: "", constraints: "", inputFormat: "", outputFormat: "" },
      samples.value ?? { tests: [] },
      editor.value ?? {
        text: ""
      }
    );
    const signatureMs = performance.now() - stageStarted;
    logStageTiming(debugTimings, "snapshot_signature", stageStarted);
    const captureTiming = {
      probeMs,
      questionExtractionMs,
      sampleExtractionMs,
      editorExtractionMs,
      mainWorldEditorMs: 0,
      signatureMs,
      totalMs: performance.now() - captureStarted
    };
    const snapshot = {
      tabId,
      frameId,
      probe,
      question,
      samples,
      editor,
      signature,
      capturedAt: Date.now(),
      captureTiming
    };
    logStageTiming(debugTimings, "browser_capture_total", captureStarted, {
      pageKind: probe.kind,
      questionFound: question.ok,
      samplesFound: samples.ok,
      editorFound: editor.ok
    });
    return snapshot;
  }
  const MUTATION_DEBOUNCE_MS = 400;
  const URL_POLL_MS = 500;
  function startChangeTracker(doc, getSignature, onSignatureChange, options = {}) {
    const debounceMs = options.debounceMs ?? MUTATION_DEBOUNCE_MS;
    const urlPollMs = options.urlPollMs ?? URL_POLL_MS;
    let lastSignature = null;
    let debounceTimer = null;
    let abortController = null;
    let disposed = false;
    const win = doc.defaultView;
    const scheduleCheck = () => {
      if (disposed) return;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void checkSignature();
      }, debounceMs);
    };
    const checkSignature = async (_reason) => {
      if (disposed) return;
      try {
        const sig = await getSignature();
        if (sig === lastSignature) return;
        lastSignature = sig;
        abortController?.abort();
        abortController = new AbortController();
        onSignatureChange(sig, abortController.signal);
      } catch {
      }
    };
    const observer = new MutationObserver(() => scheduleCheck());
    const target = doc.body ?? doc.documentElement;
    if (target) {
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    }
    let lastPath = "";
    try {
      lastPath = win?.location.pathname ?? "";
    } catch {
      lastPath = "";
    }
    const urlTimer = setInterval(() => {
      if (disposed || !win) return;
      let path = "";
      try {
        path = win.location.pathname;
      } catch {
        return;
      }
      if (path !== lastPath) {
        lastPath = path;
        void checkSignature();
      }
    }, urlPollMs);
    void checkSignature();
    return () => {
      disposed = true;
      observer.disconnect();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      clearInterval(urlTimer);
      abortController?.abort();
    };
  }
  const MAX_NODES = 400;
  const MAX_DEPTH = 12;
  function hostnameOnly(doc) {
    try {
      return doc.defaultView?.location?.hostname ?? "";
    } catch {
      return "";
    }
  }
  function collectAttrNames(el2, prefix) {
    const names = [];
    for (const attr of el2.attributes) {
      if (attr.name.startsWith(prefix)) names.push(attr.name);
    }
    return names.sort();
  }
  function walk(el2, depth, tagCounts) {
    if (depth > MAX_DEPTH) return null;
    const tag = el2.tagName.toLowerCase();
    tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    const report = {
      tag,
      classes: [...el2.classList].slice(0, 20),
      ariaNames: collectAttrNames(el2, "aria-"),
      dataAttrNames: collectAttrNames(el2, "data-"),
      childCount: el2.childElementCount
    };
    const id = el2.id?.trim();
    if (id) report.id = id.slice(0, 80);
    const role = el2.getAttribute("role");
    if (role) report.role = role;
    if (depth < MAX_DEPTH && el2.childElementCount > 0) {
      const children = [];
      for (const child of el2.children) {
        if (children.length >= 40) break;
        const sub = walk(child, depth + 1, tagCounts);
        if (sub) children.push(sub);
      }
      if (children.length) report.children = children;
    }
    return report;
  }
  function buildPageStructureReport(doc) {
    const tagCounts = {};
    const { engine } = detectEditorEngine(doc);
    const iframes = doc.querySelectorAll("iframe");
    let editorIframeCount = 0;
    for (const frame of iframes) {
      if (IFRAME_EDITOR_SELECTORS.some((sel) => frame.matches(sel))) editorIframeCount += 1;
    }
    const rootEl = doc.body ?? doc.documentElement;
    let root = null;
    if (rootEl) {
      root = walk(rootEl, 0, tagCounts);
      const total = Object.values(tagCounts).reduce((a, b) => a + b, 0);
      if (total > MAX_NODES) tagCounts["_truncated"] = total;
    }
    return {
      hostname: hostnameOnly(doc),
      editorEngine: engine,
      iframeCount: iframes.length,
      editorIframeCount,
      tagCounts,
      root
    };
  }
  function firstMismatch(expectedLines, actualLines, whitespaceTolerant) {
    const n = Math.max(expectedLines.length, actualLines.length);
    for (let i = 0; i < n; i++) {
      const e = expectedLines[i] ?? "";
      const a = actualLines[i] ?? "";
      const ee = e.replace(/\s+/g, " ").trim();
      const aa = a.replace(/\s+/g, " ").trim();
      if (ee === aa) continue;
      let col = 0;
      const max = Math.max(e.length, a.length);
      for (; col < max; col++) {
        if (e[col] !== a[col]) break;
      }
      return { line: i + 1, column: col + 1, expected: e, actual: a };
    }
    return null;
  }
  function likelyTypos(actual) {
    const hints = [];
    const opens = (actual.match(/\{/g) ?? []).length;
    const closes = (actual.match(/\}/g) ?? []).length;
    if (opens !== closes) hints.push("unbalanced { }");
    const parensOpen = (actual.match(/\(/g) ?? []).length;
    const parensClose = (actual.match(/\)/g) ?? []).length;
    if (parensOpen !== parensClose) hints.push("unbalanced ( )");
    if (/int\s+main\s*\([^)]*\)\s*\{[^}]*$/.test(actual) && !/;/.test(actual.split("\n").slice(-3).join(""))) {
      hints.push("missing ;");
    }
    return hints;
  }
  const BADGE_COPY = {
    passedTooltip: "Hidden tests are not checked. This only ran the samples visible on the page."
  };
  function badgeLabel(badge) {
    switch (badge.kind) {
      case "PASSED_VISIBLE_SAMPLES":
        return `PASSED VISIBLE SAMPLES (${badge.compareMode})`;
      case "PARTIAL":
        return `PARTIAL (${badge.passed} of ${badge.total} samples)`;
      case "COMPILE_ERROR":
        return "COMPILE ERROR";
      case "UNVERIFIED_HELPER_OFF":
        return "UNVERIFIED: HELPER OFF";
      case "UNVERIFIED_NO_SAMPLES":
        return "UNVERIFIED: NO SAMPLES READ";
      case "UNVERIFIED_PARTIAL_EDITOR":
        return "UNVERIFIED: PARTIAL EDITOR CAPTURE";
      case "STALE":
        return "STALE: page changed";
      case "NEEDS_YOUR_DECISION":
        return `NEEDS YOUR DECISION (${badge.reason})`;
      default:
        return "UNVERIFIED";
    }
  }
  function isLenientMode(mode) {
    return mode === "trimmed" || mode === "whitespaceInsensitive" || mode === "echoAware";
  }
  const PANEL_CSS = `
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
.ctc-operation-status { min-height: 1.2em; margin: 4px 0; color: var(--muted, #666); }
.ctc-operation-status.ok { color: var(--ok); }
.ctc-operation-status.bad { color: var(--bad); }
.ctc-ask { border-top: 1px solid var(--line); margin-top: 10px; padding-top: 8px; }
.ctc-ask h3 { font-size: 14px; margin: 4px 0 8px; }
.ctc-ask textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 60px; border: 1px solid var(--line); border-radius: 8px; padding: 7px; color: var(--ink); background: transparent; font: inherit; }
.ctc-ask-preview { max-height: 140px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px Consolas, "Cascadia Mono", monospace; border: 1px solid var(--line); border-radius: 8px; padding: 6px; }
.ctc-ask-answer { white-space: pre-wrap; overflow-wrap: anywhere; }
.ctc-editor-report pre { white-space: pre-wrap; overflow-wrap: anywhere; }
button:disabled { opacity: .65; cursor: wait; }
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
  const KW = /^(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool|_Complex|_Imaginary)\b/;
  function tokenizeC(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      if (src[i] === "/" && src[i + 1] === "/") {
        const end = src.indexOf("\n", i);
        const n = end === -1 ? src.length : end;
        out.push({ kind: "cmt", text: src.slice(i, n) });
        i = n;
        continue;
      }
      if (src[i] === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        const n = end === -1 ? src.length : end + 2;
        out.push({ kind: "cmt", text: src.slice(i, n) });
        i = n;
        continue;
      }
      if (src[i] === '"' || src[i] === "'") {
        const q = src[i];
        let j = i + 1;
        while (j < src.length && src[j] !== q) {
          if (src[j] === "\\") j += 2;
          else j += 1;
        }
        out.push({ kind: "str", text: src.slice(i, j + 1) });
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(src[i] ?? "")) {
        let j = i;
        while (j < src.length && /[0-9.]/.test(src[j] ?? "")) j += 1;
        out.push({ kind: "num", text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (/[A-Za-z_]/.test(src[i] ?? "")) {
        let j = i;
        while (j < src.length && /\w/.test(src[j] ?? "")) j += 1;
        const word = src.slice(i, j);
        out.push({ kind: KW.test(word) ? "kw" : "plain", text: word });
        i = j;
        continue;
      }
      out.push({ kind: "plain", text: src[i] ?? "" });
      i += 1;
    }
    return out;
  }
  function renderHighlighted(pre, code, changedLines) {
    pre.replaceChildren();
    const lines = code.split("\n");
    lines.forEach((line, idx) => {
      const row = pre.ownerDocument.createElement("div");
      row.className = "ctc-line" + (changedLines?.has(idx + 1) ? " ctc-changed" : "");
      const num = pre.ownerDocument.createElement("span");
      num.className = "ctc-ln";
      num.textContent = String(idx + 1);
      const body = pre.ownerDocument.createElement("span");
      body.className = "ctc-lc";
      for (const tok of tokenizeC(line + "\n")) {
        const s = pre.ownerDocument.createElement("span");
        s.className = `ctc-t-${tok.kind}`;
        s.textContent = tok.text;
        body.appendChild(s);
      }
      row.append(num, body);
      pre.appendChild(row);
    });
  }
  const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/g;
  const ID_LIKE_RE = /\b(?:USN|REG|ID|ROLL)[:\s#-]*[A-Z0-9]{5,}\b/gi;
  const LONG_DIGIT_RE = /\b\d{10,}\b/g;
  function redactText(input) {
    let count = 0;
    const bump = () => {
      count += 1;
      return "[REDACTED]";
    };
    let text = input.replace(EMAIL_RE, bump);
    text = text.replace(ID_LIKE_RE, bump);
    text = text.replace(PHONE_RE, (m) => {
      const digits = m.replace(/\D/g, "");
      if (digits.length < 10) return m;
      count += 1;
      return "[REDACTED]";
    });
    text = text.replace(LONG_DIGIT_RE, bump);
    return { text, redactedCount: count };
  }
  function redactObjectDeep(value) {
    if (typeof value === "string") {
      return redactText(value).text;
    }
    if (Array.isArray(value)) {
      return value.map((v) => redactObjectDeep(v));
    }
    if (value && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = redactObjectDeep(v);
      }
      return out;
    }
    return value;
  }
  const FORBIDDEN_PHRASES = /\b(correct|safe to submit)\b/i;
  function mountPanel(doc, handlers, settings) {
    const existing = doc.getElementById("ctc-assistant-host");
    existing?.remove();
    const host = doc.createElement("div");
    host.id = "ctc-assistant-host";
    host.style.position = "fixed";
    host.style.zIndex = "2147483646";
    host.style.right = "16px";
    host.style.bottom = "16px";
    host.style.width = "380px";
    host.style.height = "56px";
    host.setAttribute("data-ctc", "host");
    doc.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = PANEL_CSS;
    const root = doc.createElement("div");
    root.className = "ctc-root";
    root.setAttribute("role", "complementary");
    root.setAttribute("aria-label", "CT-C Assistant");
    const theme = settings.theme === "system" ? matchMediaSafe(doc, "(prefers-color-scheme: dark)") ? "dark" : "light" : settings.theme;
    root.dataset.theme = theme;
    const header = el(doc, "div", "ctc-header");
    header.setAttribute("role", "button");
    const pill = el(doc, "span", "ctc-pill");
    pill.textContent = "CT-C: Idle";
    const toggle = btn(doc, "Show", "ghost");
    header.append(pill, toggle);
    const body = el(doc, "div", "ctc-body");
    body.hidden = true;
    const banner = el(doc, "div", "ctc-banner");
    banner.hidden = true;
    const status = el(doc, "p", "ctc-muted");
    status.id = "ctc-status";
    const badgeEl = el(doc, "span", "ctc-badge");
    badgeEl.hidden = true;
    const views = el(doc, "div", "");
    const actions = el(doc, "div", "ctc-actions");
    const operationStatus = el(doc, "p", "ctc-operation-status");
    operationStatus.setAttribute("role", "status");
    const utilityActions = el(doc, "div", "ctc-actions");
    const bRestore = btn(doc, "Restore previous", "ghost");
    const bDiagnose = btn(doc, "Diagnose editor", "ghost");
    const bPick = btn(doc, "Pick code box", "ghost");
    bRestore.hidden = true;
    utilityActions.append(bRestore, bDiagnose, bPick);
    const editorReport = el(doc, "details", "ctc-editor-report");
    const editorReportSummary = el(doc, "summary", "");
    editorReportSummary.textContent = "Editor diagnosis";
    const editorReportCopy = btn(doc, "Copy diagnosis", "ghost");
    const editorReportPre = el(doc, "pre", "ctc-code");
    editorReport.append(editorReportSummary, editorReportCopy, editorReportPre);
    editorReport.hidden = true;
    const askSection = el(doc, "section", "ctc-ask");
    const askHeading = el(doc, "h3", "");
    askHeading.textContent = "Ask Anything";
    const askInput = doc.createElement("textarea");
    askInput.rows = 3;
    askInput.maxLength = 8e3;
    askInput.placeholder = "Ask a coding or programming question";
    askInput.setAttribute("aria-label", "Ask Anything question");
    const askButtons = el(doc, "div", "ctc-actions");
    const bReadScreen = btn(doc, "Read screen", "ghost");
    const bAsk = btn(doc, "Ask");
    askButtons.append(bReadScreen, bAsk);
    const askPreviewLabel = el(doc, "p", "ctc-muted");
    askPreviewLabel.textContent = "Preview of the message sent:";
    const askPreview = el(doc, "pre", "ctc-ask-preview");
    const askAnswer = el(doc, "div", "ctc-ask-answer");
    askSection.append(askHeading, askInput, askButtons, askPreviewLabel, askPreview, askAnswer);
    const resize = el(doc, "div", "ctc-resize");
    const bResuggest = btn(doc, "Re-suggest");
    const bStrong = btn(doc, "Try stronger model", "ghost");
    const bVerify = btn(doc, "Verify now", "ghost");
    const bApprove = btn(doc, "Approve");
    const bCopy = btn(doc, "Copy", "ghost");
    const bPayload = btn(doc, "Show exactly what was sent to Gemini", "ghost");
    const bReport = btn(doc, "Report a problem", "ghost");
    const bMute = btn(doc, "Mute for this page", "ghost");
    const bCheck = btn(doc, "Check my code", "ghost");
    const bAnyway = btn(doc, "Run anyway", "ghost");
    bAnyway.hidden = true;
    actions.append(bResuggest, bStrong, bVerify, bApprove, bCopy, bCheck, bAnyway, bPayload, bReport, bMute);
    body.append(banner, status, badgeEl, views, actions, operationStatus, utilityActions, editorReport, askSection);
    root.append(header, body, resize);
    shadow.append(style, root);
    let expanded = false;
    let current = null;
    let approvedCode = "";
    let lastCode = "";
    let readScreenForMessage = false;
    let screenContextForMessage;
    let currentPreview = "";
    let currentEditorReport = "";
    const setExpanded = (v) => {
      expanded = v;
      body.hidden = !v;
      host.style.height = v ? `${settings.panelPosition?.h ?? 420}px` : "56px";
      host.style.width = `${settings.panelPosition?.w ?? 380}px`;
      toggle.textContent = v ? "Hide" : "Show";
    };
    if (settings.panelPosition) {
      host.style.left = `${settings.panelPosition.x}px`;
      host.style.top = `${settings.panelPosition.y}px`;
      host.style.right = "auto";
      host.style.bottom = "auto";
      host.style.width = `${settings.panelPosition.w}px`;
    }
    toggle.addEventListener("click", () => setExpanded(!expanded));
    const stopKeys = (ev) => {
      ev.stopPropagation();
    };
    root.addEventListener("keydown", stopKeys);
    root.addEventListener("keyup", stopKeys);
    root.addEventListener("keypress", stopKeys);
    root.addEventListener("input", stopKeys);
    root.addEventListener("beforeinput", stopKeys);
    root.addEventListener("paste", stopKeys);
    let drag = null;
    header.addEventListener("mousedown", (ev) => {
      drag = { dx: ev.clientX - host.getBoundingClientRect().left, dy: ev.clientY - host.getBoundingClientRect().top };
    });
    const onMove = (ev) => {
      if (!drag) return;
      host.style.left = `${ev.clientX - drag.dx}px`;
      host.style.top = `${ev.clientY - drag.dy}px`;
      host.style.right = "auto";
      host.style.bottom = "auto";
    };
    const onUp = () => {
      if (drag) {
        persistPos();
      }
      drag = null;
    };
    shadow.addEventListener("mousemove", onMove);
    shadow.addEventListener("mouseup", onUp);
    let resizing = false;
    resize.addEventListener("mousedown", () => {
      resizing = true;
    });
    shadow.addEventListener("mousemove", (ev) => {
      const e = ev;
      if (!resizing) return;
      const r = host.getBoundingClientRect();
      host.style.width = `${Math.max(280, e.clientX - r.left)}px`;
      host.style.height = `${Math.max(120, e.clientY - r.top)}px`;
    });
    shadow.addEventListener("mouseup", () => {
      if (resizing) persistPos();
      resizing = false;
    });
    function persistPos() {
      const r = host.getBoundingClientRect();
      handlers.onPosition({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    bResuggest.addEventListener("click", () => handlers.onResuggest());
    bStrong.addEventListener("click", () => handlers.onStronger());
    bVerify.addEventListener("click", () => handlers.onVerify());
    bApprove.addEventListener("click", () => {
      if (current?.answer && "final_code" in current.answer) {
        approvedCode = current.answer.final_code;
      }
      handlers.onApprove();
    });
    bCopy.addEventListener("click", () => handlers.onCopy(lastCode));
    bPayload.addEventListener("click", () => handlers.onShowPayload());
    bReport.addEventListener("click", () => handlers.onReport());
    bMute.addEventListener("click", () => handlers.onMute());
    bCheck.addEventListener("click", () => handlers.onCheckMyCode());
    bAnyway.addEventListener("click", () => handlers.onRunAnyway());
    bRestore.addEventListener("click", async (event) => {
      if (!event.isTrusted) return;
      setOperationStatus("Restoring the previous editor text…");
      try {
        const result = await handlers.onRestore();
        setOperationStatus(result.ok ? `Restored (${result.lineCount ?? 0} lines).` : result.error ?? "Restore failed.", result.ok);
        if (result.ok) bRestore.hidden = true;
      } catch {
        setOperationStatus("Restore failed. The editor may have changed or navigated.", false);
      }
    });
    bDiagnose.addEventListener("click", async (event) => {
      if (!event.isTrusted) return;
      setOperationStatus("Scanning editor frames…");
      try {
        const result = await handlers.onDiagnoseEditor();
        if (!result.ok || !result.report) {
          setOperationStatus(result.error ?? "Could not diagnose the editor.", false);
          return;
        }
        setEditorReport(result.report);
        setOperationStatus("Editor diagnosis is ready to copy.", true);
      } catch {
        setOperationStatus("Could not diagnose the editor.", false);
      }
    });
    bPick.addEventListener("click", async (event) => {
      if (!event.isTrusted) return;
      setOperationStatus("Choose the code editor on the page. Press Escape to cancel.");
      try {
        const result = await handlers.onPickEditor();
        if (!result.ok) setOperationStatus(result.error ?? "No editor candidates were found.", false);
      } catch {
        setOperationStatus("Could not start editor picking.", false);
      }
    });
    editorReportCopy.addEventListener("click", () => handlers.onCopy(currentEditorReport));
    const refreshAskPreview = () => {
      const payload = {
        question: askInput.value.trim(),
        ...readScreenForMessage ? { screenContext: screenContextForMessage } : {}
      };
      currentPreview = JSON.stringify(redactObjectDeep(payload), null, 2);
      askPreview.textContent = currentPreview;
    };
    askInput.addEventListener("input", refreshAskPreview);
    bReadScreen.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      try {
        screenContextForMessage = handlers.onReadScreen();
        readScreenForMessage = true;
        refreshAskPreview();
        setOperationStatus("Visible screen context is included in this message preview.", true);
      } catch {
        screenContextForMessage = void 0;
        readScreenForMessage = false;
        setOperationStatus("Could not read the current visible screen.", false);
      }
    });
    bAsk.addEventListener("click", async (event) => {
      if (!event.isTrusted) return;
      const question = askInput.value.trim();
      if (!question) {
        setOperationStatus("Write a question first.", false);
        return;
      }
      bAsk.disabled = true;
      askAnswer.textContent = "Thinking…";
      try {
        const result = await handlers.onAsk(question, readScreenForMessage ? screenContextForMessage : void 0);
        if (!result.ok) {
          askAnswer.textContent = result.error ?? "The request failed.";
        } else {
          askAnswer.textContent = `${result.answer ?? ""}${result.apiKeySlot ? `

Answered using ${slotName(result.apiKeySlot)}.` : ""}`;
        }
      } catch {
        askAnswer.textContent = "The request failed. Check the API key and try again.";
      } finally {
        bAsk.disabled = false;
        askInput.value = "";
        readScreenForMessage = false;
        screenContextForMessage = void 0;
        refreshAskPreview();
      }
    });
    refreshAskPreview();
    function setState(state, extra) {
      pill.textContent = `CT-C: ${labelFor(state)}`;
      status.textContent = extra ?? state;
      if (FORBIDDEN_PHRASES.test(status.textContent)) status.textContent = state;
    }
    function setBanner(text) {
      banner.hidden = !text;
      banner.textContent = text;
    }
    function setOperationStatus(text, ok) {
      operationStatus.textContent = text;
      operationStatus.classList.toggle("ok", ok === true);
      operationStatus.classList.toggle("bad", ok === false);
    }
    function setEditorReport(report) {
      editorReport.hidden = false;
      editorReportPre.textContent = report;
      currentEditorReport = report;
    }
    function setSuggestion(s) {
      current = s;
      renderBadge(badgeEl, s.badge);
      views.replaceChildren();
      if (s.cached) {
        const c = el(doc, "p", "ctc-muted");
        c.textContent = "cached";
        views.appendChild(c);
      }
      if (s.badge.kind === "NEEDS_YOUR_DECISION" && !s.answer) {
        const p = el(doc, "p", "");
        p.textContent = `Local guess vs model: ${s.classification.type}. Pick a type:`;
        views.appendChild(p);
        for (const t of ["complete_program", "fill_in_blank", "debugging", "mcq_multi", "mcq_single"]) {
          const b = btn(doc, t, "ghost");
          b.addEventListener("click", () => handlers.onTypePick(t));
          views.appendChild(b);
        }
      }
      const ans = s.answer;
      let codeActionRow = null;
      if (s.apiKeySlot) {
        const slotInfo = el(doc, "p", "ctc-muted");
        slotInfo.textContent = `Answered using ${slotName(s.apiKeySlot)}.`;
        views.appendChild(slotInfo);
      }
      if (ans && "final_code" in ans) {
        lastCode = ans.final_code;
        if (settings.hintFirst) {
          const expl = el(doc, "div", "");
          for (const line of ans.explanation) {
            const p = el(doc, "p", "");
            p.textContent = line;
            expl.appendChild(p);
          }
          const reveal = btn(doc, "Reveal code", "ghost");
          const pre = el(doc, "div", "ctc-code");
          pre.hidden = true;
          reveal.addEventListener("click", () => {
            pre.hidden = false;
            if (codeActionRow) codeActionRow.hidden = false;
          });
          views.append(expl, reveal, pre);
          renderHighlighted(pre, ans.final_code, new Set(ans.edits.map((e) => e.line)));
        } else if (ans.type === "fill_in_blank") {
          const table = doc.createElement("table");
          const head = doc.createElement("tr");
          for (const h of ["Line", "Where", "Type this"]) {
            const th = doc.createElement("th");
            th.textContent = h;
            head.appendChild(th);
          }
          table.appendChild(head);
          for (const ed of ans.edits) {
            const tr = doc.createElement("tr");
            for (const cell of [String(ed.line), ed.before, ed.after]) {
              const td = doc.createElement("td");
              td.textContent = cell;
              tr.appendChild(td);
            }
            table.appendChild(tr);
          }
          const pre = el(doc, "div", "ctc-code");
          renderHighlighted(pre, ans.final_code, new Set(ans.edits.map((e) => e.line)));
          views.append(table, pre);
          for (const line of ans.explanation) {
            const p = el(doc, "p", "");
            p.textContent = line;
            views.appendChild(p);
          }
        } else if (ans.type === "debugging") {
          const ul = doc.createElement("ul");
          for (const b of ans.bugs) {
            const li = doc.createElement("li");
            li.textContent = `L${b.line}: ${b.issue} → ${b.fix}`;
            ul.appendChild(li);
          }
          const pre = el(doc, "div", "ctc-code");
          renderHighlighted(pre, ans.final_code);
          views.append(ul, pre);
        } else {
          const pre = el(doc, "div", "ctc-code");
          renderHighlighted(pre, ans.final_code);
          views.appendChild(pre);
          for (const line of ans.explanation) {
            const p = el(doc, "p", "");
            p.textContent = line;
            views.appendChild(p);
          }
        }
        bAnyway.hidden = !/file I\/O/i.test(s.badge.kind === "NEEDS_YOUR_DECISION" ? s.badge.reason : "");
        const writeButtons = el(doc, "div", "ctc-actions");
        codeActionRow = writeButtons;
        writeButtons.hidden = settings.hintFirst;
        const write = btn(doc, "Write to editor");
        const copyAnswer = btn(doc, "Copy", "ghost");
        write.addEventListener("click", async (event) => {
          if (!event.isTrusted) return;
          setOperationStatus("Writing to the selected editor…");
          try {
            const result = await handlers.onWrite(s);
            setOperationStatus(result.ok ? `Written (${result.lineCount ?? 0} lines).` : result.error ?? "The editor rejected the write.", result.ok);
            bRestore.hidden = !result.restoreAvailable;
          } catch {
            setOperationStatus("The write failed. Copy the answer for manual pasting.", false);
          }
        });
        copyAnswer.addEventListener("click", () => handlers.onCopy(ans.final_code));
        writeButtons.append(write, copyAnswer);
        views.appendChild(writeButtons);
      } else if (ans && "options" in ans) {
        lastCode = ans.code_to_run ?? "";
        const ul = doc.createElement("ul");
        for (const o of ans.options) {
          const li = doc.createElement("li");
          li.textContent = `${o.correct ? "✓" : "✗"} ${o.id}: ${o.reason}`;
          ul.appendChild(li);
        }
        views.appendChild(ul);
        if (ans.selected.length) {
          const select = btn(doc, "Select answers");
          select.addEventListener("click", async (event) => {
            if (!event.isTrusted) return;
            setOperationStatus("Selecting only the proposed answers…");
            try {
              const result = await handlers.onSelectMcq(s);
              setOperationStatus(result.ok ? `Selected ${result.selectedIds?.join(", ") ?? ans.selected.join(", ")}. No submission was made.` : result.error ?? "Some proposed answers were not found.", result.ok);
            } catch {
              setOperationStatus("Could not select the proposed answers.", false);
            }
          });
          const copyAnswer = btn(doc, "Copy", "ghost");
          copyAnswer.addEventListener("click", () => handlers.onCopy(ans.code_to_run ?? ans.selected.join(", ")));
          const controls = el(doc, "div", "ctc-actions");
          controls.append(select, copyAnswer);
          views.appendChild(controls);
        }
      }
      if (s.history.length) {
        const d = doc.createElement("details");
        const sum = doc.createElement("summary");
        sum.textContent = "Attempt history";
        d.appendChild(sum);
        for (const h of s.history) {
          const p = el(doc, "p", "ctc-muted");
          p.textContent = `#${h.attempt} ${h.status} ${h.detail ?? ""}`;
          d.appendChild(p);
        }
        views.appendChild(d);
      }
      if (settings.autoExpand && (s.answer || s.badge.kind === "NEEDS_YOUR_DECISION")) {
        setExpanded(true);
      }
    }
    function setCompare(editorText) {
      if (!approvedCode) return;
      const exp = approvedCode.split("\n");
      const act = editorText.split("\n");
      const mismatch = firstMismatch(exp, act);
      const box = el(doc, "div", "ctc-banner");
      if (!mismatch) {
        box.textContent = `Compare: ${Math.min(exp.length, act.length)} lines matching.`;
      } else {
        const typos = likelyTypos(editorText);
        box.textContent = `First mismatch line ${mismatch.line} col ${mismatch.column}. Expected «${mismatch.expected}» got «${mismatch.actual}». ${typos.join("; ")}`;
      }
      views.prepend(box);
    }
    function renderBadge(target, badge) {
      target.hidden = false;
      target.textContent = badgeLabel(badge);
      target.title = badge.kind === "PASSED_VISIBLE_SAMPLES" ? BADGE_COPY.passedTooltip : "";
      target.classList.toggle(
        "warn",
        badge.kind === "PASSED_VISIBLE_SAMPLES" && isLenientMode(badge.compareMode)
      );
      target.classList.toggle("bad", badge.kind === "COMPILE_ERROR" || badge.kind === "PARTIAL");
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
      host
    };
  }
  function el(doc, tag, cls) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function btn(doc, label, cls = "") {
    const b = doc.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (cls) b.className = cls;
    return b;
  }
  function slotName(slot) {
    return slot === "backup1" ? "Backup 1" : slot === "backup2" ? "Backup 2" : "Primary";
  }
  function labelFor(state) {
    switch (state) {
      case "Idle":
        return "Ready";
      case "Reading":
        return "Reading";
      case "WaitingForSamples":
        return "Waiting for samples";
      case "Thinking":
        return "Thinking";
      case "Verifying":
        return "Verifying";
      case "Ready":
        return "Ready";
      case "NeedsDecision":
        return "Needs you";
      case "Error":
        return "Error";
      case "QuizIgnored":
        return "Quiz off";
      case "Stale":
        return "Stale";
      default:
        return state;
    }
  }
  function matchMediaSafe(doc, q) {
    try {
      return Boolean(doc.defaultView?.matchMedia(q).matches);
    } catch {
      return false;
    }
  }
  const isTop = window === window.top;
  let panel = null;
  let lastSnapshotSignature = "";
  let lastEditorText = "";
  let approved = false;
  let muted = false;
  let keepAlivePort = null;
  let disposeTracker = null;
  let publicSettings = null;
  let lastSuggestion = null;
  let latestTrackedSnapshot = null;
  let quizInert = pageProbe(document).kind === "quiz";
  let editorPickCleanup = null;
  function send(type, payload) {
    if (quizInert) return;
    try {
      void chrome.runtime.sendMessage({ type, payload }).catch(() => showInvalidated());
    } catch {
      showInvalidated();
    }
  }
  function showInvalidated() {
    disposeTracker?.();
    panel?.setBanner("Reload this page");
    panel?.setState("Error", "Reload this page");
  }
  function clearEditorPicker() {
    editorPickCleanup?.();
    editorPickCleanup = null;
  }
  function startEditorPicker(selectors) {
    clearEditorPicker();
    const outlines = /* @__PURE__ */ new Map();
    for (const selector of selectors) {
      try {
        for (const node of document.querySelectorAll(selector)) {
          outlines.set(node, { outline: node.style.outline, outlineOffset: node.style.outlineOffset });
          node.style.outline = "3px solid #ff9800";
          node.style.outlineOffset = "2px";
        }
      } catch {
      }
    }
    const onClick = (event) => {
      if (!event.isTrusted) return;
      const path = event.composedPath().filter((item) => item instanceof Element);
      for (const target of path) {
        let matchedSelector;
        for (const selector of selectors) {
          try {
            if (target.matches(selector)) {
              matchedSelector = selector;
              break;
            }
          } catch {
          }
        }
        if (!matchedSelector) continue;
        clearEditorPicker();
        send("EDITOR_PICKED", { selector: matchedSelector, pageHost: window.location.hostname });
        return;
      }
    };
    const onKeydown = (event) => {
      if (event.key !== "Escape") return;
      clearEditorPicker();
      send("CANCEL_EDITOR_PICK", {});
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeydown, true);
    editorPickCleanup = () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeydown, true);
      for (const [node, previous] of outlines) {
        node.style.outline = previous.outline;
        node.style.outlineOffset = previous.outlineOffset;
      }
    };
  }
  function ensurePanel() {
    if (!isTop || panel) return;
    panel = mountPanel(
      document,
      {
        onResuggest: () => send("REQUEST_SUGGEST", { snapshot: void 0 }),
        onStronger: () => send("REQUEST_SUGGEST", { stronger: true }),
        onVerify: () => send("VERIFY_CODE", verifyPayload()),
        onApprove: () => {
          approved = true;
          send("APPROVE", { signature: lastSnapshotSignature });
        },
        onCopy: (text) => {
          void navigator.clipboard.writeText(text).then(() => {
            panel?.setOperationStatus("Copied.", true);
          }).catch(() => {
            panel?.setOperationStatus("Clipboard access was unavailable. Select and copy the text manually.", false);
          });
        },
        onShowPayload: () => {
          panel?.setBanner(JSON.stringify(lastSuggestion?.redactedPayloadPreview ?? {}, null, 2).slice(0, 4e3));
        },
        onReport: () => send("REPORT_PROBLEM", { report: buildPageStructureReport(document) }),
        onMute: () => {
          muted = true;
          send("MUTE_PAGE", { signature: lastSnapshotSignature });
          panel?.setState("Idle", "Muted for this page");
        },
        onCheckMyCode: () => send("CHECK_MY_CODE", verifyPayload(lastEditorText)),
        onTypePick: (t) => send("TYPE_PICK", { signature: lastSnapshotSignature, type: t }),
        onNotQuiz: () => send("NOT_QUIZ", { signature: lastSnapshotSignature }),
        onRunAnyway: () => send("VERIFY_CODE", { ...verifyPayload(), allowFileIo: true }),
        onPosition: (pos) => send("SET_SETTINGS", { panelPosition: pos }),
        onWrite: async (suggestion) => {
          const result = await chrome.runtime.sendMessage({
            type: "WRITE_ANSWER",
            payload: { signature: suggestion.signature, suggestion }
          });
          return result;
        },
        onRestore: async () => await chrome.runtime.sendMessage({
          type: "RESTORE_WRITE",
          payload: {}
        }),
        onDiagnoseEditor: async () => await chrome.runtime.sendMessage({
          type: "DIAGNOSE_EDITOR",
          payload: {}
        }),
        onPickEditor: async () => await chrome.runtime.sendMessage({
          type: "PICK_EDITOR",
          payload: {}
        }),
        onSelectMcq: async (suggestion) => {
          const answer = suggestion.answer && "options" in suggestion.answer ? suggestion.answer : null;
          return await chrome.runtime.sendMessage({
            type: "SELECT_MCQ_ANSWERS",
            payload: {
              signature: suggestion.signature,
              type: suggestion.classification.type,
              optionIds: answer?.selected ?? []
            }
          });
        },
        onReadScreen: () => {
          const snapshot = latestTrackedSnapshot;
          if (!snapshot) throw new Error("No visible page snapshot is available.");
          return redactObjectDeep({
            question: snapshot.question.value?.statement.slice(0, 8e3) ?? "",
            constraints: snapshot.question.value?.constraints.slice(0, 2e3) ?? "",
            visibleEditor: snapshot.editor.value?.text.slice(0, 12e3) ?? "",
            visibleSamples: (snapshot.samples.value?.tests ?? []).slice(0, 8).map((test) => ({
              input: test.input.slice(0, 1e3),
              expected: test.expected.slice(0, 1e3)
            }))
          });
        },
        onAsk: async (question, screenContext) => await chrome.runtime.sendMessage({
          type: "ASK_ANYTHING",
          payload: { question, ...screenContext === void 0 ? {} : { includeScreen: true, screenContext } }
        })
      },
      {
        autoExpand: publicSettings?.autoExpand ?? true,
        hintFirst: publicSettings?.hintFirst ?? false,
        theme: publicSettings?.theme ?? "system",
        panelPosition: publicSettings?.panelPosition ?? null
      }
    );
  }
  function verifyPayload(code) {
    const tests = lastSuggestion ? lastSuggestion.redactedPayloadPreview?.samples?.tests ?? [] : [];
    const fromAnswer = lastSuggestion?.answer && "final_code" in lastSuggestion.answer ? lastSuggestion.answer.final_code : "";
    return { code: code ?? fromAnswer, tests };
  }
  async function reportFrame(knownSnapshot) {
    if (quizInert) return;
    const snapshot = knownSnapshot ?? await captureSnapshot(0, 0, document, publicSettings?.logging ?? false);
    const probe = snapshot.probe;
    if (probe.kind === "quiz") {
      send("ABORT", { signature: lastSnapshotSignature });
      quizInert = true;
      disposeTracker?.();
      stopKeepAlive();
      panel?.destroy();
      panel = null;
      return;
    }
    if (muted) return;
    if (!chrome.runtime?.id) {
      showInvalidated();
      return;
    }
    if (probe.kind === "other" && probe.confidence < 0.4) {
      if (isTop) {
        ensurePanel();
        panel?.setState("Idle", "Couldn't read this page reliably");
      }
    }
    lastSnapshotSignature = snapshot.signature;
    lastEditorText = snapshot.editor.value?.text ?? "";
    if (approved && panel) panel.setCompare(lastEditorText);
    send("FRAME_REPORT", { snapshot });
    if (!isTop) return;
    ensurePanel();
    if (probe.kind !== "coding") {
      panel?.setState("Idle", "Not sure this is a coding page");
      return;
    }
    if (snapshot.samples.value?.status === "collapsed") {
      panel?.setState("WaitingForSamples", "Expand Sample Test Cases on the page (we will not click it).");
    } else if (snapshot.editor.value?.partial) {
      panel?.setBanner("Scroll the editor to the top so line 1 is visible.");
      panel?.setState("Reading");
    } else {
      panel?.setState("Reading");
      panel?.setBanner("");
    }
  }
  function startKeepAlive() {
    try {
      keepAlivePort?.disconnect();
    } catch {
    }
    try {
      keepAlivePort = chrome.runtime.connect({ name: "keepalive" });
    } catch {
      showInvalidated();
    }
  }
  function stopKeepAlive() {
    try {
      keepAlivePort?.disconnect();
    } catch {
    }
    keepAlivePort = null;
  }
  if (!quizInert) chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (quizInert) {
      sendResponse({ ok: false });
      return;
    }
    if (message.type === "TOGGLE_PANEL" && isTop) {
      ensurePanel();
      panel?.toggle();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "EDITOR_PICK_MODE") {
      const payload = message.payload;
      startEditorPicker(Array.isArray(payload.selectors) ? payload.selectors : []);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "PICK_EDITOR_CANCEL") {
      clearEditorPicker();
      if (isTop) panel?.setOperationStatus("Editor picking canceled.");
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "EDITOR_PICKED") {
      clearEditorPicker();
      if (isTop) panel?.setOperationStatus("Editor choice saved for this hostname.");
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "DIAGNOSTICS_REPORT") {
      sendResponse({
        ok: true,
        report: JSON.stringify(buildPageStructureReport(document), null, 2)
      });
      return;
    }
    if (message.type === "PIPELINE_STATUS" && isTop) {
      const p = message.payload;
      ensurePanel();
      panel?.setState(p.state, p.error);
      if (p.state === "Thinking") startKeepAlive();
      if (p.state === "Ready" || p.state === "Error" || p.state === "Stale") stopKeepAlive();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "SUGGESTION" && isTop) {
      ensurePanel();
      lastSuggestion = message.payload;
      panel?.setSuggestion(lastSuggestion);
      panel?.setState(
        lastSuggestion.badge.kind === "STALE" ? "Stale" : lastSuggestion.badge.kind === "NEEDS_YOUR_DECISION" ? "NeedsDecision" : "Ready"
      );
      stopKeepAlive();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: true });
  });
  if (!quizInert) void chrome.runtime.sendMessage({ type: "GET_SETTINGS", payload: {} }).then((res) => {
    publicSettings = res?.settings ?? null;
    disposeTracker = startChangeTracker(document, async () => {
      latestTrackedSnapshot = await captureSnapshot(
        0,
        0,
        document,
        publicSettings?.logging ?? false
      );
      return latestTrackedSnapshot.signature;
    }, (sig) => {
      if (sig !== lastSnapshotSignature && lastSuggestion) {
        panel?.setState("Stale", "Page changed — previous suggestion is STALE.");
      }
      const snapshot = latestTrackedSnapshot?.signature === sig ? latestTrackedSnapshot : void 0;
      void reportFrame(snapshot);
    });
  }).catch(() => {
    showInvalidated();
  });
  if (!quizInert) {
    setInterval(() => {
      if (!chrome.runtime?.id) showInvalidated();
    }, 4e3);
  }
})();
//# sourceMappingURL=content.js.map

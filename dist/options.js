import { H as HOST_CONFIG, D as DEFAULT_SETTINGS } from "./chunks/hostConfig-D1V8GLrr.js";
const $ = (id) => document.getElementById(id);
const SLOT_IDS = ["primary", "backup1", "backup2"];
const SETTINGS_STORAGE_KEY = "ctc_settings_v1";
async function getSettings() {
  const res = await chrome.runtime.sendMessage({
    type: "GET_SETTINGS",
    payload: {}
  });
  return res?.settings ?? { ...DEFAULT_SETTINGS, apiKeySlots: {
    primary: { configured: false, last4: "", model: "", status: "" },
    backup1: { configured: false, last4: "", model: "", status: "" },
    backup2: { configured: false, last4: "", model: "", status: "" }
  } };
}
async function setSettings(patch) {
  await chrome.runtime.sendMessage({ type: "SET_SETTINGS", payload: patch });
}
async function savePendingSlotSettings() {
  const partialSlots = {};
  for (const id of SLOT_IDS) {
    const key = $(`key-${id}`);
    const model = $(`model-${id}`);
    const slotPatch = {};
    if (key.dataset.dirty === "1") slotPatch.apiKey = key.value.trim();
    if (key.dataset.clear === "1") slotPatch.apiKey = "";
    if (model.dataset.dirty === "1") slotPatch.model = model.value.trim();
    if (Object.keys(slotPatch).length) partialSlots[id] = slotPatch;
  }
  if (Object.keys(partialSlots).length) {
    await chrome.runtime.sendMessage({ type: "SET_SETTINGS", payload: { apiKeySlots: partialSlots } });
  }
}
function updateSlotMeta(s) {
  for (const id of SLOT_IDS) {
    const slot = s.apiKeySlots[id];
    const saved = slot.configured ? `Saved key ending ${slot.last4}.` : "No key saved.";
    $(`slot-meta-${id}`).textContent = [saved, slot.status].filter(Boolean).join(" ");
  }
}
function fillModels(select, models, current) {
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = models.length ? "Select…" : "Load models first";
  select.appendChild(empty);
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if (m === current) opt.selected = true;
    select.appendChild(opt);
  }
}
async function refreshUi() {
  const s = await getSettings();
  const consent = $("consent");
  const main = $("main-options");
  if (!s.consentAccepted) {
    consent.hidden = false;
  } else {
    consent.hidden = true;
  }
  main.style.opacity = s.consentAccepted ? "1" : "0.5";
  for (const id of SLOT_IDS) {
    const key = $(`key-${id}`);
    const model = $(`model-${id}`);
    const slot = s.apiKeySlots[id];
    key.value = "";
    key.dataset.dirty = "";
    key.dataset.clear = "";
    model.value = slot.model ?? "";
    model.dataset.dirty = "";
  }
  updateSlotMeta(s);
  fillModels($("fast-model"), s.models, s.fastModel);
  fillModels($("strong-model"), s.models, s.strongModel);
  $("auto-suggest").checked = s.autoSuggest;
  $("auto-expand").checked = s.autoExpand;
  $("auto-verify").checked = s.autoVerify;
  $("hint-first").checked = s.hintFirst;
  $("o2-ub").checked = s.o2UbCheck;
  $("c-standard").value = s.cStandard;
  $("test-timeout").value = String(s.testTimeoutMs);
  $("helper-port").value = String(s.helperPort || HOST_CONFIG.helperPort);
  $("helper-token").value = s.helperToken ? "••••••••" : "";
  $("helper-token").dataset.dirty = "";
  $("logging").checked = s.logging;
  $("write-mode").value = s.writeMode;
  $("typing-animation").checked = s.typingAnimation;
  $("typing-speed").value = String(s.typingCharsPerSecond);
  $("daily-count").textContent = String(s.dailyRequestCount);
}
function setStatus(id, text, ok) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("ok", ok === true);
  el.classList.toggle("bad", ok === false);
}
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] ?? 0 : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round(value * 10) / 10;
}
function formatPerformanceReport(records) {
  const fields = [
    ["total", "totalMs"],
    ["browser probe", "browserProbeMs"],
    ["question extraction", "questionExtractionMs"],
    ["sample extraction", "sampleExtractionMs"],
    ["editor extraction", "editorExtractionMs"],
    ["main-world editor read", "mainWorldEditorMs"],
    ["signature", "signatureMs"],
    ["prompt construction", "promptBuildMs"],
    ["Gemini request", "modelRequestMs"],
    ["response parsing", "responseParseMs"],
    ["GCC compilation", "gccCompileMs"],
    ["sample execution", "sampleExecutionMs"],
    ["helper round trip", "helperRoundTripMs"]
  ];
  const lines = [
    `CT-C Assistant performance (${records.length} saved runs)`,
    "Local timings only. No page text, code, tests, keys, or credentials are included.",
    "",
    "Stage | median ms | slowest ms"
  ];
  for (const [label, key] of fields) {
    const values = records.map((record) => record[key]).filter((value) => typeof value === "number");
    const slowest = values.length ? Math.max(...values) : null;
    lines.push(`${label} | ${median(values) ?? "n/a"} | ${slowest === null ? "n/a" : Math.round(slowest * 10) / 10}`);
  }
  const totalTimes = records.map((record) => record.totalMs);
  lines.push("", `Slowest total observed: ${totalTimes.length ? `${Math.max(...totalTimes)} ms` : "n/a"}`, "");
  const byModelPath = /* @__PURE__ */ new Map();
  for (const record of records) {
    const path = record.modelIds.join(" -> ") || (record.cacheHit ? "cache" : "no model");
    const group = byModelPath.get(path) ?? [];
    group.push(record);
    byModelPath.set(path, group);
  }
  lines.push("By model path:");
  for (const [path, group] of byModelPath) {
    const groupTotal = group.map((record) => record.totalMs);
    const groupApi = group.map((record) => record.modelRequestMs);
    const tested = group.filter((record) => typeof record.sampleTestCount === "number");
    const compiled = group.filter((record) => typeof record.compileOk === "boolean");
    const passed = tested.reduce((sum, record) => sum + (record.sampleTestsPassed ?? 0), 0);
    const testCount = tested.reduce((sum, record) => sum + (record.sampleTestCount ?? 0), 0);
    const compileCount = compiled.filter((record) => record.compileOk).length;
    lines.push(
      `${path} | n=${group.length} | total median=${median(groupTotal) ?? "n/a"} ms | total slowest=${groupTotal.length ? Math.round(Math.max(...groupTotal) * 10) / 10 : "n/a"} ms | API median=${median(groupApi) ?? "n/a"} ms | GCC=${compiled.length ? `${compileCount}/${compiled.length}` : "n/a"} | visible samples=${testCount ? `${passed}/${testCount}` : "n/a"}`
    );
  }
  lines.push("Recent runs:");
  for (const record of records.slice(-20)) {
    lines.push([
      new Date(record.timestamp).toISOString(),
      record.modelIds.join(" -> ") || "cache/no model",
      `slot=${record.apiKeySlot ?? "n/a"}`,
      `total=${record.totalMs}ms`,
      `capture=${record.captureMs}ms`,
      `question=${record.questionExtractionMs}ms`,
      `prompt=${record.promptBuildMs}ms`,
      `api=${record.modelRequestMs}ms`,
      `parse=${record.responseParseMs}ms`,
      `gcc=${record.gccCompileMs}ms`,
      `tests=${record.sampleExecutionMs}ms`,
      `samples=${record.sampleTestCount === null ? "n/a" : `${record.sampleTestsPassed ?? 0}/${record.sampleTestCount}`}`,
      `tokens=${record.inputTokens ?? "n/a"}/${record.outputTokens ?? "n/a"}`,
      `attempts=${record.attempts}`,
      `retries=${record.retries}`,
      record.errorCode ? `error=${record.errorCode}${record.errorStatus ? `:${record.errorStatus}` : ""}` : ""
    ].filter(Boolean).join(" | "));
  }
  return lines.join("\n");
}
async function init() {
  await refreshUi();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_STORAGE_KEY]) return;
    void getSettings().then(updateSlotMeta).catch(() => {
      for (const id of SLOT_IDS) $(`slot-meta-${id}`).textContent = "Could not refresh key status.";
    });
  });
  $("accept-consent").addEventListener("click", async () => {
    try {
      await setSettings({ consentAccepted: true });
      await refreshUi();
    } catch {
      setStatus("model-status", "Could not save consent. Reopen Options and try again.", false);
    }
  });
  for (const id of SLOT_IDS) {
    const key = $(`key-${id}`);
    const model = $(`model-${id}`);
    key.addEventListener("input", () => {
      key.dataset.dirty = "1";
      key.dataset.clear = "";
    });
    model.addEventListener("input", () => {
      model.dataset.dirty = "1";
    });
    $(`show-${id}`).addEventListener("click", () => {
      key.type = key.type === "password" ? "text" : "password";
      $(`show-${id}`).textContent = key.type === "password" ? "Show" : "Hide";
    });
    $(`clear-${id}`).addEventListener("click", () => {
      key.value = "";
      key.dataset.clear = "1";
      key.dataset.dirty = "";
      setStatus(`slot-meta-${id}`, "Key will be removed when you save.", false);
    });
    $(`test-${id}`).addEventListener("click", async () => {
      const statusId = `slot-meta-${id}`;
      setStatus(statusId, `Testing ${id === "primary" ? "Primary" : id === "backup1" ? "Backup 1" : "Backup 2"}…`);
      try {
        const res = await chrome.runtime.sendMessage({
          type: "TEST_API_KEY_SLOT",
          payload: {
            slot: id,
            ...key.dataset.dirty === "1" ? { apiKey: key.value.trim() } : {},
            ...model.value.trim() ? { model: model.value.trim() } : {}
          }
        });
        setStatus(statusId, res.ok ? `Connection OK (${res.model}).` : res.error ?? "Key test failed.", res.ok);
      } catch {
        setStatus(statusId, "Key test failed. Check the connection and try again.", false);
      }
    });
  }
  $("helper-token").addEventListener("input", (e) => {
    e.target.dataset.dirty = "1";
  });
  $("save-key").addEventListener("click", async () => {
    try {
      await savePendingSlotSettings();
      const patch = {};
      patch.fastModel = $("fast-model").value;
      patch.strongModel = $("strong-model").value;
      patch.autoSuggest = $("auto-suggest").checked;
      patch.autoExpand = $("auto-expand").checked;
      patch.autoVerify = $("auto-verify").checked;
      patch.hintFirst = $("hint-first").checked;
      patch.o2UbCheck = $("o2-ub").checked;
      patch.cStandard = $("c-standard").value.trim() || "gnu11";
      patch.testTimeoutMs = Number($("test-timeout").value) || 2e3;
      patch.helperPort = Number($("helper-port").value) || HOST_CONFIG.helperPort;
      const tok = $("helper-token");
      if (tok.dataset.dirty === "1") patch.helperToken = tok.value.trim();
      patch.logging = $("logging").checked;
      patch.writeMode = $("write-mode").value === "insert" ? "insert" : "replace";
      patch.typingAnimation = $("typing-animation").checked;
      patch.typingCharsPerSecond = Math.max(1, Math.min(1e3, Number($("typing-speed").value) || 60));
      await setSettings(patch);
      setStatus("model-status", "Settings and key changes saved.", true);
      await refreshUi();
    } catch {
      setStatus("model-status", "Could not save settings. Try again.", false);
    }
  });
  $("load-models").addEventListener("click", async () => {
    setStatus("model-status", "Loading models…");
    try {
      await savePendingSlotSettings();
      const res = await chrome.runtime.sendMessage({
        type: "LOAD_MODELS",
        payload: {}
      });
      if (!res?.ok) {
        setStatus("model-status", res?.error ?? "Failed to load models", false);
        return;
      }
      setStatus(
        "model-status",
        `Loaded ${(res.models ?? []).length} models. Fast=${res.fast} Strong=${res.strong}`,
        true
      );
      await refreshUi();
    } catch (e) {
      setStatus("model-status", String(e), false);
    }
  });
  $("reset-api-status").addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({ type: "RESET_API_KEY_STATUS", payload: {} });
      await refreshUi();
      setStatus("model-status", "API key statuses reset.", true);
    } catch {
      setStatus("model-status", "Could not reset API key statuses.", false);
    }
  });
  $("test-helper").addEventListener("click", async () => {
    try {
      await setSettings({
        helperPort: Number($("helper-port").value) || HOST_CONFIG.helperPort,
        ...$("helper-token").dataset.dirty === "1" ? { helperToken: $("helper-token").value.trim() } : {}
      });
      setStatus("helper-status", "Testing…");
      const res = await chrome.runtime.sendMessage({ type: "TEST_HELPER", payload: {} });
      if (res?.ok) setStatus("helper-status", `OK — ${res.gccVersion ?? "gcc"}`, true);
      else setStatus("helper-status", res?.error ?? "Helper unreachable", false);
    } catch {
      setStatus("helper-status", "Helper test failed. Check the local helper and try again.", false);
    }
  });
  $("clear-cache").addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({ type: "SET_SETTINGS", payload: { __clearCache: true } });
      setStatus("model-status", "Cache cleared.", true);
    } catch {
      setStatus("model-status", "Could not clear the suggestion cache.", false);
    }
  });
  $("copy-performance").addEventListener("click", async () => {
    try {
      setStatus("performance-status", "Reading local timing records…");
      const res = await chrome.runtime.sendMessage({
        type: "GET_PERFORMANCE_RECORDS",
        payload: {}
      });
      const records = res?.records ?? [];
      if (records.length === 0) {
        setStatus("performance-status", "No records yet. Enable Local debug logs and run some questions.", false);
        return;
      }
      await navigator.clipboard.writeText(formatPerformanceReport(records));
      setStatus("performance-status", `Copied ${records.length} local timing records.`, true);
    } catch {
      setStatus("performance-status", "Could not copy the timing report. Check clipboard access.", false);
    }
  });
  $("copy-diag").addEventListener("click", async () => {
    try {
      setStatus("diag-status", "Requesting report from active CodeTantra tab…");
      const res = await chrome.runtime.sendMessage({
        type: "DIAGNOSTICS_REPORT",
        payload: {}
      });
      if (!res?.ok || !res.report) {
        setStatus("diag-status", res?.error ?? "Open a CodeTantra tab first.", false);
        return;
      }
      await navigator.clipboard.writeText(res.report);
      setStatus("diag-status", "Copied page-structure report to clipboard.", true);
    } catch {
      setStatus("diag-status", "Could not copy the report. Check clipboard access.", false);
    }
  });
  for (const id of [
    "auto-suggest",
    "auto-expand",
    "auto-verify",
    "hint-first",
    "o2-ub",
    "logging",
    "typing-animation",
    "write-mode"
  ]) {
    $(id).addEventListener("change", () => {
      void $("save-key").dispatchEvent(new Event("click"));
    });
  }
}
void init().catch(() => {
  setStatus("model-status", "Options could not load. Close and reopen this page.", false);
});
//# sourceMappingURL=options.js.map

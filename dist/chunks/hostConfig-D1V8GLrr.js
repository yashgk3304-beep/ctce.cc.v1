const DEFAULT_SETTINGS = {
  geminiApiKey: "",
  apiKeySlots: {
    primary: { apiKey: "", model: "" },
    backup1: { apiKey: "", model: "" },
    backup2: { apiKey: "", model: "" }
  },
  apiKeySlotStatus: {},
  fastModel: "",
  strongModel: "",
  models: [],
  autoSuggest: true,
  autoExpand: true,
  autoVerify: true,
  hintFirst: false,
  cStandard: "gnu11",
  testTimeoutMs: 2e3,
  helperPort: 47831,
  helperToken: "",
  consentAccepted: false,
  dailyRequestCount: 0,
  dailyRequestDate: "",
  theme: "system",
  logging: false,
  o2UbCheck: false,
  panelPosition: null,
  mutedPages: [],
  typeOverrides: {},
  notQuizOverrides: [],
  editorSelectorsByHost: {},
  writeMode: "replace",
  typingAnimation: false,
  typingCharsPerSecond: 60
};
const PROMPT_VERSION = "3";
const codeTantraMatch = "https://*.codetantra.com/*";
const geminiMatch = "https://generativelanguage.googleapis.com/*";
const helperPort = 47831;
const extensionName = "CT-C Assistant";
const extensionVersion = "0.1.0";
const minimumChromeVersion = "116";
const hostConfig = {
  codeTantraMatch,
  geminiMatch,
  helperPort,
  extensionName,
  extensionVersion,
  minimumChromeVersion
};
const HOST_CONFIG = {
  ...hostConfig,
  get helperMatch() {
    return `http://127.0.0.1:${this.helperPort}/*`;
  },
  helperHost: "127.0.0.1"
  /**
   * Chrome 116+: WebSocket keepalive / longer SW lifetime patterns we rely on.
   * scripting MAIN world: 102+. storage.session: 102+.
   */
};
export {
  DEFAULT_SETTINGS as D,
  HOST_CONFIG as H,
  PROMPT_VERSION as P
};
//# sourceMappingURL=hostConfig-D1V8GLrr.js.map

import type {
  ApiKeySlotId,
  Classification,
  PageSnapshot,
  PerformanceRecord,
  Settings,
  SuggestionAnswer,
} from '../shared/types';
import type { SuggestionPayload } from '../shared/messages';
import { cacheKey } from '../shared/hash';
import { redactObjectDeep } from '../shared/redact';
import {
  CLASSIFICATION_JSON_SCHEMA,
  CODE_ANSWER_JSON_SCHEMA,
  MCQ_ANSWER_JSON_SCHEMA,
  extractFirstFencedCode,
  parseJsonLoose,
  validateClassification,
  validateCodeAnswer,
  validateMcqAnswer,
} from '../shared/schemas';
import { badgeFromResults } from '../shared/badges';
import { staticScreen } from '../shared/staticScreen';
import { PROMPT_VERSION } from '../shared/types';
import { SuggestionCache } from './cache';
import { bestCompareMode, type MatchModes } from './compare';
import { classifyLlmFailure, jitterBackoffMs, sleep } from './errorHandling';
import { helperVerify, type HelperVerifyResult } from './helperClient';
import { getGeminiProvider } from './llm/geminiProvider';
import { LlmError, type LlmGenerateResult, type LlmProvider } from './llm/types';
import { MockLlmProvider } from './llm/mockProvider';
import {
  COMPLETE_ANSWER,
  DEBUG_ANSWER,
  FILL_IN_BLANK_ANSWER,
  MCQ_ANSWER,
} from './testAnswers';
import {
  PROMPTS,
  buildClassificationUserPayload,
  buildCodeAnswerUserPayload,
  buildMcqAnswerUserPayload,
  extractMcqOptions,
  simplifiedPrompt,
} from './prompts';
import { classifyStage1 } from '../content/classifier/stage1';
import { logStageTiming, safeErrorCode } from '../shared/timing';
import { appendPerformanceRecord } from './performanceStore';
import { generateWithApiKeyFallback, getConfiguredApiKeySlots } from './llm/keyFallback';
import { loadSettings, saveSettings } from './settingsStore';

export interface PipelineInput {
  snapshot: PageSnapshot;
  settings: Settings;
  cache: SuggestionCache;
  stronger: boolean;
  provider?: LlmProvider;
  signal?: AbortSignal;
  allowFileIo?: boolean;
  startedAt?: number;
}

interface PipelineMetrics {
  modelIds: string[];
  inputTokens: number;
  outputTokens: number;
  hasInputTokens: boolean;
  hasOutputTokens: boolean;
  attempts: number;
  retries: number;
  cacheHit: boolean;
  promptBuildMs: number;
  modelRequestMs: number;
  responseParseMs: number;
  gccCompileMs: number;
  sampleExecutionMs: number;
  helperRoundTripMs: number;
  compileOk: boolean | null;
  sampleTestsPassed: number | null;
  sampleTestCount: number | null;
  apiKeySlot?: ApiKeySlotId;
  lastModel?: string;
  errorCode?: string;
  errorStatus?: number;
}

function createPipelineMetrics(): PipelineMetrics {
  return {
    modelIds: [],
    inputTokens: 0,
    outputTokens: 0,
    hasInputTokens: false,
    hasOutputTokens: false,
    attempts: 0,
    retries: 0,
    cacheHit: false,
    promptBuildMs: 0,
    modelRequestMs: 0,
    responseParseMs: 0,
    gccCompileMs: 0,
    sampleExecutionMs: 0,
    helperRoundTripMs: 0,
    compileOk: null,
    sampleTestsPassed: null,
    sampleTestCount: null,
    apiKeySlot: undefined,
    lastModel: undefined,
  };
}

function testProvider(): LlmProvider {
  return new MockLlmProvider({
    generate: (opts) => {
      if (opts.responseSchema === CLASSIFICATION_JSON_SCHEMA) {
        if (/select all|checkbox/i.test(opts.userText)) {
          return JSON.stringify({ type: 'mcq_multi', confidence: 0.85, evidence: ['mock-mcq'] });
        }
        if (/choose one|select one|radio/i.test(opts.userText)) {
          return JSON.stringify({ type: 'mcq_single', confidence: 0.85, evidence: ['mock-mcq'] });
        }
        if (/fill in|missing code/i.test(opts.userText)) {
          return JSON.stringify({ type: 'fill_in_blank', confidence: 0.9, evidence: ['mock-fill'] });
        }
        if (/debug|missing semicolon/i.test(opts.userText)) {
          return JSON.stringify({ type: 'debugging', confidence: 0.9, evidence: ['mock-debug'] });
        }
        if (/sum of digits/i.test(opts.userText)) {
          return JSON.stringify({ type: 'complete_program', confidence: 0.9, evidence: ['mock-complete'] });
        }
        return JSON.stringify({ type: 'complete_program', confidence: 0.8, evidence: ['mock-complete'] });
      }
      if (opts.userText.includes('"typeHint":"mcq') || /checkbox|select all/i.test(opts.userText)) {
        return JSON.stringify(MCQ_ANSWER);
      }
      if (/debug|missing semicolon/i.test(opts.userText)) return JSON.stringify(DEBUG_ANSWER);
      if (/sum of digits/i.test(opts.userText)) return JSON.stringify(COMPLETE_ANSWER);
      return JSON.stringify(FILL_IN_BLANK_ANSWER);
    },
  });
}

function chooseProvider(settings: Settings, injected?: LlmProvider): LlmProvider {
  if (injected) return injected;
  if (typeof __TEST_HOST__ !== 'undefined' && __TEST_HOST__) return testProvider();
  return getGeminiProvider(settings.geminiApiKey);
}

function stage1FromSnapshot(snapshot: PageSnapshot): Classification {
  return classifyStage1({
    probeKind: snapshot.probe.kind,
    urlPath: '',
    heading: snapshot.question.value?.heading ?? '',
    statement: snapshot.question.value?.statement ?? '',
    editorText: snapshot.editor.value?.text ?? '',
  });
}

async function callJson(
  provider: LlmProvider,
  settings: Settings,
  opts: {
    model: string;
    system: string;
    user: string;
    schema: Record<string, unknown>;
    signal?: AbortSignal;
    maxOutputTokens?: number;
  },
): Promise<LlmGenerateResult> {
  return provider.generate({
    apiKey: settings.geminiApiKey,
    model: opts.model,
    systemInstruction: opts.system,
    userText: opts.user,
    temperature: 0.2,
    maxOutputTokens: opts.maxOutputTokens ?? 4096,
    responseSchema: opts.schema,
    signal: opts.signal,
    debugTimings: settings.logging,
  });
}

async function trackedCallJson(
  provider: LlmProvider,
  settings: Settings,
  metrics: PipelineMetrics,
  opts: {
    model: string;
    system: string;
    user: string;
    schema: Record<string, unknown>;
    signal?: AbortSignal;
    maxOutputTokens?: number;
  },
): Promise<LlmGenerateResult> {
  const requestStarted = performance.now();
  try {
    const result = provider.id === 'gemini'
      ? await generateWithApiKeyFallback(
          settings,
          opts.model,
          (slot, model) => callJson(
            getGeminiProvider(slot.apiKey),
            { ...settings, geminiApiKey: slot.apiKey, fastModel: model },
            { ...opts, model },
          ),
          async (id, status) => {
            const latest = await loadSettings();
            const next = { ...latest.apiKeySlotStatus };
            if (status) next[id] = status;
            else delete next[id];
            await saveSettings({ apiKeySlotStatus: next });
          },
        )
      : await callJson(provider, settings, opts);
    metrics.modelRequestMs += performance.now() - requestStarted;
    const attempts = Math.max(1, result.totalRequestAttempts ?? result.requestAttempts ?? 1);
    metrics.modelIds.push(...(result.modelPath ?? [result.model]));
    if (result.apiKeySlot) metrics.apiKeySlot = result.apiKeySlot;
    metrics.lastModel = result.model;
    metrics.attempts += attempts;
    metrics.retries += Math.max(0, attempts - 1);
    if (typeof result.usage?.inputTokens === 'number') {
      metrics.hasInputTokens = true;
      metrics.inputTokens += result.usage.inputTokens;
    }
    if (typeof result.usage?.outputTokens === 'number') {
      metrics.hasOutputTokens = true;
      metrics.outputTokens += result.usage.outputTokens;
    }
    return result;
  } catch (error) {
    metrics.modelRequestMs += performance.now() - requestStarted;
    const attempts = error instanceof LlmError ? error.requestAttempts ?? 1 : 1;
    metrics.attempts += Math.max(0, attempts);
    metrics.retries += Math.max(0, attempts - 1);
    metrics.errorCode = safeErrorCode(error);
    if (error instanceof LlmError && error.status !== undefined) {
      metrics.errorStatus = error.status;
    }
    throw error;
  }
}

function mergeMatches(results: HelperVerifyResult['results']): MatchModes {
  const acc: MatchModes = {
    strict: true,
    trimmed: true,
    whitespaceInsensitive: true,
    echoAware: true,
  };
  for (const r of results) {
    acc.strict = acc.strict && r.matches.strict;
    acc.trimmed = acc.trimmed && r.matches.trimmed;
    acc.whitespaceInsensitive = acc.whitespaceInsensitive && r.matches.whitespaceInsensitive;
    acc.echoAware = acc.echoAware && r.matches.echoAware;
  }
  if (results.length === 0) {
    return { strict: false, trimmed: false, whitespaceInsensitive: false, echoAware: false };
  }
  return acc;
}

async function runPipelineInternal(
  input: PipelineInput,
  metrics: PipelineMetrics,
): Promise<SuggestionPayload> {
  const { snapshot, settings, cache } = input;
  const history: SuggestionPayload['history'] = [];
  const stage1 = stage1FromSnapshot(snapshot);

  if (snapshot.probe.kind === 'quiz' || stage1.type === 'quiz') {
    return {
      signature: snapshot.signature,
      classification: { ...stage1, type: 'quiz' },
      answer: null,
      badge: { kind: 'NEEDS_YOUR_DECISION', reason: 'quiz' },
      cached: false,
      history: [{ attempt: 0, status: 'quiz-ignored' }],
    };
  }

  const model = input.stronger ? settings.strongModel || settings.fastModel : settings.fastModel;
  if (!model && !input.provider && !(typeof __TEST_HOST__ !== 'undefined' && __TEST_HOST__)) {
    throw new LlmError('No Gemini model is selected. Choose one from Load models in Options.', 'not_found');
  }
  const remembered = settings.typeOverrides[snapshot.signature];
  let stage2: Classification = remembered ? { ...stage1, type: remembered } : stage1;
  const configuredSlots = getConfiguredApiKeySlots(settings);
  const cacheModelPath = configuredSlots.length
    ? configuredSlots.map((slot) => `${slot.id}:${slot.model || model || settings.fastModel}`).join('|')
    : model || 'default';
  const key = await cacheKey(snapshot.signature, cacheModelPath, PROMPT_VERSION, stage2.type);
  const saveCached = (payload: SuggestionPayload) => cache.set(key, {
    ...payload,
    ...(metrics.lastModel ? { model: metrics.lastModel } : {}),
    ...(metrics.apiKeySlot ? { apiKeySlot: metrics.apiKeySlot } : {}),
  });
  await cache.hydrate();
  const hit = cache.get<SuggestionPayload>(key);
  if (hit) {
    metrics.cacheHit = true;
    return { ...hit, cached: true };
  }

  const provider = chooseProvider(settings, input.provider);
  const question = redactObjectDeep(snapshot.question.value);
  const samples = redactObjectDeep(snapshot.samples.value);
  const editor = redactObjectDeep(snapshot.editor.value);
  const redactedPayloadPreview = { question, samples, editor, typeHint: stage2.type };

  const editorOnlyFillHint = stage1.evidence.some((item) => item.startsWith('fill-blank-editor:'));
  const fallbackClassification = stage1.evidence.includes('complete-program-fallback');
  const shouldConfirmType =
    !remembered && !fallbackClassification && (stage1.confidence < 0.8 || editorOnlyFillHint);
  if (shouldConfirmType) {
    const promptStarted = performance.now();
    const user = buildClassificationUserPayload({
      heading: question?.heading ?? '',
      statement: question?.statement ?? '',
      editorExcerpt: editor?.text ?? '',
    });
    metrics.promptBuildMs += performance.now() - promptStarted;
    logStageTiming(settings.logging, 'prompt_construction', promptStarted, {
        modelId: model || 'test-model',
      requestKind: 'classification',
      inputChars: user.length,
    });
    let cls: LlmGenerateResult | undefined;
    try {
      cls = await trackedCallJson(provider, settings, metrics, {
        model: model || 'test-model',
        system: PROMPTS.classificationSystem,
        user,
        schema: CLASSIFICATION_JSON_SCHEMA,
        signal: input.signal,
        maxOutputTokens: 1024,
      });
    } catch {
      // The local classifier still requires the same manual confirmation.
    }
    if (cls) {
      const parseStarted = performance.now();
      let classificationValid = false;
      try {
        const parsed = validateClassification(parseJsonLoose(cls.text));
        classificationValid = parsed.success;
        if (parsed.success) stage2 = { ...parsed.data, stage: 2 };
      } catch {
        // Malformed classification is handled by the same manual decision gate.
      } finally {
        metrics.responseParseMs += performance.now() - parseStarted;
        if (!classificationValid) metrics.errorCode ??= 'invalid_json';
        logStageTiming(settings.logging, 'response_parsing', parseStarted, {
          modelId: cls.model,
          requestKind: 'classification',
          valid: classificationValid,
        });
      }
    }

    const disagreement = stage1.type !== stage2.type;
    const lowConfidence = Math.min(stage1.confidence, stage2.confidence) < 0.7;
    if (disagreement || lowConfidence || stage2.type === 'quiz' || stage2.type === 'unknown') {
      return {
        signature: snapshot.signature,
        classification: stage2,
        answer: null,
        badge: {
          kind: 'NEEDS_YOUR_DECISION',
          reason: stage2.type === 'quiz'
            ? 'quiz classification needs your decision'
            : disagreement
              ? `type disagreement (${stage1.type} vs ${stage2.type})`
              : 'low confidence',
        },
        cached: false,
        history,
        redactedPayloadPreview,
        model,
      };
    }
  }

  const isMcq = stage2.type === 'mcq_multi' || stage2.type === 'mcq_single';
  let answer: SuggestionAnswer | null = null;
  let rawText = '';

  const generateOnce = async (
    repairHint?: string,
    extraTokens?: number,
    simplify = false,
      requestModel = model || 'test-model',
  ): Promise<SuggestionAnswer> => {
    const promptStarted = performance.now();
    const user = isMcq
      ? (() => {
          const questionData = (question && typeof question === 'object'
            ? question
            : {}) as Record<string, unknown>;
          const parsedOptions = extractMcqOptions(String(questionData.statement ?? ''));
          return buildMcqAnswerUserPayload({
            question: { ...questionData, statement: parsedOptions.promptStatement },
            options: parsedOptions.options,
          });
        })()
      : buildCodeAnswerUserPayload({
          question,
          samples,
          editor,
          cStandard: settings.cStandard,
          typeHint: stage2.type,
        }) + (repairHint ? `\n<compiler_feedback>\n${repairHint}\n</compiler_feedback>` : '');
    metrics.promptBuildMs += performance.now() - promptStarted;
    logStageTiming(settings.logging, 'prompt_construction', promptStarted, {
      modelId: requestModel,
      requestKind: isMcq ? 'mcq_answer' : 'code_answer',
      inputChars: user.length,
      hasRepairFeedback: Boolean(repairHint),
      simplified: simplify,
    });
    const system = isMcq ? PROMPTS.mcqAnswerSystem : PROMPTS.codeAnswerSystem;
    const res = await trackedCallJson(provider, settings, metrics, {
      model: requestModel,
      system: simplify ? simplifiedPrompt(system) : system,
      user,
      schema: isMcq ? MCQ_ANSWER_JSON_SCHEMA : CODE_ANSWER_JSON_SCHEMA,
      signal: input.signal,
      maxOutputTokens: extraTokens ?? 4096,
    });
    rawText = res.text;
    if (res.finishReason === 'MAX_TOKENS') {
      metrics.errorCode = 'truncated';
      throw new LlmError('truncated', 'unknown');
    }
    const parseStarted = performance.now();
    let valid = false;
    let usedCodeFenceFallback = false;
    try {
      let json: unknown;
      try {
        json = parseJsonLoose(res.text);
      } catch (error) {
        const fencedCode = isMcq ? null : extractFirstFencedCode(res.text);
        if (!fencedCode) throw error;
        usedCodeFenceFallback = true;
        json = {
          type: stage2.type === 'fill_in_blank' ? 'fill_blanks' : stage2.type === 'debugging' ? 'debug' : 'program',
          language: 'c',
          code: `${fencedCode.trimEnd()}\n`,
          blanks: [],
          edits: [],
          bugs: [],
          explanation: ['Parsed the first fenced code block as a fallback.'],
          assumptions: [],
          confidence: 0.55,
        };
      }
      if (isMcq) {
        const v = validateMcqAnswer(json);
        valid = v.success;
        if (!v.success) throw new Error('schema mismatch');
        return v.data;
      }
      const v = validateCodeAnswer(json);
      valid = v.success;
      if (!v.success) throw new Error('schema mismatch');
      stage2 = {
        ...stage2,
        type: remembered ?? v.data.type,
        confidence: v.data.confidence,
        evidence: [...stage1.evidence, 'model-answer-type'],
        stage: 2,
      };
      return v.data;
    } finally {
      metrics.responseParseMs += performance.now() - parseStarted;
      if (!valid) metrics.errorCode ??= 'invalid_json';
      logStageTiming(settings.logging, 'response_parsing', parseStarted, {
        modelId: res.model,
        requestKind: isMcq ? 'mcq_answer' : 'code_answer',
        valid,
        usedCodeFenceFallback,
      });
    }
  };

  try {
    answer = await generateOnce();
  } catch (err) {
    const row = classifyLlmFailure(err);
    if (row.id === 'invalid_json' || String(err).includes('schema')) {
      try {
        answer = await generateOnce('Return valid JSON only matching the schema.');
      } catch {
        return {
          signature: snapshot.signature,
          classification: stage2,
          answer: null,
          badge: { kind: 'NEEDS_YOUR_DECISION', reason: 'invalid JSON' },
          cached: false,
          history: [{ attempt: 1, status: 'invalid-json', detail: rawText.slice(0, 2000) }],
          redactedPayloadPreview,
          model,
          error: rawText.slice(0, 4000),
        };
      }
    } else if (row.id === 'truncated') {
      answer = await generateOnce(undefined, 8192);
    } else if (row.id === 'blocked_or_empty') {
      answer = await generateOnce(undefined, undefined, true);
    } else {
      metrics.errorCode = safeErrorCode(err);
      if (err instanceof LlmError && err.status !== undefined) metrics.errorStatus = err.status;
      throw err;
    }
  }

  const expectedType = remembered ?? stage1.type;
  const modelConfidence = answer?.confidence ?? 0;
  const confidence = fallbackClassification
    ? modelConfidence
    : Math.min(stage1.confidence, modelConfidence);
  const typeDisagreement =
    !isMcq && !fallbackClassification && stage2.type !== expectedType;
  if ((typeDisagreement || confidence < 0.7) && !remembered) {
    const reason = typeDisagreement
      ? `type disagreement (${stage1.type} vs ${stage2.type})`
      : 'low confidence';
    return {
      signature: snapshot.signature,
      classification: stage2,
      answer,
      badge: { kind: 'NEEDS_YOUR_DECISION', reason },
      cached: false,
      history,
      redactedPayloadPreview,
      model,
    };
  }

  if (answer && 'needs_user_decision' in answer && answer.needs_user_decision) {
    const payload: SuggestionPayload = {
      signature: snapshot.signature,
      classification: stage2,
      answer,
      badge: { kind: 'NEEDS_YOUR_DECISION', reason: 'model unsure' },
      cached: false,
      history,
      redactedPayloadPreview,
      model,
    };
    await saveCached(payload);
    return payload;
  }

  const partialEditor = snapshot.editor.value?.partial === true;
  const tests = snapshot.samples.value?.tests ?? [];
  const noSamples =
    !snapshot.samples.value ||
    snapshot.samples.value.status !== 'ok' ||
    tests.length === 0;

  if (partialEditor) {
    const payload: SuggestionPayload = {
      signature: snapshot.signature,
      classification: stage2,
      answer,
      badge: { kind: 'UNVERIFIED_PARTIAL_EDITOR' },
      cached: false,
      history,
      redactedPayloadPreview,
      model,
    };
    await saveCached(payload);
    return payload;
  }

  const code =
    answer && 'final_code' in answer
      ? answer.final_code
      : answer && 'code_to_run' in answer
        ? answer.code_to_run
        : null;

  if (!code || isMcq) {
    const payload: SuggestionPayload = {
      signature: snapshot.signature,
      classification: stage2,
      answer,
      badge: noSamples
        ? { kind: 'UNVERIFIED_NO_SAMPLES' }
        : { kind: 'NEEDS_YOUR_DECISION', reason: 'mcq — not executed unless you run it' },
      cached: false,
      history,
      redactedPayloadPreview,
      model,
    };
    await saveCached(payload);
    return payload;
  }

  const screen = staticScreen(code);
  if (screen.blocked) {
    const payload: SuggestionPayload = {
      signature: snapshot.signature,
      classification: stage2,
      answer,
      badge: { kind: 'NEEDS_YOUR_DECISION', reason: 'blocked by static screen' },
      cached: false,
      history: [{ attempt: 0, status: 'static-block', detail: screen.reasons.join(',') }],
      redactedPayloadPreview,
      model,
    };
    return payload;
  }
  if (screen.needsRunAnyway && !input.allowFileIo) {
    const payload: SuggestionPayload = {
      signature: snapshot.signature,
      classification: stage2,
      answer,
      badge: { kind: 'NEEDS_YOUR_DECISION', reason: 'file I/O — click Run anyway' },
      cached: false,
      history,
      redactedPayloadPreview,
      model,
    };
    return payload;
  }

  if (!settings.helperToken) {
    const payload: SuggestionPayload = {
      signature: snapshot.signature,
      classification: stage2,
      answer,
      badge: { kind: 'UNVERIFIED_HELPER_OFF' },
      cached: false,
      history,
      redactedPayloadPreview,
      model,
    };
    await saveCached(payload);
    return payload;
  }

  if (noSamples) {
    const payload: SuggestionPayload = {
      signature: snapshot.signature,
      classification: stage2,
      answer,
      badge: { kind: 'UNVERIFIED_NO_SAMPLES' },
      cached: false,
      history,
      redactedPayloadPreview,
      model,
    };
    await saveCached(payload);
    return payload;
  }

  let lastVerify: HelperVerifyResult | null = null;
  let workingCode = code;
  for (let round = 0; round < 3; round++) {
    const verifyStarted = performance.now();
    try {
      const helperStarted = performance.now();
      lastVerify = await helperVerify(settings.helperPort, settings.helperToken, {
        code: workingCode,
        tests,
        std: settings.cStandard,
        timeoutMs: settings.testTimeoutMs,
        o2Check: settings.o2UbCheck,
        allowFileIo: input.allowFileIo,
        debugTimings: settings.logging,
      });
      metrics.helperRoundTripMs += performance.now() - helperStarted;
      metrics.gccCompileMs += lastVerify.timings?.gccCompileMs ?? 0;
      metrics.sampleExecutionMs +=
        lastVerify.timings?.sampleExecutionMs ??
        lastVerify.results.reduce((totalMs, result) => totalMs + result.ms, 0);
      metrics.compileOk = lastVerify.compile.ok;
      metrics.sampleTestsPassed = lastVerify.results.filter((r) => r.status === 'pass').length;
      metrics.sampleTestCount = lastVerify.results.length;
      logStageTiming(settings.logging, 'local_validation_round', verifyStarted, {
        round: round + 1,
        testCount: tests.length,
        compileOk: lastVerify.compile.ok,
        passedTests: lastVerify.results.filter((r) => r.status === 'pass').length,
      });
    } catch (e) {
      metrics.errorCode = safeErrorCode(e);
      logStageTiming(settings.logging, 'local_validation_round', verifyStarted, {
        round: round + 1,
        testCount: tests.length,
        errorCode: safeErrorCode(e),
      });
      history.push({ attempt: round, status: 'helper-error', detail: String(e) });
      const payload: SuggestionPayload = {
        signature: snapshot.signature,
        classification: stage2,
        answer,
        badge: { kind: 'UNVERIFIED_HELPER_OFF' },
        cached: false,
        history,
        redactedPayloadPreview,
        model,
      };
      return payload;
    }
    const passed = lastVerify.results.filter((r) => r.status === 'pass').length;
    history.push({
      attempt: round,
      status: lastVerify.compile.ok ? `pass-${passed}/${lastVerify.results.length}` : 'compile-error',
      detail: lastVerify.compile.errors.slice(0, 3).join('\n'),
    });
    if (lastVerify.compile.ok && passed === lastVerify.results.length) break;
    if (round >= 2) break;
    const feedback = lastVerify.compile.ok
      ? lastVerify.results.map((r) => `${r.id} ${r.status}\n${r.diff}`).join('\n')
      : lastVerify.compile.errors.join('\n');
    try {
      const repairModel =
        stage2.type === 'debugging' &&
        round === 0 &&
        !input.stronger &&
        settings.strongModel &&
        settings.strongModel !== model
          ? settings.strongModel
          : model || 'test-model';
      answer = await generateOnce(feedback, undefined, false, repairModel);
      if (answer && 'final_code' in answer) workingCode = answer.final_code;
    } catch {
      break;
    }
  }

  const passed = lastVerify?.results.filter((r) => r.status === 'pass').length ?? 0;
  const total = lastVerify?.results.length ?? tests.length;
  const aggregate = lastVerify ? mergeMatches(lastVerify.results) : undefined;
  const badge = badgeFromResults({
    helperOff: false,
    noSamples: false,
    partialEditor: false,
    compileOk: lastVerify?.compile.ok ?? false,
    errors: lastVerify?.compile.errors ?? [],
    passed,
    total,
    aggregateMatches: aggregate,
  });
  void bestCompareMode;

  const payload: SuggestionPayload = {
    signature: snapshot.signature,
    classification: stage2,
    answer,
    badge,
    cached: false,
    history,
    redactedPayloadPreview,
    model,
  };
  await saveCached(payload);
  return payload;
}

export async function runPipeline(input: PipelineInput): Promise<SuggestionPayload> {
  const startedAt = input.startedAt ?? performance.now();
  const pipelineStarted = performance.now();
  const metrics = createPipelineMetrics();
  const model = input.stronger
    ? input.settings.strongModel || input.settings.fastModel
    : input.settings.fastModel;
  let outcome = 'ok';
  try {
    const result = await runPipelineInternal(input, metrics);
    return {
      ...result,
      ...(metrics.lastModel ? { model: metrics.lastModel } : {}),
      ...(metrics.apiKeySlot ? { apiKeySlot: metrics.apiKeySlot } : {}),
    };
  } catch (error) {
    outcome = 'error';
    metrics.errorCode = safeErrorCode(error);
    if (error instanceof LlmError && error.status !== undefined) metrics.errorStatus = error.status;
    logStageTiming(input.settings.logging, 'pipeline_error', startedAt, {
      modelId: model || 'default',
      errorCode: safeErrorCode(error),
    });
    throw error;
  } finally {
    const processingMs = performance.now() - startedAt;
    const captureTiming = input.snapshot.captureTiming;
    const record: PerformanceRecord = {
      timestamp: Date.now(),
      modelIds: metrics.modelIds,
      apiKeySlot: metrics.apiKeySlot,
      inputTokens: metrics.hasInputTokens ? metrics.inputTokens : null,
      outputTokens: metrics.hasOutputTokens ? metrics.outputTokens : null,
      attempts: metrics.attempts,
      retries: metrics.retries,
      cacheHit: metrics.cacheHit,
      captureMs: captureTiming?.totalMs ?? 0,
      browserProbeMs: captureTiming?.probeMs ?? 0,
      questionExtractionMs: captureTiming?.questionExtractionMs ?? 0,
      sampleExtractionMs: captureTiming?.sampleExtractionMs ?? 0,
      editorExtractionMs: captureTiming?.editorExtractionMs ?? 0,
      mainWorldEditorMs: captureTiming?.mainWorldEditorMs ?? 0,
      signatureMs: captureTiming?.signatureMs ?? 0,
      promptBuildMs: Math.round(metrics.promptBuildMs * 10) / 10,
      modelRequestMs: Math.round(metrics.modelRequestMs * 10) / 10,
      responseParseMs: Math.round(metrics.responseParseMs * 10) / 10,
      gccCompileMs: Math.round(metrics.gccCompileMs * 10) / 10,
      sampleExecutionMs: Math.round(metrics.sampleExecutionMs * 10) / 10,
      helperRoundTripMs: Math.round(metrics.helperRoundTripMs * 10) / 10,
      compileOk: metrics.compileOk,
      sampleTestsPassed: metrics.sampleTestsPassed,
      sampleTestCount: metrics.sampleTestCount,
      totalMs: Math.round(((captureTiming?.totalMs ?? 0) + processingMs) * 10) / 10,
      ...(metrics.errorCode ? { errorCode: metrics.errorCode } : {}),
      ...(metrics.errorStatus !== undefined ? { errorStatus: metrics.errorStatus } : {}),
    };
    if (input.settings.logging) {
      await appendPerformanceRecord(record).catch(() => {});
      logStageTiming(input.settings.logging, 'pipeline_performance_summary', pipelineStarted, {
        modelIds: record.modelIds.join(' -> ') || model || 'default',
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        attempts: record.attempts,
        retries: record.retries,
        captureMs: record.captureMs,
        browserProbeMs: record.browserProbeMs,
        questionExtractionMs: record.questionExtractionMs,
        sampleExtractionMs: record.sampleExtractionMs,
        editorExtractionMs: record.editorExtractionMs,
        mainWorldEditorMs: record.mainWorldEditorMs,
        signatureMs: record.signatureMs,
        promptBuildMs: record.promptBuildMs,
        modelRequestMs: record.modelRequestMs,
        responseParseMs: record.responseParseMs,
        gccCompileMs: record.gccCompileMs,
        sampleExecutionMs: record.sampleExecutionMs,
        helperRoundTripMs: record.helperRoundTripMs,
        compileOk: record.compileOk,
        sampleTestsPassed: record.sampleTestsPassed,
        sampleTestCount: record.sampleTestCount,
        totalMs: record.totalMs,
        cacheHit: record.cacheHit,
        errorCode: record.errorCode ?? null,
        errorStatus: record.errorStatus ?? null,
      });
    }
    logStageTiming(input.settings.logging, 'pipeline_total', startedAt, {
      modelId: model || 'default',
      outcome,
    });
  }
}

export { jitterBackoffMs, sleep };

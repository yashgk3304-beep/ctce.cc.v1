import type { Classification, PageSnapshot, Settings, SuggestionAnswer } from '../shared/types';
import type { SuggestionPayload } from '../shared/messages';
import { cacheKey } from '../shared/hash';
import { redactObjectDeep } from '../shared/redact';
import {
  CLASSIFICATION_JSON_SCHEMA,
  CODE_ANSWER_JSON_SCHEMA,
  MCQ_ANSWER_JSON_SCHEMA,
  parseJsonLoose,
  validateClassification,
  validateCodeAnswer,
  validateMcqAnswer,
} from '../shared/schemas';
import { badgeFromResults } from '../shared/badges';
import { staticScreen } from '../shared/staticScreen';
import { PROMPT_VERSION } from '../shared/types';
import { SuggestionCache } from './cache';
import { allMatchModes, bestCompareMode, type MatchModes } from './compare';
import { classifyLlmFailure, jitterBackoffMs, sleep } from './errorHandling';
import { helperVerify, type HelperVerifyResult } from './helperClient';
import { GeminiProvider } from './llm/geminiProvider';
import { LlmError, type LlmProvider } from './llm/types';
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
  simplifiedPrompt,
} from './prompts';
import { classifyStage1 } from '../content/classifier/stage1';

export interface PipelineInput {
  snapshot: PageSnapshot;
  settings: Settings;
  cache: SuggestionCache;
  stronger: boolean;
  provider?: LlmProvider;
  signal?: AbortSignal;
  allowFileIo?: boolean;
}

function testProvider(): LlmProvider {
  return new MockLlmProvider({
    generate: (opts) => {
      if (opts.userText.includes('"typeHint":"mcq') || /checkbox|select all/i.test(opts.userText)) {
        return JSON.stringify(MCQ_ANSWER);
      }
      if (/debug|missing semicolon/i.test(opts.userText)) return JSON.stringify(DEBUG_ANSWER);
      if (/sum of digits/i.test(opts.userText)) return JSON.stringify(COMPLETE_ANSWER);
      if (opts.responseSchema === CLASSIFICATION_JSON_SCHEMA || /Classify/i.test(opts.systemInstruction)) {
        if (/fill in/i.test(opts.userText) || /Write the code/i.test(opts.userText)) {
          return JSON.stringify({
            type: 'fill_in_blank',
            confidence: 0.9,
            evidence: ['mock-fill'],
          });
        }
        if (/debug/i.test(opts.userText)) {
          return JSON.stringify({ type: 'debugging', confidence: 0.9, evidence: ['mock-debug'] });
        }
        if (/select all|checkbox/i.test(opts.userText)) {
          return JSON.stringify({ type: 'mcq_multi', confidence: 0.85, evidence: ['mock-mcq'] });
        }
        return JSON.stringify({
          type: 'complete_program',
          confidence: 0.8,
          evidence: ['mock-complete'],
        });
      }
      return JSON.stringify(FILL_IN_BLANK_ANSWER);
    },
  });
}

function chooseProvider(settings: Settings, injected?: LlmProvider): LlmProvider {
  if (injected) return injected;
  if (typeof __TEST_HOST__ !== 'undefined' && __TEST_HOST__) return testProvider();
  return new GeminiProvider(settings.geminiApiKey);
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
): Promise<{ text: string; finishReason?: string }> {
  return provider.generate({
    apiKey: settings.geminiApiKey,
    model: opts.model,
    systemInstruction: opts.system,
    userText: opts.user,
    temperature: 0.2,
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
    responseSchema: opts.schema,
    signal: opts.signal,
  });
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

export async function runPipeline(input: PipelineInput): Promise<SuggestionPayload> {
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
  const key = await cacheKey(snapshot.signature, model || 'default', PROMPT_VERSION);
  await cache.hydrate();
  const hit = cache.get<SuggestionPayload>(key);
  if (hit) {
    return { ...hit, cached: true };
  }

  const provider = chooseProvider(settings, input.provider);
  const question = redactObjectDeep(snapshot.question.value);
  const samples = redactObjectDeep(snapshot.samples.value);
  const editor = redactObjectDeep(snapshot.editor.value);
  const redactedPayloadPreview = { question, samples, editor, typeHint: stage1.type };

  let stage2: Classification = stage1;
  try {
    const cls = await callJson(provider, settings, {
      model: model || 'gemini-flash-latest',
      system: PROMPTS.classificationSystem,
      user: buildClassificationUserPayload({
        heading: question?.heading ?? '',
        statement: question?.statement ?? '',
        editorExcerpt: editor?.text ?? '',
      }),
      schema: CLASSIFICATION_JSON_SCHEMA,
      signal: input.signal,
      maxOutputTokens: 1024,
    });
    const parsed = validateClassification(parseJsonLoose(cls.text));
    if (parsed.success) {
      stage2 = { ...parsed.data, stage: 2 };
    }
  } catch {
    /* keep stage1 */
  }

  const disagree = stage1.type !== stage2.type;
  const low = Math.min(stage1.confidence, stage2.confidence) < 0.7;
  if (disagree || low) {
    const remembered = settings.typeOverrides[snapshot.signature];
    if (!remembered) {
      return {
        signature: snapshot.signature,
        classification: stage2,
        answer: null,
        badge: {
          kind: 'NEEDS_YOUR_DECISION',
          reason: disagree ? `type disagreement (${stage1.type} vs ${stage2.type})` : 'low confidence',
        },
        cached: false,
        history,
        redactedPayloadPreview,
        model,
      };
    }
    stage2 = { ...stage2, type: remembered };
  }

  const isMcq = stage2.type === 'mcq_multi' || stage2.type === 'mcq_single';
  let answer: SuggestionAnswer | null = null;
  let rawText = '';

  const generateOnce = async (repairHint?: string, extraTokens?: number) => {
    const user = isMcq
      ? buildMcqAnswerUserPayload({ question, options: [] })
      : buildCodeAnswerUserPayload({
          question,
          samples,
          editor,
          cStandard: settings.cStandard,
          typeHint: stage2.type,
        }) + (repairHint ? `\n<compiler_feedback>\n${repairHint}\n</compiler_feedback>` : '');
    const res = await callJson(provider, settings, {
      model: model || 'gemini-flash-latest',
      system: isMcq ? PROMPTS.mcqAnswerSystem : PROMPTS.codeAnswerSystem,
      user,
      schema: isMcq ? MCQ_ANSWER_JSON_SCHEMA : CODE_ANSWER_JSON_SCHEMA,
      signal: input.signal,
      maxOutputTokens: extraTokens ?? 8192,
    });
    rawText = res.text;
    if (res.finishReason === 'MAX_TOKENS') {
      throw new LlmError('truncated', 'unknown');
    }
    const json = parseJsonLoose(res.text);
    if (isMcq) {
      const v = validateMcqAnswer(json);
      if (!v.success) throw new Error('schema mismatch');
      answer = v.data;
    } else {
      const v = validateCodeAnswer(json);
      if (!v.success) throw new Error('schema mismatch');
      answer = v.data;
    }
  };

  try {
    await generateOnce();
  } catch (err) {
    const row = classifyLlmFailure(err);
    if (row.id === 'invalid_json' || String(err).includes('schema')) {
      try {
        await generateOnce('Return valid JSON only matching the schema.');
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
      await generateOnce(undefined, 16384);
    } else if (row.id === 'blocked_or_empty') {
      await generateOnce(undefined);
      await callJson(provider, settings, {
        model: model || 'gemini-flash-latest',
        system: simplifiedPrompt(PROMPTS.codeAnswerSystem),
        user: buildCodeAnswerUserPayload({
          question,
          samples,
          editor,
          cStandard: settings.cStandard,
          typeHint: stage2.type,
        }),
        schema: CODE_ANSWER_JSON_SCHEMA,
        signal: input.signal,
      }).catch(() => undefined);
    } else {
      throw err;
    }
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
    await cache.set(key, payload);
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
    await cache.set(key, payload);
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
    await cache.set(key, payload);
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
    await cache.set(key, payload);
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
    await cache.set(key, payload);
    return payload;
  }

  let lastVerify: HelperVerifyResult | null = null;
  let workingCode = code;
  for (let round = 0; round < 3; round++) {
    try {
      lastVerify = await helperVerify(settings.helperPort, settings.helperToken, {
        code: workingCode,
        tests,
        std: settings.cStandard,
        timeoutMs: settings.testTimeoutMs,
        o2Check: settings.o2UbCheck,
        allowFileIo: input.allowFileIo,
      });
    } catch (e) {
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
      await generateOnce(feedback);
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
  await cache.set(key, payload);
  return payload;
}

export { jitterBackoffMs, sleep };

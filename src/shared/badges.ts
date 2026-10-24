import type { CompareMode, VerificationBadge } from './types';
import type { MatchModes } from '../background/compare';
import { bestCompareMode } from '../background/compare';

export const BADGE_COPY = {
  passedTooltip: 'Hidden tests are not checked. This only ran the samples visible on the page.',
  neverCorrect: true,
} as const;

export function badgeLabel(badge: VerificationBadge): string {
  switch (badge.kind) {
    case 'PASSED_VISIBLE_SAMPLES':
      return `PASSED VISIBLE SAMPLES (${badge.compareMode})`;
    case 'PARTIAL':
      return `PARTIAL (${badge.passed} of ${badge.total} samples)`;
    case 'COMPILE_ERROR':
      return 'COMPILE ERROR';
    case 'UNVERIFIED_HELPER_OFF':
      return 'UNVERIFIED: HELPER OFF';
    case 'UNVERIFIED_NO_SAMPLES':
      return 'UNVERIFIED: NO SAMPLES READ';
    case 'UNVERIFIED_PARTIAL_EDITOR':
      return 'UNVERIFIED: PARTIAL EDITOR CAPTURE';
    case 'STALE':
      return 'STALE: page changed';
    case 'NEEDS_YOUR_DECISION':
      return `NEEDS YOUR DECISION (${badge.reason})`;
    default:
      return 'UNVERIFIED';
  }
}

export function isLenientMode(mode: CompareMode): boolean {
  return mode === 'trimmed' || mode === 'whitespaceInsensitive' || mode === 'echoAware';
}

export function badgeFromResults(opts: {
  helperOff: boolean;
  noSamples: boolean;
  partialEditor: boolean;
  compileOk: boolean;
  errors: string[];
  passed: number;
  total: number;
  aggregateMatches?: MatchModes;
  needsDecision?: string;
  stale?: boolean;
}): VerificationBadge {
  if (opts.stale) return { kind: 'STALE' };
  if (opts.needsDecision) return { kind: 'NEEDS_YOUR_DECISION', reason: opts.needsDecision };
  if (opts.partialEditor) return { kind: 'UNVERIFIED_PARTIAL_EDITOR' };
  if (opts.helperOff) return { kind: 'UNVERIFIED_HELPER_OFF' };
  if (opts.noSamples) return { kind: 'UNVERIFIED_NO_SAMPLES' };
  if (!opts.compileOk) {
    return { kind: 'COMPILE_ERROR', errors: opts.errors.slice(0, 5) };
  }
  if (opts.total === 0) return { kind: 'UNVERIFIED_NO_SAMPLES' };
  if (opts.passed === opts.total && opts.aggregateMatches) {
    const mode = bestCompareMode(opts.aggregateMatches) ?? 'strict';
    return { kind: 'PASSED_VISIBLE_SAMPLES', compareMode: mode };
  }
  return { kind: 'PARTIAL', passed: opts.passed, total: opts.total };
}

import type {
  Classification,
  PageSnapshot,
  Settings,
  SuggestionAnswer,
  VerificationBadge,
  ApiKeySlotId,
} from './types';

export type MessageType =
  | 'FRAME_REPORT'
  | 'PIPELINE_STATUS'
  | 'SUGGESTION'
  | 'REQUEST_SUGGEST'
  | 'ABORT'
  | 'GET_SETTINGS'
  | 'SET_SETTINGS'
  | 'LOAD_MODELS'
  | 'TEST_HELPER'
  | 'VERIFY_CODE'
  | 'DIAGNOSTICS_REPORT'
  | 'TOGGLE_PANEL'
  | 'KEEPALIVE'
  | 'GET_LAST_PAYLOAD'
  | 'APPROVE'
  | 'COMPARE_UPDATE'
  | 'CHECK_MY_CODE'
  | 'MUTE_PAGE'
  | 'TYPE_PICK'
  | 'NOT_QUIZ'
  | 'REPORT_PROBLEM'
  | 'GET_PERFORMANCE_RECORDS'
  | 'WRITE_ANSWER'
  | 'RESTORE_WRITE'
  | 'DIAGNOSE_EDITOR'
  | 'PICK_EDITOR'
  | 'CANCEL_EDITOR_PICK'
  | 'PICK_EDITOR_CANCEL'
  | 'EDITOR_PICK_MODE'
  | 'EDITOR_PICKED'
  | 'SELECT_MCQ_ANSWERS'
  | 'ASK_ANYTHING'
  | 'ASK_ANYTHING_REPLY'
  | 'TEST_API_KEY_SLOT'
  | 'RESET_API_KEY_STATUS';

export interface Envelope<T = unknown> {
  type: MessageType;
  tabId?: number;
  frameId?: number;
  requestId?: string;
  payload: T;
}

export interface SuggestionPayload {
  signature: string;
  classification: Classification;
  answer: SuggestionAnswer | null;
  badge: VerificationBadge;
  cached: boolean;
  history: Array<{
    attempt: number;
    status: string;
    detail?: string;
  }>;
  redactedPayloadPreview?: unknown;
  model?: string;
  apiKeySlot?: ApiKeySlotId;
  error?: string;
}

export interface FrameReportPayload {
  snapshot: PageSnapshot;
}

export type AnyMessage = Envelope;

export function isEnvelope(msg: unknown): msg is Envelope {
  return (
    !!msg &&
    typeof msg === 'object' &&
    'type' in msg &&
    typeof (msg as Envelope).type === 'string' &&
    'payload' in msg
  );
}

export type SettingsResponse = Settings;

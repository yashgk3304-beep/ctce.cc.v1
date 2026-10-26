import type { PerformanceRecord } from '../shared/types';

const STORAGE_KEY = 'ctc_performance_v1';
const MAX_RECORDS = 100;

export async function appendPerformanceRecord(record: PerformanceRecord): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const records = Array.isArray(raw[STORAGE_KEY])
    ? (raw[STORAGE_KEY] as PerformanceRecord[])
    : [];
  await chrome.storage.local.set({
    [STORAGE_KEY]: [...records.slice(-(MAX_RECORDS - 1)), record],
  });
}

export async function getPerformanceRecords(): Promise<PerformanceRecord[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return [];
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(raw[STORAGE_KEY]) ? (raw[STORAGE_KEY] as PerformanceRecord[]) : [];
}

export async function clearPerformanceRecords(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.remove(STORAGE_KEY);
}

import type { CrashEvent, CrashEventFrame, CrashEventLog } from "../types.js";

// Maps a single Crashlytics BigQuery export row (with nested exceptions/threads/
// logs records) into the flat CrashEvent shape used to build attachments.
// Tolerant of missing fields so schema variations degrade gracefully.
export function normalizeEvent(row: Record<string, unknown>): CrashEvent {
  const application = asRecord(row.application);
  const device = asRecord(row.device);
  const os = asRecord(row.operating_system);
  const exceptions = asArray(row.exceptions);
  const threads = asArray(row.threads);
  const primaryException = asRecord(exceptions[0]);

  return {
    eventId: str(row.event_id),
    eventTimestamp: timestamp(row.event_timestamp),
    fatal: bool(row.is_fatal),
    displayVersion: str(application.display_version),
    buildVersion: str(application.build_version),
    osName: str(os.name),
    osVersion: str(os.display_version) ?? str(os.modification_state),
    deviceModel: str(device.model),
    deviceManufacturer: str(device.manufacturer),
    exceptionType: str(primaryException.type),
    exceptionMessage: str(primaryException.exception_message),
    frames: extractFrames(primaryException, threads),
    logs: extractLogs(row.logs)
  };
}

// Prefers the crashing exception's frames; falls back to the crashed thread.
function extractFrames(primaryException: Record<string, unknown>, threads: unknown[]): CrashEventFrame[] {
  const exceptionFrames = asArray(primaryException.frames);
  if (exceptionFrames.length > 0) return exceptionFrames.map(toFrame);

  const crashedThread = threads.map(asRecord).find((thread) => bool(thread.crashed) === true) ?? asRecord(threads[0]);
  return asArray(crashedThread.frames).map(toFrame);
}

function toFrame(value: unknown, index: number): CrashEventFrame {
  const frame = asRecord(value);
  return {
    index,
    library: str(frame.library),
    symbol: str(frame.symbol) ?? str(frame.display_name),
    file: str(frame.file),
    line: num(frame.line),
    offset: num(frame.offset),
    address: hex(frame.address)
  };
}

function extractLogs(value: unknown): CrashEventLog[] {
  return asArray(value).map((entry) => {
    const log = asRecord(entry);
    return { timestamp: timestamp(log.timestamp), message: str(log.message) };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  if (typeof value === "string") return value.length > 0 ? value : undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function bool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

// Addresses arrive as ints or numeric strings; render as 0x-prefixed hex.
function hex(value: unknown): string | undefined {
  if (typeof value === "string" && value.startsWith("0x")) return value;
  const n = num(value);
  if (n === undefined) return undefined;
  return `0x${Math.trunc(n).toString(16)}`;
}

// BigQuery timestamps surface as Date, { value }, or ISO strings.
function timestamp(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.length > 0 ? value : undefined;
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value: unknown }).value;
    if (typeof inner === "string") return inner;
    if (inner instanceof Date) return inner.toISOString();
  }
  return undefined;
}

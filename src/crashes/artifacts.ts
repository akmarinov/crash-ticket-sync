import type { Attachment, CrashEvent, CrashEventFrame, CrashRecord } from "../types.js";

const MAX_TEXT_BYTES = 1_000_000;

// Builds the work-item attachments for a crash: a formatted crash log, the
// breadcrumb/event log of the latest event, and a summary of recent events.
export function buildAttachments(crash: CrashRecord, events: CrashEvent[]): Attachment[] {
  const attachments: Attachment[] = [];
  const latest = events[0];

  const stacktrace = crash.stacktrace ?? (latest ? formatStacktrace(crash, latest) : undefined);
  if (stacktrace?.trim()) {
    attachments.push(textAttachment("stacktrace.txt", "text/plain", stacktrace));
  }

  if (latest && latest.logs.length > 0) {
    attachments.push(textAttachment("events.log", "text/plain", formatEventLog(latest)));
  }

  if (events.length > 0) {
    attachments.push(textAttachment("recent-events.csv", "text/csv", formatRecentEvents(events)));
  }

  return attachments;
}

export function formatStacktrace(crash: CrashRecord, event: CrashEvent): string {
  const header = [
    `Crashlytics issue: ${crash.issueId}`,
    event.eventId ? `Event: ${event.eventId}` : undefined,
    event.eventTimestamp ? `Timestamp: ${event.eventTimestamp}` : undefined,
    typeof event.fatal === "boolean" ? `Fatal: ${event.fatal}` : undefined,
    event.displayVersion ? `Version: ${event.displayVersion}${event.buildVersion ? ` (${event.buildVersion})` : ""}` : undefined,
    event.osName || event.osVersion ? `OS: ${[event.osName, event.osVersion].filter(Boolean).join(" ")}` : undefined,
    event.deviceModel ? `Device: ${[event.deviceManufacturer, event.deviceModel].filter(Boolean).join(" ")}` : undefined
  ].filter(Boolean);

  const exceptionLine = [event.exceptionType, event.exceptionMessage].filter(Boolean).join(": ");
  const frames = event.frames.map(formatFrame);

  return [
    ...header,
    "",
    exceptionLine || "Crashed:",
    ...frames
  ].join("\n");
}

function formatFrame(frame: CrashEventFrame, index: number): string {
  const idx = String(frame.index ?? index).padEnd(3, " ");
  const library = (frame.library ?? "").padEnd(28, " ");
  const address = frame.address ?? "";
  const symbol = frame.symbol ?? "<unknown>";
  const offset = typeof frame.offset === "number" ? ` + ${frame.offset}` : "";
  const location = frame.file ? ` (${frame.file}${typeof frame.line === "number" ? `:${frame.line}` : ""})` : "";
  return `${idx} ${library} ${address} ${symbol}${offset}${location}`.replace(/\s+$/, "");
}

export function formatEventLog(event: CrashEvent): string {
  return event.logs
    .map((log) => `${log.timestamp ?? ""}\t${log.message ?? ""}`.trim())
    .join("\n");
}

export function formatRecentEvents(events: CrashEvent[]): string {
  const header = "timestamp,fatal,version,build,os,device";
  const rows = events.map((event) =>
    [
      event.eventTimestamp ?? "",
      event.fatal ?? "",
      event.displayVersion ?? "",
      event.buildVersion ?? "",
      [event.osName, event.osVersion].filter(Boolean).join(" "),
      [event.deviceManufacturer, event.deviceModel].filter(Boolean).join(" ")
    ]
      .map(csvCell)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function textAttachment(filename: string, contentType: string, text: string): Attachment {
  let data = Buffer.from(text, "utf8");
  if (data.byteLength > MAX_TEXT_BYTES) data = data.subarray(0, MAX_TEXT_BYTES);
  return { filename, contentType, data };
}

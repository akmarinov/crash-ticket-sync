import type { CrashRecord } from "../types.js";

export function crashDedupeKey(crash: CrashRecord): string {
  return `${crash.projectKey}:${crash.issueId}`;
}

// Dedupe tag is scoped by environment so the same issue id in two builds maps
// to two distinct tickets.
export function crashTag(issueId: string, env?: string): string {
  const envPart = env ? `${sanitizeTag(env)}-` : "";
  return `CrashlyticsIssue-${envPart}${sanitizeTag(issueId)}`;
}

function sanitizeTag(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function buildTicketTitle(crash: CrashRecord): string {
  const title = crash.title.trim() || `Crashlytics issue ${crash.issueId}`;
  const envPart = crash.env ? `[${crash.env}]` : "";
  return `[Crashlytics]${envPart} ${title}`.slice(0, 250);
}

export function buildTicketBody(crash: CrashRecord): string {
  const lines = [
    `Crashlytics issue: ${crash.issueId}`,
    crash.env ? `Environment: ${crash.env}` : undefined,
    `Project: ${crash.projectKey}`,
    crash.bundleIdentifier ? `Bundle: ${crash.bundleIdentifier}` : undefined,
    crash.platform ? `Platform: ${crash.platform}` : undefined,
    crash.displayVersion ? `Version: ${crash.displayVersion}` : undefined,
    crash.buildVersion ? `Build: ${crash.buildVersion}` : undefined,
    crash.eventCount ? `Events in window: ${crash.eventCount}` : undefined,
    crash.latestEventAt ? `Latest event: ${crash.latestEventAt}` : undefined,
    typeof crash.fatal === "boolean" ? `Fatal: ${crash.fatal}` : undefined,
    crash.consoleUrl ? `Crashlytics URL: ${crash.consoleUrl}` : undefined,
    crash.subtitle ? `\n${crash.subtitle}` : undefined,
    crash.stacktrace ? `\nStacktrace:\n${fenced(crash.stacktrace.slice(0, 12000))}` : undefined
  ];

  return lines.filter(Boolean).join("\n");
}

function fenced(value: string): string {
  return `\`\`\`\n${value}\n\`\`\``;
}

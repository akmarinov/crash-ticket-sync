import { readFile } from "node:fs/promises";
import type { CrashRecord } from "../types.js";

export async function crashFromCrashlyticsJson(options: {
  projectKey: string;
  metadataPath: string;
  stacktracePath?: string;
}): Promise<CrashRecord> {
  const metadata = JSON.parse(await readFile(options.metadataPath, "utf8")) as Record<string, unknown>;
  const stacktrace = options.stacktracePath ? await readFile(options.stacktracePath, "utf8") : undefined;
  const crashedFrame = extractCrashedAppFrame(stacktrace);
  const metadataTitle = stringValue(metadata.title);

  return {
    projectKey: options.projectKey,
    issueId: stringValue(metadata.issue_id) ?? stringValue(metadata.issueId) ?? "unknown",
    title: usefulTitle(metadataTitle) ?? crashedFrame ?? "Crashlytics crash",
    platform: stringValue(metadata.platform),
    bundleIdentifier: stringValue(metadata.bundle_identifier),
    displayVersion: stringValue(metadata.display_version),
    buildVersion: stringValue(metadata.build_version),
    latestEventAt: stringValue(metadata.event_timestamp),
    stacktrace,
    raw: metadata
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function usefulTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  return title === "Crashlytics - Custom logs" ? undefined : title;
}

function extractCrashedAppFrame(stacktrace: string | undefined): string | undefined {
  if (!stacktrace) return undefined;
  const lines = stacktrace.split("\n");
  const crashedIndex = lines.findIndex((line) => line.startsWith("Crashed:"));
  if (crashedIndex < 0) return undefined;
  const frame = lines.slice(crashedIndex + 1).find((line) => /\bKylee\b/.test(line));
  if (!frame) return undefined;
  return frame.replace(/^\d+\s+Kylee\s+/, "").trim();
}

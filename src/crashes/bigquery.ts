import { BigQuery } from "@google-cloud/bigquery";
import type { ProjectConfig } from "../config.js";
import type { CrashEvent, CrashRecord } from "../types.js";
import { normalizeEvent } from "./eventNormalize.js";
import { crashlyticsConsoleUrl } from "./normalize.js";

export async function queryCrashlytics(project: ProjectConfig, sinceHours: number): Promise<CrashRecord[]> {
  const source = project.source;
  const bigQuery = new BigQuery({ projectId: source.projectId });
  const query = source.query ?? defaultCrashlyticsQuery(source.projectId, source.dataset, source.table);
  const [rows] = await bigQuery.query({
    query,
    location: source.location,
    params: { sinceHours, minEvents: project.filters.minEvents, fatalOnly: project.filters.fatalOnly }
  });

  return rows.map((row) => normalizeBigQueryRow(project.key, project.platform, project.env, source.projectId, row as Record<string, unknown>));
}

// Fetches the most recent events for a single issue so we can build the crash
// log, breadcrumb log, and recent-events summary attachments. Returned events
// are ordered newest-first; index 0 is the event used for the crash log.
export async function fetchEventDetail(project: ProjectConfig, issueId: string, sinceHours: number): Promise<CrashEvent[]> {
  const source = project.source;
  const bigQuery = new BigQuery({ projectId: source.projectId });
  const query = source.detailQuery ?? defaultEventDetailQuery(source.projectId, source.dataset, source.table);
  const [rows] = await bigQuery.query({
    query,
    location: source.location,
    params: { issueId, sinceHours, recentLimit: source.recentEventsLimit }
  });

  return rows.map((row) => normalizeEvent(row as Record<string, unknown>));
}

function defaultEventDetailQuery(projectId: string, dataset: string, table: string): string {
  const tableRef = `\`${projectId}.${dataset}.${table}\``;
  return `
SELECT
  event_id,
  event_timestamp,
  is_fatal,
  application,
  device,
  operating_system,
  exceptions,
  threads,
  logs
FROM ${tableRef}
WHERE CAST(issue_id AS STRING) = @issueId
  AND TIMESTAMP(event_timestamp) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @sinceHours HOUR)
ORDER BY event_timestamp DESC
LIMIT @recentLimit
`;
}

function defaultCrashlyticsQuery(projectId: string, dataset: string, table: string): string {
  const tableRef = `\`${projectId}.${dataset}.${table}\``;
  return `
SELECT
  CAST(issue_id AS STRING) AS issueId,
  COALESCE(ANY_VALUE(issue_title), CONCAT('Crashlytics issue ', CAST(issue_id AS STRING))) AS title,
  ANY_VALUE(issue_subtitle) AS subtitle,
  ANY_VALUE(platform) AS platform,
  ANY_VALUE(bundle_identifier) AS bundleIdentifier,
  ANY_VALUE(application.display_version) AS displayVersion,
  ANY_VALUE(application.build_version) AS buildVersion,
  COUNT(*) AS eventCount,
  MAX(TIMESTAMP(event_timestamp)) AS latestEventAt,
  LOGICAL_OR(COALESCE(is_fatal, false)) AS fatal
FROM ${tableRef}
WHERE TIMESTAMP(event_timestamp) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @sinceHours HOUR)
GROUP BY issue_id
HAVING eventCount >= @minEvents AND (@fatalOnly = false OR fatal = true)
ORDER BY latestEventAt DESC
`;
}

function normalizeBigQueryRow(projectKey: string, platform: string | undefined, env: string | undefined, firebaseProjectId: string, row: Record<string, unknown>): CrashRecord {
  const issueId = stringValue(row.issueId) ?? stringValue(row.issue_id) ?? "unknown";
  // Prefer the configured platform label; fall back to the export's value.
  const resolvedPlatform = platform ?? stringValue(row.platform);
  const bundleIdentifier = stringValue(row.bundleIdentifier);
  return {
    projectKey,
    env,
    issueId,
    title: stringValue(row.title) ?? stringValue(row.issueTitle) ?? `Crashlytics issue ${issueId}`,
    subtitle: stringValue(row.subtitle),
    platform: resolvedPlatform,
    bundleIdentifier,
    displayVersion: stringValue(row.displayVersion),
    buildVersion: stringValue(row.buildVersion),
    eventCount: numberValue(row.eventCount),
    latestEventAt: stringValue(row.latestEventAt),
    fatal: booleanValue(row.fatal),
    consoleUrl: stringValue(row.consoleUrl) ?? crashlyticsConsoleUrl(firebaseProjectId, resolvedPlatform, bundleIdentifier, issueId),
    raw: row
  };
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "value" in value && typeof value.value === "string") return value.value;
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

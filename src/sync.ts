import type { ProjectConfig } from "./config.js";
import { fetchEventDetail, queryCrashlytics } from "./crashes/bigquery.js";
import { buildAttachments } from "./crashes/artifacts.js";
import { crashDedupeKey } from "./crashes/normalize.js";
import { StateStore } from "./state.js";
import { createTicketClient } from "./tickets/index.js";
import type { CrashRecord } from "./types.js";

export async function syncProject(options: {
  project: ProjectConfig;
  state: StateStore;
  dryRun: boolean;
  sinceHours?: number;
  recomment?: boolean;
}): Promise<void> {
  const sinceHours = options.sinceHours ?? options.project.filters.sinceHours;
  const crashes = await queryCrashlytics(options.project, sinceHours);
  await processCrashes({
    ...options,
    crashes,
    // Pull per-event detail (stacktrace, breadcrumbs, recent events) lazily,
    // only for crashes we are about to file as new tickets.
    enrich: async (crash) => {
      try {
        const events = await fetchEventDetail(options.project, crash.issueId, sinceHours);
        crash.attachments = buildAttachments(crash, events);
      } catch (error) {
        console.warn(`detail fetch failed for ${crash.issueId}: ${error instanceof Error ? error.message : error}`);
      }
    }
  });
}

export async function processCrashes(options: {
  project: ProjectConfig;
  state: StateStore;
  dryRun: boolean;
  crashes: CrashRecord[];
  recomment?: boolean;
  enrich?: (crash: CrashRecord) => Promise<void>;
}): Promise<void> {
  const client = createTicketClient(options.project);

  for (const crash of options.crashes) {
    const key = crashDedupeKey(crash);
    const stateHit = options.state.get(key);
    if (stateHit) {
      console.log(`skip ${key}: already created ${stateHit.ticketUrl}`);
      continue;
    }

    if (options.dryRun) {
      console.log(`dry-run create ${key}: ${crash.title}`);
      continue;
    }

    const existing = await client.findExisting(crash);
    if (existing) {
      console.log(`found ${key}: ${existing.url}`);
      // Recurrence comments are opt-in so a scheduled daily run does not spam
      // long-lived tickets; the tag/state dedupe still prevents duplicates.
      if (options.recomment) await client.comment?.(existing, crash);
      options.state.set(key, existing.id, existing.url);
      continue;
    }

    if (options.enrich) await options.enrich(crash);
    const created = await client.create(crash);
    options.state.set(key, created.id, created.url);
    const extra = crash.attachments?.length ? ` (+${crash.attachments.length} attachments)` : "";
    console.log(`created ${key}: ${created.url}${extra}`);
  }
}

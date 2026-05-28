import type { ProjectConfig } from "./config.js";
import { queryCrashlytics } from "./crashes/bigquery.js";
import { crashDedupeKey } from "./crashes/normalize.js";
import { StateStore } from "./state.js";
import { createTicketClient } from "./tickets/index.js";
import type { CrashRecord } from "./types.js";

export async function syncProject(options: {
  project: ProjectConfig;
  state: StateStore;
  dryRun: boolean;
  sinceHours?: number;
}): Promise<void> {
  const sinceHours = options.sinceHours ?? options.project.filters.sinceHours;
  const crashes = await queryCrashlytics(options.project, sinceHours);
  await processCrashes({ ...options, crashes });
}

export async function processCrashes(options: {
  project: ProjectConfig;
  state: StateStore;
  dryRun: boolean;
  crashes: CrashRecord[];
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
      await client.comment?.(existing, crash);
      options.state.set(key, existing.id, existing.url);
      continue;
    }

    const created = await client.create(crash);
    options.state.set(key, created.id, created.url);
    console.log(`created ${key}: ${created.url}`);
  }
}

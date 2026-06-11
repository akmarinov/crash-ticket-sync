#!/usr/bin/env node
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import { loadConfig, selectProjects } from "./config.js";
import { buildAttachments } from "./crashes/artifacts.js";
import { crashFromCrashlyticsJson } from "./crashes/jsonImport.js";
import { StateStore } from "./state.js";
import { processCrashes, syncProject } from "./sync.js";

const program = new Command();

program
  .name("crash-ticket-sync")
  .description("Sync Firebase Crashlytics crashes into Azure Boards or Jira tickets")
  .version("0.1.0");

program
  .command("init-config")
  .description("Write an example config file")
  .option("-o, --output <path>", "output path", "crash-ticket-sync.config.json")
  .action(async (options: { output: string }) => {
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(exampleConfig(), null, 2)}\n`);
    console.log(`wrote ${options.output}`);
  });

program
  .command("validate-config")
  .description("Validate config JSON")
  .requiredOption("-c, --config <path>", "config path")
  .action(async (options: { config: string }) => {
    const config = await loadConfig(options.config);
    console.log(`valid config with ${config.projects.length} project(s)`);
  });

program
  .command("sync")
  .description("Query configured Crashlytics BigQuery exports and create/update tickets")
  .requiredOption("-c, --config <path>", "config path")
  .option("-p, --project <keys>", "comma-separated project keys from config")
  .option("--since-hours <hours>", "override lookback window", parseNumber)
  .option("--recomment", "add a recurrence comment when an existing ticket is found again")
  .option("--dry-run", "show what would be created without writing tickets")
  .action(async (options: { config: string; project?: string; sinceHours?: number; recomment?: boolean; dryRun?: boolean }) => {
    const config = await loadConfig(options.config);
    const state = new StateStore(config.statePath);
    await state.load();
    const projects = selectProjects(config, options.project);
    let failures = 0;
    for (const project of projects) {
      console.log(`sync ${project.key}`);
      try {
        await syncProject({
          project,
          state,
          dryRun: options.dryRun ?? config.dryRun,
          sinceHours: options.sinceHours,
          recomment: options.recomment
        });
      } catch (error) {
        // A per-project failure — most commonly the Crashlytics export table
        // for this app/env not existing yet — must not abort the other
        // projects. Log and continue; only fail the run if every project errors.
        failures += 1;
        console.warn(`skip ${project.key}: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (!options.dryRun) await state.save();
    if (projects.length > 0 && failures === projects.length) {
      throw new Error(`all ${failures} project(s) failed`);
    }
  });

program
  .command("import-json")
  .description("Create/update a ticket from downloaded Crashlytics JSON and optional stacktrace")
  .requiredOption("-c, --config <path>", "config path")
  .requiredOption("-p, --project <key>", "project key from config")
  .requiredOption("-m, --metadata <path>", "Crashlytics JSON metadata path")
  .option("-s, --stacktrace <path>", "Crashlytics stacktrace path")
  .option("--dry-run", "show what would be created without writing tickets")
  .action(async (options: { config: string; project: string; metadata: string; stacktrace?: string; dryRun?: boolean }) => {
    const config = await loadConfig(options.config);
    const [project] = selectProjects(config, options.project);
    if (!project) throw new Error(`Unknown project key: ${options.project}`);
    const state = new StateStore(config.statePath);
    await state.load();
    const crash = await crashFromCrashlyticsJson({
      projectKey: project.key,
      metadataPath: options.metadata,
      stacktracePath: options.stacktrace
    });
    crash.env = project.env;
    await processCrashes({
      project,
      state,
      dryRun: options.dryRun ?? config.dryRun,
      crashes: [crash],
      // Build a stacktrace.txt attachment from the imported crash log.
      enrich: async (record) => {
        record.attachments = buildAttachments(record, []);
      }
    });
    if (!options.dryRun) await state.save();
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected number, got ${value}`);
  return parsed;
}

function exampleConfig(): unknown {
  return {
    statePath: ".crash-ticket-sync-state.json",
    dryRun: false,
    projects: [
      {
        key: "app-ios",
        displayName: "MyApp iOS",
        source: {
          type: "bigquery",
          projectId: "firebase-project-id",
          dataset: "firebase_crashlytics",
          table: "com_example_app_IOS"
        },
        ticket: {
          type: "azure",
          organizationUrl: "https://your-org.visualstudio.com",
          project: "YourProject",
          workItemType: "Bug",
          tags: ["iOS", "Crashlytics"]
        },
        filters: {
          sinceHours: 24,
          minEvents: 1,
          fatalOnly: false
        }
      },
      {
        key: "example-android",
        source: {
          type: "bigquery",
          projectId: "firebase-project-id",
          dataset: "firebase_crashlytics",
          table: "com_example_android_ANDROID"
        },
        ticket: {
          type: "jira",
          baseUrl: "https://example.atlassian.net",
          projectKey: "MOB",
          issueType: "Bug",
          labels: ["crashlytics"]
        }
      }
    ]
  };
}

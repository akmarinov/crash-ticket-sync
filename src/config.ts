import { readFile } from "node:fs/promises";
import { z } from "zod";

const bigQuerySourceSchema = z.object({
  type: z.literal("bigquery"),
  projectId: z.string().min(1),
  dataset: z.string().min(1),
  table: z.string().min(1),
  location: z.string().optional(),
  query: z.string().optional(),
  detailQuery: z.string().optional(),
  recentEventsLimit: z.number().int().positive().default(20)
});

const azureTicketSchema = z.object({
  type: z.literal("azure"),
  organizationUrl: z.string().url(),
  project: z.string().min(1),
  workItemType: z.string().default("Bug"),
  areaPath: z.string().optional(),
  iterationPath: z.string().optional(),
  assignedTo: z.string().optional(),
  tags: z.array(z.string()).default([])
});

const jiraTicketSchema = z.object({
  type: z.literal("jira"),
  baseUrl: z.string().url(),
  projectKey: z.string().min(1),
  issueType: z.string().default("Bug"),
  assigneeAccountId: z.string().optional(),
  labels: z.array(z.string()).default([])
});

const projectSchema = z.object({
  key: z.string().min(1),
  displayName: z.string().optional(),
  source: bigQuerySourceSchema,
  ticket: z.discriminatedUnion("type", [azureTicketSchema, jiraTicketSchema]),
  filters: z.object({
    sinceHours: z.number().positive().default(24),
    minEvents: z.number().int().positive().default(1),
    fatalOnly: z.boolean().default(false)
  }).default({ sinceHours: 24, minEvents: 1, fatalOnly: false })
});

const configSchema = z.object({
  statePath: z.string().default(".crash-ticket-sync-state.json"),
  dryRun: z.boolean().default(false),
  projects: z.array(projectSchema).min(1)
});

export type AppConfig = z.infer<typeof configSchema>;
export type ProjectConfig = AppConfig["projects"][number];

export async function loadConfig(path: string): Promise<AppConfig> {
  const raw = await readFile(path, "utf8");
  return configSchema.parse(JSON.parse(raw));
}

export function selectProjects(config: AppConfig, requested?: string): ProjectConfig[] {
  if (!requested) return config.projects;
  const names = new Set(requested.split(",").map((value) => value.trim()).filter(Boolean));
  return config.projects.filter((project) => names.has(project.key));
}

import { request } from "undici";
import type { ProjectConfig } from "../config.js";
import type { CrashRecord, CreatedTicket, ExistingTicket, TicketClient } from "../types.js";
import { buildTicketBody, buildTicketTitle, crashTag } from "../crashes/normalize.js";

export class JiraClient implements TicketClient {
  private readonly ticketConfig: Extract<ProjectConfig["ticket"], { type: "jira" }>;

  constructor(project: ProjectConfig) {
    if (project.ticket.type !== "jira") throw new Error("JiraClient requires jira ticket config");
    this.ticketConfig = project.ticket;
  }

  async findExisting(crash: CrashRecord): Promise<ExistingTicket | undefined> {
    const label = jiraLabel(crash.issueId);
    const jql = `project = ${this.ticketConfig.projectKey} AND labels = ${label} ORDER BY updated DESC`;
    const result = await this.requestJson<{ issues?: Array<{ id: string; key: string }> }>(
      "GET",
      `${this.baseUrl()}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=1`
    );
    const issue = result.issues?.[0];
    if (!issue) return undefined;
    return {
      id: issue.id,
      key: issue.key,
      url: `${this.baseUrl()}/browse/${issue.key}`
    };
  }

  async create(crash: CrashRecord): Promise<CreatedTicket> {
    const labels = ["crashlytics", "crash-ticket-sync", jiraLabel(crash.issueId), ...this.ticketConfig.labels];
    const result = await this.requestJson<{ id: string; key: string }>("POST", `${this.baseUrl()}/rest/api/3/issue`, {
      fields: {
        project: { key: this.ticketConfig.projectKey },
        issuetype: { name: this.ticketConfig.issueType },
        summary: buildTicketTitle(crash),
        description: adfDocument(buildTicketBody(crash)),
        labels,
        ...(this.ticketConfig.assigneeAccountId ? { assignee: { accountId: this.ticketConfig.assigneeAccountId } } : {})
      }
    });
    return {
      id: result.id,
      key: result.key,
      url: `${this.baseUrl()}/browse/${result.key}`
    };
  }

  async comment(ticket: ExistingTicket, crash: CrashRecord): Promise<void> {
    await this.requestJson("POST", `${this.baseUrl()}/rest/api/3/issue/${ticket.key ?? ticket.id}/comment`, {
      body: adfDocument(`Crashlytics issue seen again.\n\nLatest event: ${crash.latestEventAt ?? "unknown"}\nEvents in window: ${crash.eventCount ?? "unknown"}`)
    });
  }

  private baseUrl(): string {
    return this.ticketConfig.baseUrl.replace(/\/$/, "");
  }

  private async requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN ?? process.env.JIRA_TOKEN;
    if (!email || !token) throw new Error("Missing JIRA_EMAIL and JIRA_API_TOKEN/JIRA_TOKEN");
    const response = await request(url, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.body.text();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Jira request failed ${response.statusCode}: ${text}`);
    }
    return text ? JSON.parse(text) as T : undefined as T;
  }
}

function jiraLabel(issueId: string): string {
  return crashTag(issueId).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function adfDocument(text: string): unknown {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n\n").map((paragraph) => ({
      type: "paragraph",
      content: paragraph.length > 0 ? [{ type: "text", text: paragraph }] : []
    }))
  };
}

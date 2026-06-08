import { request } from "undici";
import type { ProjectConfig } from "../config.js";
import type { Attachment, CrashRecord, CreatedTicket, ExistingTicket, TicketClient } from "../types.js";
import { buildTicketBody, buildTicketTitle, crashTag } from "../crashes/normalize.js";

export class AzureBoardsClient implements TicketClient {
  private readonly ticketConfig: Extract<ProjectConfig["ticket"], { type: "azure" }>;

  constructor(project: ProjectConfig) {
    if (project.ticket.type !== "azure") throw new Error("AzureBoardsClient requires azure ticket config");
    this.ticketConfig = project.ticket;
  }

  async findExisting(crash: CrashRecord): Promise<ExistingTicket | undefined> {
    const tag = crashTag(crash.issueId, crash.env);
    const wiql = {
      query: `
SELECT [System.Id], [System.Title], [System.State]
FROM WorkItems
WHERE [System.TeamProject] = @project
  AND [System.Tags] CONTAINS '${escapeWiql(tag)}'
ORDER BY [System.ChangedDate] DESC
`
    };
    const response = await this.requestJson<{ workItems?: Array<{ id: number }> }>(
      "POST",
      `${this.projectUrl()}/_apis/wit/wiql?api-version=7.1`,
      wiql
    );
    const id = response.workItems?.[0]?.id;
    if (!id) return undefined;
    return {
      id: String(id),
      url: `${this.ticketConfig.organizationUrl.replace(/\/$/, "")}/${encodeURIComponent(this.ticketConfig.project)}/_workitems/edit/${id}`
    };
  }

  async create(crash: CrashRecord): Promise<CreatedTicket> {
    const tags = ["Crashlytics", "crash-ticket-sync", crashTag(crash.issueId, crash.env), ...(crash.env ? [crash.env] : []), ...this.ticketConfig.tags];
    const patch = [
      op("/fields/System.Title", buildTicketTitle(crash)),
      op("/fields/System.Description", htmlEscape(buildTicketBody(crash)).replace(/\n/g, "<br/>")),
      op("/fields/System.Tags", tags.join("; "))
    ];

    if (this.ticketConfig.areaPath) patch.push(op("/fields/System.AreaPath", this.ticketConfig.areaPath));
    if (this.ticketConfig.iterationPath) patch.push(op("/fields/System.IterationPath", this.ticketConfig.iterationPath));
    if (this.ticketConfig.assignedTo) patch.push(op("/fields/System.AssignedTo", this.ticketConfig.assignedTo));

    // Upload the crash log / event log / recent-events files and attach them to
    // the new work item via AttachedFile relations.
    for (const attachment of crash.attachments ?? []) {
      const uploaded = await this.uploadAttachment(attachment);
      patch.push(op("/relations/-", {
        rel: "AttachedFile",
        url: uploaded.url,
        attributes: { name: attachment.filename, comment: "Crashlytics export" }
      }));
    }

    const created = await this.requestJson<{ id: number; url: string }>(
      "PATCH",
      `${this.projectUrl()}/_apis/wit/workitems/$${encodeURIComponent(this.ticketConfig.workItemType)}?api-version=7.1`,
      patch,
      "application/json-patch+json"
    );

    return {
      id: String(created.id),
      url: `${this.ticketConfig.organizationUrl.replace(/\/$/, "")}/${encodeURIComponent(this.ticketConfig.project)}/_workitems/edit/${created.id}`
    };
  }

  async comment(ticket: ExistingTicket, crash: CrashRecord): Promise<void> {
    await this.requestJson(
      "POST",
      `${this.projectUrl()}/_apis/wit/workItems/${ticket.id}/comments?api-version=7.1-preview.4`,
      { text: `Crashlytics issue seen again.\n\nLatest event: ${crash.latestEventAt ?? "unknown"}\nEvents in window: ${crash.eventCount ?? "unknown"}` }
    );
  }

  private async uploadAttachment(attachment: Attachment): Promise<{ id: string; url: string }> {
    const url = `${this.projectUrl()}/_apis/wit/attachments?fileName=${encodeURIComponent(attachment.filename)}&api-version=7.1`;
    const response = await request(url, {
      method: "POST",
      headers: {
        authorization: this.authHeader(),
        "content-type": attachment.contentType,
        accept: "application/json"
      },
      body: attachment.data
    });
    const text = await response.body.text();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Azure Boards attachment upload failed ${response.statusCode}: ${text}`);
    }
    const parsed = JSON.parse(text) as { id: string; url: string };
    return parsed;
  }

  private projectUrl(): string {
    return `${this.ticketConfig.organizationUrl.replace(/\/$/, "")}/${encodeURIComponent(this.ticketConfig.project)}`;
  }

  private authHeader(): string {
    const token = process.env.AZURE_DEVOPS_PAT ?? process.env.AZURE_DEVOPS_PAT ?? process.env.AZURE_DEVOPS_EXT_PAT;
    if (!token) throw new Error("Missing AZURE_DEVOPS_PAT, AZURE_DEVOPS_PAT, or AZURE_DEVOPS_EXT_PAT");
    return `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
  }

  private async requestJson<T>(
    method: string,
    url: string,
    body?: unknown,
    contentType = "application/json"
  ): Promise<T> {
    const response = await request(url, {
      method,
      headers: {
        authorization: this.authHeader(),
        "content-type": contentType,
        accept: "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.body.text();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Azure Boards request failed ${response.statusCode}: ${text}`);
    }
    return text ? JSON.parse(text) as T : undefined as T;
  }
}

function op(path: string, value: unknown): { op: "add"; path: string; value: unknown } {
  return { op: "add", path, value };
}

function escapeWiql(value: string): string {
  return value.replace(/'/g, "''");
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

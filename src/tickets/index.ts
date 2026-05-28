import type { ProjectConfig } from "../config.js";
import type { TicketClient } from "../types.js";
import { AzureBoardsClient } from "./azure.js";
import { JiraClient } from "./jira.js";

export function createTicketClient(project: ProjectConfig): TicketClient {
  switch (project.ticket.type) {
    case "azure":
      return new AzureBoardsClient(project);
    case "jira":
      return new JiraClient(project);
  }
}

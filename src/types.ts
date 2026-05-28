export type TicketBackendType = "azure" | "jira";

export type CrashSourceType = "bigquery";

export interface CrashRecord {
  projectKey: string;
  issueId: string;
  title: string;
  subtitle?: string;
  platform?: string;
  bundleIdentifier?: string;
  displayVersion?: string;
  buildVersion?: string;
  latestEventAt?: string;
  eventCount?: number;
  fatal?: boolean;
  stacktrace?: string;
  consoleUrl?: string;
  raw?: unknown;
}

export interface CreatedTicket {
  id: string;
  key?: string;
  url: string;
}

export interface ExistingTicket extends CreatedTicket {
  status?: string;
}

export interface TicketClient {
  findExisting(crash: CrashRecord): Promise<ExistingTicket | undefined>;
  create(crash: CrashRecord): Promise<CreatedTicket>;
  comment?(ticket: ExistingTicket, crash: CrashRecord): Promise<void>;
}

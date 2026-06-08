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
  attachments?: Attachment[];
  raw?: unknown;
}

export interface Attachment {
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface CrashEventFrame {
  index?: number;
  library?: string;
  symbol?: string;
  file?: string;
  line?: number;
  offset?: number;
  address?: string;
}

export interface CrashEventLog {
  timestamp?: string;
  message?: string;
}

export interface CrashEvent {
  eventId?: string;
  eventTimestamp?: string;
  fatal?: boolean;
  displayVersion?: string;
  buildVersion?: string;
  osName?: string;
  osVersion?: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  exceptionType?: string;
  exceptionMessage?: string;
  frames: CrashEventFrame[];
  logs: CrashEventLog[];
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

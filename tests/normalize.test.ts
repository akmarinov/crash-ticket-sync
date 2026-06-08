import { describe, expect, it } from "vitest";
import { buildTicketBody, buildTicketTitle, crashTag } from "../src/crashes/normalize.js";
import type { CrashRecord } from "../src/types.js";

function crash(overrides: Partial<CrashRecord> = {}): CrashRecord {
  return { projectKey: "kylee-ios-uat", issueId: "abc123", title: "Boom", ...overrides };
}

describe("env scoping", () => {
  it("scopes the dedupe tag by environment", () => {
    expect(crashTag("abc123", "UAT")).toBe("CrashlyticsIssue-UAT-abc123");
    expect(crashTag("abc123")).toBe("CrashlyticsIssue-abc123");
    expect(crashTag("abc123", "UAT")).not.toBe(crashTag("abc123", "Prod"));
  });

  it("puts the environment in the ticket title and body", () => {
    expect(buildTicketTitle(crash({ env: "UAT" }))).toBe("[Crashlytics][UAT] Boom");
    expect(buildTicketTitle(crash({ env: undefined }))).toBe("[Crashlytics] Boom");
    expect(buildTicketBody(crash({ env: "UAT" }))).toContain("Environment: UAT");
  });
});

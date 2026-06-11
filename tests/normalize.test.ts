import { describe, expect, it } from "vitest";
import { buildTicketBody, buildTicketTitle, crashTag, crashlyticsConsoleUrl } from "../src/crashes/normalize.js";
import type { CrashRecord } from "../src/types.js";

function crash(overrides: Partial<CrashRecord> = {}): CrashRecord {
  return { projectKey: "app-ios-uat", issueId: "abc123", title: "Boom", ...overrides };
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

  it("scopes and labels by platform + environment", () => {
    expect(crashTag("abc123", "Prod", "Android")).toBe("CrashlyticsIssue-Android-Prod-abc123");
    expect(crashTag("abc123", "Prod", "Android")).not.toBe(crashTag("abc123", "Prod", "iOS"));
    expect(buildTicketTitle(crash({ platform: "Android", env: "Prod" }))).toBe("[Crashlytics][Android][Prod] Boom");
  });

  it("builds a Crashlytics console deep link", () => {
    expect(crashlyticsConsoleUrl("example-12345", "Android", "com.example.app", "abc123"))
      .toBe("https://console.firebase.google.com/project/example-12345/crashlytics/app/android:com.example.app/issues/abc123");
    expect(crashlyticsConsoleUrl("example-12345", "iOS", undefined, "abc123")).toBeUndefined();
  });
});

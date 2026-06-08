import { describe, expect, it } from "vitest";
import { buildAttachments, formatEventLog, formatRecentEvents, formatStacktrace } from "../src/crashes/artifacts.js";
import type { CrashEvent, CrashRecord } from "../src/types.js";

function crash(overrides: Partial<CrashRecord> = {}): CrashRecord {
  return { projectKey: "app-ios", issueId: "abc123", title: "Crash", ...overrides };
}

function event(overrides: Partial<CrashEvent> = {}): CrashEvent {
  return { frames: [], logs: [], ...overrides };
}

describe("formatStacktrace", () => {
  it("renders header, exception line, and frames", () => {
    const text = formatStacktrace(crash(), event({
      eventId: "evt-1",
      fatal: true,
      displayVersion: "1.2.0",
      buildVersion: "345",
      osName: "iOS",
      osVersion: "18.1",
      deviceModel: "iPhone16,2",
      deviceManufacturer: "Apple",
      exceptionType: "EXC_BAD_ACCESS",
      exceptionMessage: "KERN_INVALID_ADDRESS",
      frames: [
        { index: 0, library: "MyApp", symbol: "BluetoothManager.rescan()", file: "BluetoothManager.swift", line: 42, offset: 16, address: "0x1b4648" }
      ]
    }));

    expect(text).toContain("Crashlytics issue: abc123");
    expect(text).toContain("Version: 1.2.0 (345)");
    expect(text).toContain("Device: Apple iPhone16,2");
    expect(text).toContain("EXC_BAD_ACCESS: KERN_INVALID_ADDRESS");
    expect(text).toContain("BluetoothManager.rescan() + 16 (BluetoothManager.swift:42)");
  });
});

describe("formatEventLog", () => {
  it("renders one breadcrumb per line", () => {
    const text = formatEventLog(event({
      logs: [
        { timestamp: "2026-06-08T09:00:00Z", message: "scan started" },
        { timestamp: "2026-06-08T09:00:01Z", message: "device found" }
      ]
    }));
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain("scan started");
  });
});

describe("formatRecentEvents", () => {
  it("produces a CSV header and quotes commas", () => {
    const csv = formatRecentEvents([
      event({ eventTimestamp: "2026-06-08T09:00:00Z", fatal: true, displayVersion: "1.2.0", buildVersion: "345", osName: "iOS", osVersion: "18.1", deviceModel: "iPhone, 16" })
    ]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("timestamp,fatal,version,build,os,device");
    expect(row).toContain('"iPhone, 16"');
    expect(row).toContain("iOS 18.1");
  });
});

describe("buildAttachments", () => {
  it("emits stacktrace, events log, and recent-events for a detailed event", () => {
    const events = [event({
      frames: [{ index: 0, library: "MyApp", symbol: "f()", address: "0x1" }],
      logs: [{ timestamp: "t", message: "m" }]
    })];
    const names = buildAttachments(crash(), events).map((a) => a.filename);
    expect(names).toEqual(["stacktrace.txt", "events.log", "recent-events.csv"]);
  });

  it("uses the imported stacktrace when no events are available", () => {
    const attachments = buildAttachments(crash({ stacktrace: "Crashed: main\n0 MyApp 0x1 boom()" }), []);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("stacktrace.txt");
    expect(attachments[0].data.toString("utf8")).toContain("boom()");
  });

  it("returns nothing when there is neither a stacktrace nor events", () => {
    expect(buildAttachments(crash(), [])).toEqual([]);
  });
});

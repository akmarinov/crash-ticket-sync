import { describe, expect, it } from "vitest";
import { normalizeEvent } from "../src/crashes/eventNormalize.js";

describe("normalizeEvent", () => {
  it("maps nested Crashlytics export records into a flat event", () => {
    const event = normalizeEvent({
      event_id: "evt-1",
      event_timestamp: { value: "2026-06-08T09:00:00.000Z" },
      is_fatal: true,
      application: { display_version: "1.2.0", build_version: "345" },
      device: { manufacturer: "Apple", model: "iPhone16,2" },
      operating_system: { name: "iOS", display_version: "18.1" },
      exceptions: [{ type: "EXC_BAD_ACCESS", exception_message: "boom", frames: [{ library: "MyApp", symbol: "f()", file: "F.swift", line: 10, offset: 4, address: 7160 }] }],
      threads: [],
      logs: [{ timestamp: { value: "2026-06-08T08:59:59Z" }, message: "scan" }]
    });

    expect(event.eventId).toBe("evt-1");
    expect(event.eventTimestamp).toBe("2026-06-08T09:00:00.000Z");
    expect(event.fatal).toBe(true);
    expect(event.displayVersion).toBe("1.2.0");
    expect(event.osVersion).toBe("18.1");
    expect(event.exceptionType).toBe("EXC_BAD_ACCESS");
    expect(event.frames[0]).toMatchObject({ library: "MyApp", symbol: "f()", line: 10, address: "0x1bf8" });
    expect(event.logs[0]).toMatchObject({ timestamp: "2026-06-08T08:59:59Z", message: "scan" });
  });

  it("falls back to the crashed thread frames when exceptions have none", () => {
    const event = normalizeEvent({
      exceptions: [],
      threads: [
        { crashed: false, frames: [{ symbol: "other()" }] },
        { crashed: true, frames: [{ symbol: "crashing()", address: "0xabc" }] }
      ]
    });
    expect(event.frames).toHaveLength(1);
    expect(event.frames[0].symbol).toBe("crashing()");
  });

  it("tolerates missing fields", () => {
    const event = normalizeEvent({});
    expect(event.frames).toEqual([]);
    expect(event.logs).toEqual([]);
    expect(event.eventId).toBeUndefined();
  });
});

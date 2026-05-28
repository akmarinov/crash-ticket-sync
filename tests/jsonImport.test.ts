import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { crashFromCrashlyticsJson } from "../src/crashes/jsonImport.js";

describe("crashFromCrashlyticsJson", () => {
  it("uses the crashed app frame when metadata title is generic", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crash-ticket-sync-"));
    const metadataPath = join(dir, "crash.json");
    const stacktracePath = join(dir, "stacktrace.txt");
    await writeFile(metadataPath, JSON.stringify({
      title: "Crashlytics - Custom logs",
      issue_id: "abc123",
      platform: "apple"
    }));
    await writeFile(stacktracePath, [
      "Crashed: com.apple.main-thread",
      "0  libswiftDispatch.dylib 0x47b0 dispatch thunk of DispatchWorkItem.cancel() + 16",
      "1  Kylee 0x1b4648 BluetoothConnectionManager.schedulePersistentRescan(after:) + 356"
    ].join("\n"));

    const crash = await crashFromCrashlyticsJson({
      projectKey: "ios",
      metadataPath,
      stacktracePath
    });

    expect(crash.issueId).toBe("abc123");
    expect(crash.title).toContain("BluetoothConnectionManager.schedulePersistentRescan");
  });
});

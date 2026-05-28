import { readFile, writeFile } from "node:fs/promises";

interface StateFile {
  issues: Record<string, { ticketUrl: string; ticketId: string; updatedAt: string }>;
}

export class StateStore {
  private state: StateFile = { issues: {} };

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    try {
      this.state = JSON.parse(await readFile(this.path, "utf8")) as StateFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  get(key: string): StateFile["issues"][string] | undefined {
    return this.state.issues[key];
  }

  set(key: string, ticketId: string, ticketUrl: string): void {
    this.state.issues[key] = {
      ticketId,
      ticketUrl,
      updatedAt: new Date().toISOString()
    };
  }

  async save(): Promise<void> {
    await writeFile(this.path, `${JSON.stringify(this.state, null, 2)}\n`);
  }
}

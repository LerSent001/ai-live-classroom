import { appendFileSync, mkdirSync, renameSync, writeFileSync, readdirSync, readFileSync, lstatSync } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { TeacherId } from "@/lib/classroom-types";
import { isVideoContainer, readProvider } from "./provider-read";

export const RECORDING_WORKFLOW = "monokuma-demo-v1";

export type RecordedScene = Readonly<{
  teacherId: TeacherId;
  sessionId: string;
  sceneNumber: number;
  videoUrl: string;
  narration: string;
  summary: string;
  prompt: string;
  expandedPrompt: string | null;
  timings: {
    requestId: string;
    queueWaitMs: number | null;
    inferenceMs: number | null;
    totalMs: number;
  };
}>;
export type RecordingEvent = { kind: string; data: Record<string, unknown> };

export function parseRecordingEvents(text: string): RecordingEvent[] {
  const lines = text.trimEnd().split("\n");
  return lines.flatMap((line, index) => {
    if (!line.trim()) return [];
    let entry: unknown;
    try { entry = JSON.parse(line); }
    catch (error) { if (error instanceof SyntaxError && index === lines.length - 1) return []; throw error; }
    if (typeof entry !== "object" || entry === null || !("kind" in entry) || typeof entry.kind !== "string" ||
      !("data" in entry) || typeof entry.data !== "object" || entry.data === null || Array.isArray(entry.data)) throw new Error("Invalid recording event.");
    return [{ kind: entry.kind, data: entry.data as Record<string, unknown> }];
  });
}

// Small metadata writes are synchronous so intent is durable before a paid POST.
// Video downloads are asynchronous and never delay playback.
export class RecordingStore {
  private writeFailure: Error | null = null;

  constructor(readonly root: string, private readonly workflow = RECORDING_WORKFLOW) {}

  sessions(): string[] {
    try { return readdirSync(this.root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  events(sessionId: string): RecordingEvent[] {
    const filename = join(this.directory(sessionId), "events.jsonl");
    if (!lstatSync(filename).isFile()) throw new Error("Recording log must be a local file.");
    return parseRecordingEvents(readFileSync(filename, "utf8"));
  }
  hasVideo(sessionId: string, number: number): boolean {
    try { const info = lstatSync(join(this.directory(sessionId), `scene-${String(number).padStart(2, "0")}.mp4`)); return info.isFile() && info.size > 0; }
    catch { return false; }
  }
  sceneMetadata(sessionId: string, number: number): unknown {
    const path = join(this.directory(sessionId), `scene-${String(number).padStart(2, "0")}.json`);
    if (!lstatSync(path).isFile()) throw new Error("Recording metadata must be a local file.");
    return JSON.parse(readFileSync(path, "utf8"));
  }

  private directory(sessionId: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(sessionId)) {
      throw new Error("Invalid recording session ID.");
    }
    return join(this.root, sessionId);
  }

  private write(sessionId: string, action: (directory: string) => void): void {
    if (this.writeFailure) throw this.writeFailure;
    const directory = this.directory(sessionId);
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      action(directory);
    } catch (cause) {
      this.writeFailure = new Error("Cannot save the generation record. New provider requests are blocked; check the recordings folder.", { cause });
      throw this.writeFailure;
    }
  }

  record(sessionId: string, kind: string, data: Record<string, unknown>): void {
    const entry = { workflow: this.workflow, at: new Date().toISOString(), kind, data };
    this.write(sessionId, (directory) => {
      appendFileSync(join(directory, "events.jsonl"), `${JSON.stringify(entry)}\n`, { mode: 0o600, flush: true });
    });
  }

  // After an accepted request, a disk failure must not discard the paid result.
  // Report it explicitly; the writeFailure latch stops subsequent submissions.
  afterRequest(action: () => void): void {
    try {
      action();
    } catch (error) {
      console.error("[recordings]", error instanceof Error ? error.message : "Recording failed.");
    }
  }

  saveSceneMetadata(input: RecordedScene): void {
    if (!Number.isSafeInteger(input.sceneNumber) || input.sceneNumber < 1) {
      throw new Error("Invalid recording scene number.");
    }
    const stem = `scene-${String(input.sceneNumber).padStart(2, "0")}`;
    this.write(input.sessionId, (directory) => {
      const filename = join(directory, `${stem}.json`);
      writeFileSync(`${filename}.tmp`, JSON.stringify({
        ...input,
        sourceUrl: input.videoUrl,
        workflow: this.workflow,
        savedAt: new Date().toISOString(),
        actualBilledCost: null,
      }, null, 2), { mode: 0o600 });
      renameSync(`${filename}.tmp`, filename);
    });
  }

  async saveVideo(input: RecordedScene, request: typeof fetch = fetch,
    options: { sleep?: (ms: number) => Promise<void> } = {}): Promise<boolean> {
    const stem = `scene-${String(input.sceneNumber).padStart(2, "0")}`;
    const filename = join(this.directory(input.sessionId), `${stem}.mp4`);
    try {
      const bytes = await readProvider(input.videoUrl, { request, timeoutMs: 60_000,
        sleep: options.sleep, label: "Video download did not return usable media.",
        read: async response => {
          const bytes = Buffer.from(await response.arrayBuffer());
          if (!isVideoContainer(bytes)) throw new Error("Video download was empty or not a video container.");
          return bytes;
        },
      });
      await writeFile(`${filename}.part`, bytes, { mode: 0o600 });
      await rename(`${filename}.part`, filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video download failed.";
      this.afterRequest(() => this.record(input.sessionId, "video-save-failed", { sceneNumber: input.sceneNumber, message }));
      console.error(`[recordings] ${input.sessionId}/${stem}: ${message}`);
      return false;
    }
    this.afterRequest(() => this.record(input.sessionId, "video-saved", { sceneNumber: input.sceneNumber, file: `${stem}.mp4` }));
    return true;
  }
}

import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { TeacherId } from "@/lib/classroom-types";

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

// Small metadata writes are synchronous so intent is durable before a paid POST.
// Video downloads are asynchronous and never delay playback.
export class RecordingStore {
  private writeFailure: Error | null = null;

  constructor(private readonly root: string) {}

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
    const entry = { workflow: RECORDING_WORKFLOW, at: new Date().toISOString(), kind, data };
    this.write(sessionId, (directory) => {
      appendFileSync(join(directory, "events.jsonl"), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
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
        workflow: RECORDING_WORKFLOW,
        savedAt: new Date().toISOString(),
        actualBilledCost: null,
      }, null, 2), { mode: 0o600 });
      renameSync(`${filename}.tmp`, filename);
    });
  }

  async saveVideo(input: RecordedScene, request: typeof fetch = fetch): Promise<void> {
    const stem = `scene-${String(input.sceneNumber).padStart(2, "0")}`;
    const filename = join(this.directory(input.sessionId), `${stem}.mp4`);
    try {
      const response = await request(input.videoUrl, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Video download returned HTTP ${response.status}.`);
      await writeFile(`${filename}.part`, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
      await rename(`${filename}.part`, filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video download failed.";
      this.afterRequest(() => this.record(input.sessionId, "video-save-failed", { sceneNumber: input.sceneNumber, message }));
      console.error(`[recordings] ${input.sessionId}/${stem}: ${message}`);
      return;
    }
    this.afterRequest(() => this.record(input.sessionId, "video-saved", { sceneNumber: input.sceneNumber, file: `${stem}.mp4` }));
  }
}

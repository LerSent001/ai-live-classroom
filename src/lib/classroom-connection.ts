import { parseClassroomApiResponse } from "@/lib/classroom-boundaries";
import { CLASSROOM_CONFIG } from "@/lib/classroom-config";
import type { ClassroomSessionId, ClassroomSnapshot, CommandOutcome } from "@/lib/classroom-types";

export class ClassroomApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ClassroomApiError";
  }
}

export function isMissingClassroomSession(error: unknown): boolean {
  return error instanceof ClassroomApiError && error.status === 404 && error.code === "SESSION_NOT_FOUND";
}

export async function readClassroomResponse(
  response: Response,
  sessionId: ClassroomSessionId,
): Promise<CommandOutcome> {
  const raw: unknown = await response.json();
  const parsed = parseClassroomApiResponse(raw);
  if (!parsed.ok) throw new ClassroomApiError(response.status, parsed.error.code, parsed.error.message);
  if (parsed.outcome.snapshot.id !== sessionId) throw new Error("The classroom response has a different session ID.");
  return parsed.outcome;
}

// Establish the free, idle session before polling. Never replay lesson commands here.
export function watchClassroomSession(input: Readonly<{
  sessionId: ClassroomSessionId;
  onSnapshot: (snapshot: ClassroomSnapshot) => void;
  onError: (error: unknown) => void;
}>): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let connected = false;
  let intervalMs: number = CLASSROOM_CONFIG.pollIntervalMs;

  const poll = async () => {
    try {
      const response = connected
        ? await fetch(`/api/classroom/${input.sessionId}`, { cache: "no-store", signal: controller.signal })
        : await fetch("/api/classroom", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: input.sessionId }),
            signal: controller.signal,
          });
      const outcome = await readClassroomResponse(response, input.sessionId);
      if (controller.signal.aborted) return;
      connected = true;
      input.onSnapshot(outcome.snapshot);
      const startingUp = !outcome.snapshot.hasPlaybackBegun && outcome.snapshot.production.kind !== "idle";
      intervalMs = startingUp ? CLASSROOM_CONFIG.startupPollIntervalMs : CLASSROOM_CONFIG.pollIntervalMs;
    } catch (error) {
      if (controller.signal.aborted) return;
      input.onError(error);
      // A lost server session is terminal for this observer. The UI decides how to re-enter.
      if (isMissingClassroomSession(error)) return;
    }
    if (!controller.signal.aborted) timer = setTimeout(poll, intervalMs);
  };

  void poll();
  return () => {
    controller.abort();
    if (timer !== null) clearTimeout(timer);
  };
}

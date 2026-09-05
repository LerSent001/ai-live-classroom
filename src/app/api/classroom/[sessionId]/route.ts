import { checkOrigin, ownerFrom } from "@/server/tokenpay-wallet";
import {
  parseClassroomCommand,
  toClassroomSessionId,
} from "@/lib/classroom-boundaries";
import type { ClassroomApiResponse } from "@/lib/classroom-types";
import { getClassroomRuntime } from "@/server/classroom-runtime-instance";
import { getSavedClassrooms } from "@/server/archive";
import { DEMO_CONFIG } from "@/lib/classroom-config";

export const runtime = "nodejs";

type ClassroomRouteContext = Readonly<{
  params: Promise<{ sessionId: string }>;
}>;

function errorResponse(status: number, code: string, message: string): Response {
  const body: ClassroomApiResponse = { ok: false, error: { code, message } };
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function sessionIdFrom(context: ClassroomRouteContext) {
  const params = await context.params;
  return toClassroomSessionId(params.sessionId);
}

export async function GET(
  request: Request,
  context: ClassroomRouteContext,
): Promise<Response> {
  const owner = ownerFrom(request);
  if (!owner) return errorResponse(404, "SESSION_NOT_FOUND", "请刷新课堂。");
  if (request.method !== "GET" && !checkOrigin(request)) return errorResponse(403, "ORIGIN", "请求来源无效。");
  try {
    const sessionId = await sessionIdFrom(context);
    const snapshot = getClassroomRuntime(owner).view(sessionId);
    if (!snapshot) {
      return errorResponse(404, "SESSION_NOT_FOUND", "The classroom session was not found.");
    }
    const response: ClassroomApiResponse = {
      ok: true,
      outcome: { kind: "snapshot", snapshot },
    };
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(
      400,
      "INVALID_SESSION_ID",
      error instanceof Error ? error.message : "The session ID was invalid.",
    );
  }
}

export async function POST(
  request: Request,
  context: ClassroomRouteContext,
): Promise<Response> {
  const owner = ownerFrom(request);
  if (!owner) return errorResponse(404, "SESSION_NOT_FOUND", "请刷新课堂。");
  if (request.method !== "GET" && !checkOrigin(request)) return errorResponse(403, "ORIGIN", "请求来源无效。");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "The command was not valid JSON.");
  }
  try {
    const sessionId = await sessionIdFrom(context);
    const command = parseClassroomCommand(body);
    const saved = getSavedClassrooms(owner);
    const match = command.kind === "start" && command.durationSeconds === DEMO_CONFIG.initialDurationSeconds
      ? saved.find(command.topic, command.teacherId)
      : null;
    // Known recordings never fall through to a new paid request, even if a file is missing.
    const outcome = match
      ? getClassroomRuntime(owner).replay(sessionId, saved.load(match.recordingId), command.id)
      : getClassroomRuntime(owner).command(sessionId, command);
    if (!outcome) {
      return errorResponse(404, "SESSION_NOT_FOUND", "The classroom session was not found.");
    }
    const response: ClassroomApiResponse = { ok: true, outcome };
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(
      400,
      "INVALID_COMMAND",
      error instanceof Error ? error.message : "The classroom command was invalid.",
    );
  }
}

export async function DELETE(
  request: Request,
  context: ClassroomRouteContext,
): Promise<Response> {
  const owner = ownerFrom(request);
  if (!owner) return errorResponse(404, "SESSION_NOT_FOUND", "请刷新课堂。");
  if (request.method !== "GET" && !checkOrigin(request)) return errorResponse(403, "ORIGIN", "请求来源无效。");
  try {
    const sessionId = await sessionIdFrom(context);
    const cleared = await getClassroomRuntime(owner).clear(sessionId);
    if (!cleared) {
      return errorResponse(
        409,
        "SESSION_BUSY",
        "Wait for current planning, generation, or playback to finish before starting over.",
      );
    }
    return Response.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(
      400,
      "INVALID_SESSION_ID",
      error instanceof Error ? error.message : "The session ID was invalid.",
    );
  }
}

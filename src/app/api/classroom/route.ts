import { parseCreateClassroomRequest } from "@/lib/classroom-boundaries";
import type { ClassroomApiResponse } from "@/lib/classroom-types";
import { getClassroomRuntime } from "@/server/classroom-runtime-instance";

export const runtime = "nodejs";

function errorResponse(status: number, code: string, message: string): Response {
  const body: ClassroomApiResponse = { ok: false, error: { code, message } };
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "The create request was not valid JSON.");
  }
  try {
    const input = parseCreateClassroomRequest(body);
    const response: ClassroomApiResponse = {
      ok: true,
      outcome: {
        kind: "snapshot",
        snapshot: getClassroomRuntime().create(input),
      },
    };
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(
      400,
      "INVALID_CREATE_REQUEST",
      error instanceof Error ? error.message : "The create request was invalid.",
    );
  }
}

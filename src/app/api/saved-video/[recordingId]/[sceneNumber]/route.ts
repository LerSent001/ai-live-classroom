import { isRecord, toClassroomSessionId } from "@/lib/classroom-boundaries";
import { getSavedClassrooms } from "@/server/archive";
import { recordedVideoResponse } from "@/server/recording-media";

export const runtime = "nodejs";

type Context = Readonly<{ params: Promise<{ recordingId: string; sceneNumber: string }> }>;

async function media(request: Request, context: Context, head: boolean): Promise<Response> {
  const params = await context.params;
  try {
    const id = toClassroomSessionId(params.recordingId);
    if (!/^[1-6]$/.test(params.sceneNumber)) return new Response(null, { status: 404 });
    const path = getSavedClassrooms().mediaPath(id, Number(params.sceneNumber));
    return recordedVideoResponse(path, request.headers.get("range"), head);
  } catch (error) {
    const missing = isRecord(error) && error.code === "ENOENT";
    if (!missing) console.error("[recorded-media]", error);
    return Response.json({ error: "保存的视频文件无法读取。" }, { status: missing ? 404 : 500 });
  }
}

export function GET(request: Request, context: Context): Promise<Response> { return media(request, context, false); }
export function HEAD(request: Request, context: Context): Promise<Response> { return media(request, context, true); }

import { toClassroomSessionId } from "@/lib/classroom-boundaries";
import { ownerFrom } from "@/server/youth-tokenpay-wallet";
import { getYouthSavedClassrooms } from "@/server/youth-runtime-instance";
import { recordedVideoResponse } from "@/server/recording-media";
export const runtime = "nodejs";
type Context = { params: Promise<{ recordingId: string; sceneNumber: string }> };
async function media(request: Request, context: Context, head: boolean) {
  const owner = ownerFrom(request);
  if (!owner || request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 404 });
  try {
    const params = await context.params;
    if (!/^[1-6]$/.test(params.sceneNumber)) throw new Error("Invalid scene");
    const path = getYouthSavedClassrooms(owner).mediaPath(toClassroomSessionId(params.recordingId), Number(params.sceneNumber));
    const response = recordedVideoResponse(path, request.headers.get("range"), head);
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch { return new Response(null, { status: 404 }); }
}
export function GET(request: Request, context: Context) { return media(request, context, false); }
export function HEAD(request: Request, context: Context) { return media(request, context, true); }

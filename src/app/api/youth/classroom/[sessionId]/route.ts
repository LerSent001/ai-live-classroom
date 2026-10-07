import { parseClassroomCommand, toClassroomSessionId } from "@/lib/classroom-boundaries";
import { DEMO_CONFIG } from "@/lib/classroom-config";
import { isYouthMentorTeacher, YOUTH_TEACHER_ID } from "@/lib/youth-classroom";
import { checkOrigin, ownerFrom, wallets } from "@/server/youth-tokenpay-wallet";
import { getYouthRuntime, getYouthSavedClassrooms, repairYouthRecording, youthRecoveryAction } from "@/server/youth-runtime-instance";
import { youthError, youthOutcome } from "@/server/youth-api";
export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };
const missing = () => youthError(404, "SESSION_NOT_FOUND", "课堂连接已失效，请重新进入教室。");
export async function GET(request: Request, context: Context) {
  const owner = ownerFrom(request);
  if (!owner) return missing();
  if (request.headers.get("sec-fetch-site") === "cross-site") return youthError(403, "ORIGIN", "请求来源无效。");
  try {
    const snapshot = getYouthRuntime(owner).view(toClassroomSessionId((await context.params).sessionId));
    return snapshot ? youthOutcome({ kind: "snapshot", snapshot }) : missing();
  } catch { return youthError(400, "INVALID_SESSION_ID", "课堂标识无效。"); }
}
export async function POST(request: Request, context: Context) {
  if (!checkOrigin(request)) return youthError(403, "ORIGIN", "请求来源无效。");
  const owner = ownerFrom(request);
  if (!owner) return missing();
  try {
    const id = toClassroomSessionId((await context.params).sessionId);
    const command = parseClassroomCommand(await request.json());
    const session = getYouthRuntime(owner);
    const current = session.view(id);
    if (!current) return missing();
    if (command.kind === "start" && command.teacherId !== YOUTH_TEACHER_ID && !isYouthMentorTeacher(command.teacherId)) return youthError(400, "INVALID_TEACHER", "中文课堂角色已更新，请刷新页面后重试。");
    if ((command.kind === "start" || command.kind === "queue-lesson") && !wallets.get(owner)) {
      return youthError(402, "WALLET_REQUIRED", "请先连接自己的 TokenDance 钱包。浏览教室不产生生成费用。");
    }
    const saved = getYouthSavedClassrooms(owner);
    const match = command.kind === "start" && current.production.kind === "idle" && command.durationSeconds === DEMO_CONFIG.initialDurationSeconds
      ? saved.find(command.topic, command.teacherId) : null;
    if (match && !match.available) {
      const action = youthRecoveryAction(owner, match.recordingId);
      void repairYouthRecording(owner, match.recordingId).catch(() => {});
      return youthError(409, action ? "RECORDING_ACTION_REQUIRED" : "RECORDING_RECOVERING", action ?? "正在回收这节课程的原任务和视频，完成后自动继续播放；不会重新生成或扣费。");
    }
    // Reuse only this owner's completed recordings; incomplete known recordings
    // fail closed and never silently fall through to another paid generation.
    const outcome = match ? session.replay(id, saved.load(match.recordingId), command.id) : session.command(id, command);
    return outcome ? youthOutcome(outcome) : missing();
  } catch (error) {
    return youthError(400, "INVALID_COMMAND", error instanceof Error && error.message.startsWith("这节课程已有") ? error.message : "课程请求或已有录制不可用，未自动重新提交。请检查课程状态。");
  }
}
export async function DELETE(request: Request, context: Context) {
  if (!checkOrigin(request)) return youthError(403, "ORIGIN", "请求来源无效。");
  const owner = ownerFrom(request);
  if (!owner) return missing();
  try {
    const session = getYouthRuntime(owner);
    const id = toClassroomSessionId((await context.params).sessionId);
    if (!session.view(id)) return missing();
    if (!await session.clear(id, new URL(request.url).searchParams.get("abandon") === "1")) return youthError(409, "SESSION_BUSY", "请等当前生成或播放结束，再开始新课程。");
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch { return youthError(400, "INVALID_SESSION_ID", "课堂标识无效。"); }
}

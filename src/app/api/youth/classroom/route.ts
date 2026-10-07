import { parseCreateClassroomRequest } from "@/lib/classroom-boundaries";
import { checkOrigin, ownerFrom } from "@/server/youth-tokenpay-wallet";
import { getYouthRuntime } from "@/server/youth-runtime-instance";
import { youthError, youthOutcome } from "@/server/youth-api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!checkOrigin(request)) return youthError(403, "ORIGIN", "请求来源无效。");
  const owner = ownerFrom(request);
  if (!owner) return youthError(401, "WALLET_IDENTITY", "请先加载钱包状态，再进入教室。");
  try {
    const input = parseCreateClassroomRequest(await request.json());
    return youthOutcome({ kind: "snapshot", snapshot: getYouthRuntime(owner).create(input) });
  } catch { return youthError(400, "INVALID_CREATE_REQUEST", "课堂请求无效，请重新进入教室。"); }
}

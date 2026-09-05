import { APP_URL, authorizationFlows, checkOrigin, ownerFrom, publicOrigin, readBalance, wallets } from "@/server/tokenpay-wallet";
export const runtime = "nodejs";
type Context = { params: Promise<{ action: string }> };
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "no-store" } }); }
export async function GET(request: Request, context: Context): Promise<Response> {
  const { action } = await context.params;
  const owner = ownerFrom(request);
  if (action === "callback") {
    const url = new URL(request.url);
    const flow = owner && authorizationFlows.consume(url.searchParams.get("state") || "", owner);
    let success = false;
    if (flow && owner && url.searchParams.get("code")) {
      try {
        const response = await fetch("https://tokendance.space/portal/api/v1/auth/keys", {
          method: "POST", headers: { "Content-Type": "application/json", "X-App-URL": APP_URL },
          body: JSON.stringify({ code: url.searchParams.get("code"), code_verifier: flow.verifier, code_challenge_method: "S256" }),
          redirect: "error", signal: AbortSignal.timeout(15_000),
        });
        const data = await response.json();
        if (response.ok && typeof data.key === "string") { wallets.set(owner, data.key); success = true; }
      } catch { /* Never log authorization codes or provider payloads. */ }
    }
    return new Response(null, { status: 303, headers: { location: `${publicOrigin()}/?wallet=${success ? "connected" : "failed"}`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
  if (action !== "status") return json({ error: "Not found" }, 404);
  const key = owner ? wallets.get(owner) : null;
  if (!key) return json({ connected: false });
  try { return json({ connected: true, balanceYuan: await readBalance(key) }); }
  catch { return json({ connected: true, warning: "余额暂时无法读取，请检查钱包状态。" }); }
}
export async function POST(request: Request, context: Context): Promise<Response> {
  if (!checkOrigin(request)) return json({ error: "请求来源无效。" }, 403);
  const owner = ownerFrom(request);
  if (!owner) return json({ error: "请刷新课堂后连接钱包。" }, 401);
  const { action } = await context.params;
  try {
    if (action === "connect") return json({ url: authorizationFlows.begin(owner, publicOrigin()) });
    if (action === "disconnect") { wallets.remove(owner); return json({ connected: false }); }
    if (action === "key") {
      const body = await request.json();
      const key = typeof body.key === "string" ? body.key.trim() : "";
      if (key.length < 20 || key.length > 4096 || /\s/.test(key)) return json({ error: "请输入有效的 TokenDance Key。" }, 400);
      const balanceYuan = await readBalance(key);
      wallets.set(owner, key);
      return json({ connected: true, balanceYuan });
    }
    return json({ error: "Not found" }, 404);
  } catch { return json({ error: "连接失败，请检查 Key、网络或重新授权。" }, 400); }
}

import { APP_URL, authorizationFlows, checkOrigin, newOwner, ownerFrom, publicOrigin, readBalance, wallets } from "@/server/youth-tokenpay-wallet";
export const runtime = "nodejs";
type Context = { params: Promise<{ action: string }> };
function json(body: unknown, status = 200, cookie?: string) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });
}
function validKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 4096 && !/\s/.test(value);
}
export async function GET(request: Request, context: Context): Promise<Response> {
  const { action } = await context.params;
  const owner = ownerFrom(request);
  if (action === "callback") {
    let origin: string;
    try { origin = publicOrigin(request); } catch { return json({ error: "请配置此部署的 TOKENPAY_PUBLIC_URL。" }, 503); }
    const url = new URL(request.url);
    const flow = owner && authorizationFlows.consume(url.searchParams.get("state") || "", owner);
    let success = false;
    const code = url.searchParams.get("code");
    if (flow && owner && code && code.length <= 4096) {
      const revision = wallets.revision(owner);
      try {
        // Exchange once only. Provider responses, code and key never enter logs.
        const response = await fetch("https://tokendance.space/portal/api/v1/auth/keys", {
          method: "POST", headers: { "Content-Type": "application/json", "X-App-URL": APP_URL },
          body: JSON.stringify({ code, code_verifier: flow.verifier, code_challenge_method: "S256" }),
          redirect: "error", signal: AbortSignal.timeout(15_000),
        });
        const data = await response.json();
        if (response.ok && validKey(data.key) && authorizationFlows.isCurrent(flow) && wallets.revision(owner) === revision) {
          wallets.set(owner, data.key); success = true;
        }
      } catch { /* Do not retry an ambiguous one-time exchange. */ }
    }
    return new Response(null, { status: 303, headers: { location: `${origin}/?wallet=${success ? "connected" : "failed"}`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
  if (action !== "status") return json({ error: "接口不存在。" }, 404);
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "请求来源无效。" }, 403);
  try {
    // Bootstrap only this browser's HttpOnly identity; no generation or external
    // request occurs until the user has explicitly connected a wallet.
    const identity = owner ? { owner, cookie: undefined } : newOwner(request);
    const key = wallets.get(identity.owner);
    if (!key) return json({ connected: false }, 200, identity.cookie);
    if (new URL(request.url).searchParams.get("identity") === "1") return json({ connected: true }, 200, identity.cookie);
    try { return json({ connected: true, balanceYuan: await readBalance(key) }, 200, identity.cookie); }
    catch { return json({ connected: true, warning: "余额暂时无法读取；已保存的授权不代表额度充足，请刷新或重新授权。" }, 200, identity.cookie); }
  } catch { return json({ error: "钱包暂时不可用，请检查部署地址或本地存储权限。" }, 503); }
}
export async function POST(request: Request, context: Context): Promise<Response> {
  if (!checkOrigin(request)) return json({ error: "请求来源无效。" }, 403);
  const owner = ownerFrom(request);
  if (!owner) return json({ error: "请刷新钱包状态后再连接。" }, 401);
  const { action } = await context.params;
  try {
    if (action === "connect") return json({ url: authorizationFlows.begin(owner, publicOrigin(request)) });
    if (action === "disconnect") {
      authorizationFlows.cancel(owner);
      wallets.remove(owner);
      return json({ connected: false });
    }
    if (action === "key") {
      const raw = await request.text();
      if (raw.length > 8192) return json({ error: "Key 长度无效。" }, 400);
      const body = JSON.parse(raw);
      const key = typeof body?.key === "string" ? body.key.trim() : "";
      if (!validKey(key)) return json({ error: "请输入有效的 TokenDance API Key。" }, 400);
      const revision = wallets.revision(owner);
      const balanceYuan = await readBalance(key);
      if (wallets.revision(owner) !== revision) return json({ error: "钱包状态已更改，请重新连接。" }, 409);
      authorizationFlows.cancel(owner);
      wallets.set(owner, key);
      return json({ connected: true, balanceYuan });
    }
    return json({ error: "接口不存在。" }, 404);
  } catch { return json({ error: "连接失败，请检查 Key、网络或重新授权。" }, 400); }
}

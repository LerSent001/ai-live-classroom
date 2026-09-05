import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export const APP_URL = "https://github.com/LerSent001/ai-live-classroom";
const cookieName = "classroom_wallet";
export function publicOrigin(): string {
  const url = new URL(process.env.TOKENPAY_PUBLIC_URL || "http://localhost:3000");
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("TOKENPAY_PUBLIC_URL must use HTTPS.");
  return url.origin;
}
export function checkOrigin(request: Request): boolean {
  return request.headers.get("origin") === publicOrigin();
}
export function ownerFrom(request: Request): string | null {
  const token = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
export function newOwner(): { owner: string; cookie: string } {
  const token = randomBytes(32).toString("hex");
  return { owner: createHash("sha256").update(token).digest("hex"), cookie: `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${publicOrigin().startsWith("https:") ? "; Secure" : ""}` };
}

export class WalletStore {
  constructor(private readonly root: string) {}
  private path(owner: string): string {
    if (!/^[a-f0-9]{64}$/.test(owner)) throw new Error("Invalid wallet owner.");
    return join(this.root, owner + ".enc");
  }
  private secret(): Buffer {
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const path = join(this.root, "encryption-key");
    try { writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const secret = readFileSync(path);
    if (secret.length !== 32) throw new Error("Invalid wallet encryption key.");
    return secret;
  }
  get(owner: string): string | null {
    let data: Buffer;
    try { data = readFileSync(this.path(owner)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const decipher = createDecipheriv("aes-256-gcm", this.secret(), data.subarray(0, 12));
    decipher.setAAD(Buffer.from(owner));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  }
  set(owner: string, key: string): void {
    if (!key || key.length > 4096 || /\s/.test(key)) throw new Error("Invalid API key.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.secret(), iv);
    cipher.setAAD(Buffer.from(owner));
    const ciphertext = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
    const path = this.path(owner), temp = path + "." + randomBytes(8).toString("hex");
    writeFileSync(temp, Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), { mode: 0o600, flag: "wx" });
    renameSync(temp, path);
  }
  remove(owner: string): void {
    try { unlinkSync(this.path(owner)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
export const wallets = new WalletStore(join(process.cwd(), ".tokenpay"));

type Flow = { owner: string; verifier: string; expires: number };
export class AuthorizationFlows {
  private flows = new Map<string, Flow>();
  begin(owner: string, origin: string): string {
    for (const [id, flow] of this.flows) if (flow.expires < Date.now()) this.flows.delete(id);
    const state = randomBytes(32).toString("hex"), verifier = randomBytes(32).toString("base64url");
    this.flows.set(state, { owner, verifier, expires: Date.now() + 600_000 });
    const callback = new URL("/api/tokenpay/callback", origin); callback.searchParams.set("state", state);
    const url = new URL("https://tokendance.space/auth");
    url.search = new URLSearchParams({ callback_url: callback.toString(), code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", app_url: APP_URL, key_name: "AI Live Classroom" }).toString();
    return url.toString();
  }
  consume(state: string, owner: string): Flow | null {
    const flow = this.flows.get(state);
    if (!flow || flow.owner !== owner) return null;
    this.flows.delete(state);
    return flow.expires > Date.now() ? flow : null;
  }
}
const globalWallet = globalThis as typeof globalThis & { tokenpayFlows?: AuthorizationFlows };
export const authorizationFlows = globalWallet.tokenpayFlows ??= new AuthorizationFlows();
export async function readBalance(key: string, request: typeof fetch = fetch): Promise<number> {
  const response = await request("https://tokendance.space/portal/api/v1/user/balance", {
    headers: { Authorization: `Bearer ${key}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`钱包验证失败（${response.status}），请检查 Key 或重新授权。`);
  const data = await response.json();
  if (typeof data?.balance?.balance !== "number" || !Number.isFinite(data.balance.balance)) throw new Error("钱包余额响应无效。");
  return data.balance.balance / 1_000_000;
}

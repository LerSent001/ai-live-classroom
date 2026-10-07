import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { readProvider } from "./provider-read";

export const APP_URL = "https://github.com/LerSent001/ai-live-classroom";
const cookieName = "youth_classroom_wallet";
// In production use one explicit canonical origin. Only loopback development
// may derive its origin from the request (so local preview ports work).
export function publicOrigin(request: Request): string {
  const configured = process.env.TOKENPAY_PUBLIC_URL?.trim();
  const url = new URL(configured || request.url);
  if (!configured) {
    // Next may normalize request.url to localhost even when the browser uses
    // 127.0.0.1. Trust Host only after a strict loopback allowlist, never arbitrary
    // external/forwarded hosts. Public deployments still require the env value.
    const host = request.headers.get("host");
    if (host) {
      if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) throw new Error("请配置 TOKENPAY_PUBLIC_URL。");
      url.host = host;
    }
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!configured && !loopback) || (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) || url.username || url.password) {
    throw new Error("请为此部署配置 HTTPS 的 TOKENPAY_PUBLIC_URL。");
  }
  return url.origin;
}
export function checkOrigin(request: Request): boolean {
  try { return request.headers.get("origin") === publicOrigin(request); }
  catch { return false; }
}
export function ownerFrom(request: Request): string | null {
  const token = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
export function newOwner(request: Request): { owner: string; cookie: string } {
  const token = randomBytes(32).toString("hex");
  return { owner: createHash("sha256").update(token).digest("hex"), cookie: `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${publicOrigin(request).startsWith("https:") ? "; Secure" : ""}` };
}

export class WalletStore {
  private revisions = new Map<string, number>();
  constructor(private readonly root: string) {}
  revision(owner: string): number { return this.revisions.get(owner) ?? 0; }
  private changed(owner: string): void { this.revisions.set(owner, this.revision(owner) + 1); }
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
    this.changed(owner);
  }
  remove(owner: string): void {
    this.changed(owner);
    try { unlinkSync(this.path(owner)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}


type Flow = { owner: string; verifier: string; expires: number; generation: number };
export class AuthorizationFlows {
  private flows = new Map<string, Flow>();
  private generations = new Map<string, number>();
  begin(owner: string, origin: string): string {
    for (const [id, flow] of this.flows) if (flow.expires < Date.now()) this.flows.delete(id);
    // One outstanding authorization per browser: a later connect supersedes it.
    this.cancel(owner);
    const state = randomBytes(32).toString("hex"), verifier = randomBytes(32).toString("base64url");
    this.flows.set(state, { owner, verifier, expires: Date.now() + 600_000, generation: this.generations.get(owner)! });
    const callback = new URL("/api/youth/tokenpay/callback", origin); callback.searchParams.set("state", state);
    const url = new URL("https://tokendance.space/auth");
    url.search = new URLSearchParams({ callback_url: callback.toString(), code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", app_url: APP_URL, key_name: "中文青少年课堂" }).toString();
    return url.toString();
  }
  cancel(owner: string): void {
    this.generations.set(owner, (this.generations.get(owner) ?? 0) + 1);
    for (const [id, flow] of this.flows) if (flow.owner === owner) this.flows.delete(id);
  }
  isCurrent(flow: Flow): boolean { return this.generations.get(flow.owner) === flow.generation; }
  consume(state: string, owner: string): Flow | null {
    const flow = this.flows.get(state);
    if (!flow || flow.owner !== owner) return null;
    this.flows.delete(state);
    return flow.expires > Date.now() ? flow : null;
  }
}
const globalWallet = globalThis as typeof globalThis & {
  youthWalletStoreV1?: WalletStore;
  youthWalletFlowsV1?: AuthorizationFlows;
};
export const wallets = globalWallet.youthWalletStoreV1 ??= new WalletStore(join(process.cwd(), ".youth-tokenpay"));
export const authorizationFlows = globalWallet.youthWalletFlowsV1 ??= new AuthorizationFlows();
export async function readBalance(key: string, request: typeof fetch = fetch): Promise<number> {
  const data = await readProvider("https://tokendance.space/portal/api/v1/user/balance", {
    request, headers: { Authorization: `Bearer ${key}` }, label: "钱包验证失败，请检查网络、Key 或重新授权。",
    read: response => response.json(),
  });
  if (typeof data?.balance?.balance !== "number" || !Number.isFinite(data.balance.balance)) throw new Error("钱包余额响应无效。");
  return data.balance.balance / 1_000_000;
}

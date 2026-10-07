import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "@/app/api/youth/tokenpay/[action]/route";
import { wallets, authorizationFlows, newOwner, ownerFrom } from "./youth-tokenpay-wallet";
const origin = "http://127.0.0.1:3029";
const context = (action: string) => ({ params: Promise.resolve({ action }) });
function request(action: string, cookie = "", body?: unknown, requestOrigin = origin) {
  return new Request(`${origin}/api/youth/tokenpay/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: requestOrigin, cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
test("wallet bootstrap is free, HttpOnly and never exposes a shared or stored key", async (t) => {
  t.mock.method(wallets, "get", () => null);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected provider call"); });
  const response = await GET(request("status"), context("status"));
  assert.deepEqual(await response.json(), { connected: false });
  assert.match(response.headers.get("set-cookie")!, /youth_classroom_wallet=.*HttpOnly; SameSite=Lax/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("local wallet identity restores immediately even if remote balance is unavailable", async t => {
  const identity = newOwner(request("status")); let requests = 0;
  t.mock.method(wallets, "get", () => "fake-stored-key-never-real");
  t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("balance unreachable"); });
  const response = await GET(new Request(`${origin}/api/youth/tokenpay/status?identity=1`, { headers: { cookie: identity.cookie } }), context("status"));
  assert.deepEqual(await response.json(), { connected: true }); assert.equal(requests, 0);
});
test("CSRF and invalid manual keys fail before any provider request", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected provider call"); });
  const identity = newOwner(request("status"));
  assert.equal((await POST(request("disconnect", identity.cookie, {}, "https://attacker.example"), context("disconnect"))).status, 403);
  assert.equal((await POST(request("key", identity.cookie, { key: "short" }), context("key"))).status, 400);
  assert.equal((await POST(request("connect", "", {}), context("connect"))).status, 401);
});
test("manual key is balance-validated server-side and the response contains only public status", async (t) => {
  const identity = newOwner(request("status"));
  const saved: string[] = [];
  t.mock.method(wallets, "set", (owner: string, key: string) => { assert.equal(owner, identity.owner); saved.push(key); });
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://tokendance.space/portal/api/v1/user/balance");
    assert.equal(init.redirect, "error");
    return Response.json({ balance: { balance: 1500000 } });
  });
  const response = await POST(request("key", identity.cookie, { key: "fake-test-key-never-use-real" }), context("key"));
  assert.deepEqual(await response.json(), { connected: true, balanceYuan: 1.5 });
  assert.equal(saved.length, 1);
});
test("authorization callback is owner-bound, S256, one-use and redirects to youth only", async (t) => {
  const identity = newOwner(request("status"));
  const stranger = newOwner(request("status"));
  const connected = await POST(request("connect", identity.cookie, {}), context("connect"));
  const auth = new URL((await connected.json()).url);
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  const callback = new URL(auth.searchParams.get("callback_url")!);
  callback.searchParams.set("code", "fake-code");
  const callbackRequest = (cookie: string) => new Request(callback, { headers: { cookie } });
  let exchanges = 0, saves = 0;
  t.mock.method(wallets, "set", (owner: string) => { assert.equal(owner, identity.owner); saves++; });
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    exchanges++;
    const body = JSON.parse(String(init.body)); assert.equal(body.code_verifier.length, 43);
    return Response.json({ key: "fake-callback-key-not-real" });
  });
  assert.equal((await GET(callbackRequest(stranger.cookie), context("callback"))).headers.get("location"), `${origin}/?wallet=failed`);
  assert.equal(exchanges, 0);
  const response = await GET(callbackRequest(identity.cookie), context("callback"));
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), `${origin}/?wallet=connected`);
  await GET(callbackRequest(identity.cookie), context("callback"));
  assert.equal(exchanges, 1); assert.equal(saves, 1);
  assert.equal(ownerFrom(callbackRequest(identity.cookie)), identity.owner);
});
test("disconnect cancels pending and in-flight authorizations", async (t) => {
  const identity = newOwner(request("status"));
  const auth = new URL(authorizationFlows.begin(identity.owner, origin));
  const callback = new URL(auth.searchParams.get("callback_url")!); callback.searchParams.set("code", "fake-code");
  const exchange = Promise.withResolvers<Response>();
  let saves = 0;
  t.mock.method(wallets, "set", () => { saves++; });
  t.mock.method(wallets, "remove", () => {});
  t.mock.method(globalThis, "fetch", async () => exchange.promise);
  const pending = GET(new Request(callback, { headers: { cookie: identity.cookie } }), context("callback"));
  await new Promise((resolve) => setImmediate(resolve));
  await POST(request("disconnect", identity.cookie, {}), context("disconnect"));
  exchange.resolve(Response.json({ key: "fake-callback-key-not-real" }));
  assert.match((await pending).headers.get("location")!, /wallet=failed$/);
  assert.equal(saves, 0);
});

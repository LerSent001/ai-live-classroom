import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WalletStore, AuthorizationFlows, newOwner, ownerFrom, checkOrigin, readBalance } from "./tokenpay-wallet";
test("wallet keys are encrypted, isolated, and bound to their owner", () => {
  const root = mkdtempSync(join(tmpdir(), "wallet-test-"));
  try {
    const store = new WalletStore(root), a = "a".repeat(64), b = "b".repeat(64);
    store.set(a, "test-key-never-share-this-value");
    assert.equal(store.get(a), "test-key-never-share-this-value");
    assert.equal(store.get(b), null);
    assert.equal(readFileSync(join(root, a + ".enc")).includes("test-key-never-share-this-value"), false);
    copyFileSync(join(root, a + ".enc"), join(root, b + ".enc"));
    assert.throws(() => store.get(b));
    assert.throws(() => store.get("../escape"));
    store.remove(a); assert.equal(store.get(a), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("PKCE binds callback to browser, validates expiration, and consumes once", () => {
  const flows = new AuthorizationFlows();
  const url = new URL(flows.begin("alice", "http://localhost:3000"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const state = new URL(url.searchParams.get("callback_url")!).searchParams.get("state")!;
  assert.equal(flows.consume(state, "bob"), null);
  assert.equal(flows.consume("wrong-state", "alice"), null);
  assert.equal(flows.consume(state, "alice")?.verifier.length, 43);
  assert.equal(flows.consume(state, "alice"), null);
  const expired = new URL(new URL(flows.begin("alice", "http://localhost:3000")).searchParams.get("callback_url")!).searchParams.get("state")!;
  const now = Date.now; Date.now = () => now() + 700_000;
  try { assert.equal(flows.consume(expired, "alice"), null); } finally { Date.now = now; }
});
test("cookie is HttpOnly and cross-origin mutations fail", () => {
  const identity = newOwner();
  assert.match(identity.cookie, /HttpOnly; SameSite=Lax/);
  assert.equal(ownerFrom(new Request("http://localhost:3000", { headers: { cookie: identity.cookie } })), identity.owner);
  assert.equal(ownerFrom(new Request("http://localhost:3000")), null);
  assert.equal(checkOrigin(new Request("http://localhost:3000", { headers: { origin: "https://evil.example" } })), false);
});
test("balance conversion uses microyuan and does not redirect credentials", async () => {
  const result = await readBalance("fake-key", async (url, init) => {
    assert.equal(String(url), "https://tokendance.space/portal/api/v1/user/balance");
    assert.equal(init?.redirect, "error");
    return Response.json({ balance: { balance: 162811 } });
  });
  assert.equal(result, .162811);
});

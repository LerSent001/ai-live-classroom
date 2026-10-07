// No-spend smoke test against a real production build: boots `next start` with a blank FAL_KEY and
// proves the app serves, creates sessions, and refuses to admit any paid work without a key.
// Run `npm run build` first; then `npm run verify`.
import { spawn } from "node:child_process";
import process from "node:process";

const port = Number(process.env.VERIFY_PORT || 3217);
const baseUrl = `http://127.0.0.1:${port}`;

function check(condition, message) {
  if (!condition) throw new Error(message);
  process.stdout.write(`✓ ${message}\n`);
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("The production server did not become ready within 30 seconds");
}

// Spawned in its own process group so the whole tree (npm wrapper + next server) can be killed:
// killing only the wrapper orphans the server on Linux and hangs CI on its open output pipes.
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
  {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), FAL_KEY: "", TOKENDANCE_API_KEY: "", SAVE_RECORDINGS: "0", TOKENPAY_PUBLIC_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

try {
  await waitForServer();

  const pageResponse = await fetch(baseUrl);
  const page = await pageResponse.text();
  check(pageResponse.status === 200, "home page responds with HTTP 200");
  check(page.includes('data-theme="zh-youth"') && page.includes("正在进入教室") && !page.includes("classroom-entrance-loading"), "Chinese classroom is the default home, without bear entrance assets");
  check(!page.includes('id="youth-topic"'), "lesson input waits for the classroom entrance to finish");
  const demoPage = await (await fetch(`${baseUrl}/styles/monokuma`)).text();
  check(demoPage.includes("classroom-entrance-loading"), "Monokuma remains an independent style route");

  const sessionId = "classroom-no-spend-verification";
  const createResponse = await fetch(`${baseUrl}/api/classroom`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const created = await createResponse.json();
  check(created.outcome.snapshot.teacherId === "monokuma", "new sessions default to Monokuma");
  check(createResponse.status === 200, "idle classroom session can be created");
  check(
    created?.outcome?.snapshot?.configured === false &&
      created?.outcome?.snapshot?.metrics?.estimatedSpendCents === 0,
    "blank-key session is unconfigured and has admitted zero provider work",
  );

  const startResponse = await fetch(`${baseUrl}/api/classroom/${sessionId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "start",
      teacherId: "monomi",
      id: "command-no-spend-start",
      topic: "Why does the Moon appear to change shape?",
      durationSeconds: 30,
      atMs: Date.now(),
    }),
  });
  const started = await startResponse.json();
  check(startResponse.status === 200, "start returns an explicit setup result without a key");
  check(
    started?.outcome?.snapshot?.production?.kind === "idle" &&
      started?.outcome?.snapshot?.metrics?.estimatedSpendCents === 0 &&
      started?.outcome?.snapshot?.scenes?.length === 0,
    "missing-key start fails before lesson planning or any H3 admission",
  );

  const invalidTeacher = await fetch(`${baseUrl}/api/classroom/${sessionId}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "start", teacherId: "tung", id: "invalid-teacher", topic: "重力", durationSeconds: 30, atMs: Date.now() }),
  });
  check(invalidTeacher.status === 400, "unknown teachers are rejected at the API boundary");

  const youthResponse = await fetch(`${baseUrl}/zh-youth`);
  const youthPage = await youthResponse.text();
  check(youthResponse.status === 200 && youthPage.includes('data-theme="zh-youth"'), "previous Chinese classroom URL remains compatible");
  check(youthPage.includes('data-lesson-mode="question"') && !youthPage.includes("学习阶段") && !youthPage.includes("classroom-entrance-loading"), "youth route is question-driven with no stage selection or bear entrance");
  for (const teacherId of ["youth-question", "youth-kindergarten", "youth-primary", "youth-middle", "youth-high"]) {
    const response = await fetch(`${baseUrl}/api/classroom/${sessionId}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "start", teacherId, id: `no-spend-${teacherId}`, topic: "彩虹是怎么形成的？", durationSeconds: 30, atMs: Date.now() }),
    });
    const result = await response.json();
    check(response.ok && result.outcome.snapshot.metrics.estimatedSpendCents === 0 && result.outcome.snapshot.scenes.length === 0,
      `${teacherId} is accepted and blank keys prevent provider work`);
  }
  const wallet = await fetch(`${baseUrl}/api/youth/tokenpay/status`);
  const cookie = wallet.headers.get("set-cookie")?.split(";")[0];
  check(cookie && (await wallet.json()).connected === false, "youth wallet bootstraps a separate browser identity without a provider request");
  check(wallet.headers.get("set-cookie").includes("HttpOnly"), "wallet identity is HttpOnly");
  const youthId = "youth-wallet-no-spend";
  const headers = { cookie, origin: baseUrl, "content-type": "application/json" };
  const youthCreate = await fetch(`${baseUrl}/api/youth/classroom`, { method: "POST", headers, body: JSON.stringify({ sessionId: youthId }) });
  const youthCreated = await youthCreate.json();
  check(youthCreate.ok && youthCreated.outcome.snapshot.configured === false && youthCreated.outcome.snapshot.metrics.estimatedSpendCents === null, "youth has no shared credentials and no fabricated TokenDance spend");
  const denied = await fetch(`${baseUrl}/api/youth/classroom/${youthId}`, {
    method: "POST", headers, body: JSON.stringify({ kind: "start", teacherId: "youth-question", id: "wallet-no-spend", topic: "重力", durationSeconds: 30, atMs: Date.now() }),
  });
  check(denied.status === 402 && (await denied.json()).error.code === "WALLET_REQUIRED", "disconnected wallet blocks planning and video generation");
  for (const teacherId of ["youth-mentor-male", "youth-mentor-female"]) {
    const mentorStart = await fetch(`${baseUrl}/api/youth/classroom/${youthId}`, {
      method: "POST", headers, body: JSON.stringify({ kind: "start", teacherId, id: `wallet-no-spend-${teacherId}`, topic: "重力", durationSeconds: 30, atMs: Date.now() }),
    });
    check(mentorStart.status === 402 && (await mentorStart.json()).error.code === "WALLET_REQUIRED", `${teacherId} is accepted but cannot spend without a connected wallet`);
  }
  const legacyStart = await fetch(`${baseUrl}/api/youth/classroom/${youthId}`, {
    method: "POST", headers, body: JSON.stringify({ kind: "start", teacherId: "youth-primary", id: "legacy-no-spend", topic: "重力", durationSeconds: 30, atMs: Date.now() }),
  });
  check(legacyStart.status === 400 && (await legacyStart.json()).error.code === "INVALID_TEACHER", "new youth lessons reject obsolete age-scoped identities");
  const state = await (await fetch(`${baseUrl}/api/youth/classroom/${youthId}`, { headers: { cookie } })).json();
  check(state.outcome.snapshot.production.kind === "idle" && state.outcome.snapshot.scenes.length === 0, "wallet rejection leaves the classroom idle with zero jobs");
  check((await fetch(`${baseUrl}/api/youth/classroom/${youthId}`)).status === 404, "another browser cannot read a youth session");
  check((await fetch(`${baseUrl}/api/classroom/${youthId}`)).status === 404, "original demo cannot read a youth session");
  check((await fetch(`${baseUrl}/api/youth/classroom/${sessionId}`, { headers: { cookie } })).status === 404, "youth runtime cannot read original demo sessions");
  check((await fetch(`${baseUrl}/api/youth/tokenpay/disconnect`, { method: "POST", headers: { cookie, origin: "https://attacker.example" } })).status === 403, "cross-origin wallet mutations are rejected");
  check((await fetch(`${baseUrl}/api/youth/classroom/${youthId}`, { method: "DELETE", headers: { cookie, origin: "https://attacker.example" } })).status === 403, "cross-origin classroom mutations are rejected");
  check((await fetch(`${baseUrl}/api/youth/saved-video/${youthId}/1`)).status === 404, "youth recordings require their owner's cookie");
} catch (error) {
  process.stderr.write(`${serverOutput}\n`);
  throw error;
} finally {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

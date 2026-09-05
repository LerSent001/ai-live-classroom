// No-spend smoke test against a real production build: boots `next start` with a blank FAL_KEY and
// proves the app serves, creates sessions, and refuses to admit any paid work without a key.
// Run `npm run build` first; then `npm run verify`.
import { spawn } from "node:child_process";
import process from "node:process";

const port = 3217;
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
  "npm",
  ["run", "start", "--", "-H", "127.0.0.1", "-p", String(port)],
  {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), FAL_KEY: "", GEMINI_API_KEY: "", SAVE_RECORDINGS: "0" },
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
  check(page.includes("classroom-entrance-loading") && page.includes("正在进入教室"), "home page renders the loading screen before hydration");
  check(!page.includes('id="lesson-topic"'), "lesson input waits for the classroom entrance to finish");

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

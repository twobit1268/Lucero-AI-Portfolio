import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { authorTest } from "./author/authorTest.js";
import { runSuite } from "./orchestrator/runner.js";
import { writeReport } from "./orchestrator/report.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const GENERATED_TESTS_DIR = path.join(ROOT, "generated-tests");
const REPORTS_DIR = path.join(ROOT, "reports");
const HEAL_LOG_PATH = path.join(REPORTS_DIR, "heal-log.jsonl");
const FIXTURE_URL = "http://localhost:4173";

function startFixture(uiVersion: 1 | 2): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/fixture/server.ts"], {
      cwd: ROOT,
      env: { ...process.env, UI_VERSION: String(uiVersion) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      process.stdout.write(`[fixture] ${chunk}`);
      resolve(child);
    });
    child.stderr?.on("data", (chunk) => process.stderr.write(`[fixture] ${chunk}`));
    child.on("error", reject);
  });
}

async function stopFixture(child: ChildProcess): Promise<void> {
  child.kill();
  await sleep(200);
}

async function cmdAuthor(spec: string, url = FIXTURE_URL) {
  const outPath = await authorTest(spec, url);
  console.log(`Generated test: ${outPath}`);
}

async function cmdRun() {
  const results = await runSuite(GENERATED_TESTS_DIR);
  for (const r of results) {
    console.log(`${r.status === "passed" ? "✅" : "❌"} ${r.name} (${r.durationMs}ms)`);
    if (r.rootCause) console.log(`   root cause: ${r.rootCause}`);
  }
  const reportPath = await writeReport(results, REPORTS_DIR, HEAL_LOG_PATH);
  console.log(`\nReport: ${reportPath}`);
}

async function cmdDemo() {
  console.log("=== Step 1: start fixture app (v1 — original UI) ===");
  let fixture = await startFixture(1);
  await sleep(300);

  console.log("\n=== Step 2: author a test from plain English (KaneAI-style) ===");
  await cmdAuthor("Log in with valid credentials demo/password123 and see the welcome message");

  console.log("\n=== Step 3: run the suite against v1 (expect a clean pass, no healing) ===");
  await cmdRun();

  console.log("\n=== Step 4: simulate a UI refactor — swap in v2 (button id/class/label all change) ===");
  await stopFixture(fixture);
  fixture = await startFixture(2);
  await sleep(300);

  console.log("\n=== Step 5: re-run the SAME generated test against v2 (self-healing should kick in) ===");
  await cmdRun();

  await stopFixture(fixture);
  console.log("\nDemo complete. Open the latest reports/report-*.html to see results + heal-log.jsonl events.");
}

const [, , command, ...args] = process.argv;

switch (command) {
  case "author":
    await cmdAuthor(args.join(" "));
    break;
  case "run":
    await cmdRun();
    break;
  case "demo":
    await cmdDemo();
    break;
  default:
    console.log("Usage: npm run author -- \"<spec>\" | npm run run-suite | npm run demo");
    process.exit(1);
}

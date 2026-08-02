import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TestResult } from "./runner.js";

interface HealEvent {
  timestamp: string;
  intent: string;
  primaryDescription: string;
  outcome: "primary-ok" | "healed" | "heal-failed";
  healedStrategy?: string;
  reasoning?: string;
}

async function readHealLog(healLogPath: string): Promise<HealEvent[]> {
  try {
    const raw = await readFile(healLogPath, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as HealEvent);
  } catch {
    return [];
  }
}

function row(cells: string[]): string {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

export async function writeReport(
  results: TestResult[],
  reportsDir: string,
  healLogPath: string
): Promise<string> {
  await mkdir(reportsDir, { recursive: true });
  const healEvents = await readHealLog(healLogPath);

  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.length - passed;
  const healed = healEvents.filter((e) => e.outcome === "healed").length;

  const html = `<!doctype html>
<html>
<head>
<title>TestPilot AI — Run Report</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 2rem; color: #1a1a1a; }
  .summary { display: flex; gap: 1.5rem; margin-bottom: 1.5rem; }
  .stat { padding: 0.75rem 1.25rem; border-radius: 8px; background: #f4f4f5; }
  .stat.pass { background: #dcfce7; }
  .stat.fail { background: #fee2e2; }
  .stat.heal { background: #fef9c3; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e5e5; font-size: 0.9rem; }
  .status-passed { color: #15803d; font-weight: 600; }
  .status-failed { color: #b91c1c; font-weight: 600; }
</style>
</head>
<body>
  <h1>TestPilot AI — Run Report</h1>
  <div class="summary">
    <div class="stat pass"><strong>${passed}</strong> passed</div>
    <div class="stat fail"><strong>${failed}</strong> failed</div>
    <div class="stat heal"><strong>${healed}</strong> selector(s) self-healed</div>
  </div>

  <h2>Test results</h2>
  <table>
    <tr><th>Test</th><th>Status</th><th>Duration</th><th>Root cause (if failed)</th></tr>
    ${results
      .map((r) =>
        row([
          r.name,
          `<span class="status-${r.status}">${r.status}</span>`,
          `${r.durationMs}ms`,
          r.rootCause ?? "",
        ])
      )
      .join("\n")}
  </table>

  <h2>Self-healing events</h2>
  <table>
    <tr><th>Time</th><th>Intent</th><th>Primary selector</th><th>Outcome</th><th>Reasoning</th></tr>
    ${healEvents
      .map((e) =>
        row([e.timestamp, e.intent, e.primaryDescription, e.outcome, e.reasoning ?? ""])
      )
      .join("\n")}
  </table>
</body>
</html>`;

  const outPath = path.join(reportsDir, `report-${Date.now()}.html`);
  await writeFile(outPath, html, "utf-8");
  return outPath;
}

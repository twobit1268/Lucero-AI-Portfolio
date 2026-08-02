import { chromium } from "playwright";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { explainFailure } from "../analysis/rootCause.js";

export interface TestResult {
  name: string;
  status: "passed" | "failed";
  durationMs: number;
  error?: string;
  rootCause?: string;
}

type TestModule = {
  default: (page: import("playwright").Page) => Promise<void>;
  targetUrl?: string;
};

/** Run a bounded number of async jobs concurrently — a scaled-down stand-in
 * for HyperExecute's parallel-worker orchestration (real distributed grid
 * infra is out of scope for a local demo; the concurrency-limiting and
 * result-aggregation shape is the part worth replicating). */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await work(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function runOneTest(filePath: string): Promise<TestResult> {
  const name = path.basename(filePath);
  const start = Date.now();
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    // Cache-bust the dynamic import — Node's module cache would otherwise
    // silently serve a stale version if the same file path is re-run within
    // one process (as the demo's v1 -> v2 re-run does).
    const mod = (await import(
      `${pathToFileURL(filePath).href}?t=${Date.now()}`
    )) as TestModule;
    if (mod.targetUrl) await page.goto(mod.targetUrl);
    await mod.default(page);
    return { name, status: "passed", durationMs: Date.now() - start };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const rootCause = await explainFailure(name, error).catch(
      () => "(root-cause analysis unavailable)"
    );
    return { name, status: "failed", durationMs: Date.now() - start, error, rootCause };
  } finally {
    await browser.close();
  }
}

export async function runSuite(
  generatedTestsDir: string,
  concurrency = 4
): Promise<TestResult[]> {
  const files = (await readdir(generatedTestsDir))
    .filter((f) => f.endsWith(".spec.ts") || f.endsWith(".spec.js"))
    .map((f) => path.join(generatedTestsDir, f));

  if (files.length === 0) {
    throw new Error(`No generated tests found in ${generatedTestsDir}. Run "author" first.`);
  }

  return runWithConcurrency(files, concurrency, runOneTest);
}

import { chromium } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { snapshotAccessibleElements } from "../shared/domSnapshot.js";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

/**
 * KaneAI-style natural-language test authoring.
 *
 * The real product plans, authors, and refines tests from plain English.
 * This mini version does the same three steps against a real page:
 *   1. Load the target URL and pull a simplified accessibility snapshot
 *      (role/id/label/text — not raw HTML) so the prompt stays small and
 *      reasons about the same thing Playwright's own locator engine would.
 *   2. Send the snapshot + the plain-English spec to Claude, asking for a
 *      test module that wraps every interactive-element lookup in `heal()`
 *      (see ../heal/selfHealingLocator.ts) so authoring and self-healing
 *      share one code path instead of being two disconnected demos.
 *   3. Write the generated module to generated-tests/.
 */

function slugify(spec: string): string {
  return spec
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function authorTest(spec: string, targetUrl: string): Promise<string> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(targetUrl);
  const domSnapshot = await snapshotAccessibleElements(page);
  await browser.close();

  const client = new Anthropic();
  const prompt = `You are generating a test module for a mini test-authoring agent.

Target URL: ${targetUrl}

Simplified accessibility snapshot of the page (tag, id, role, associated label text, visible text):
${domSnapshot}

Natural-language test spec to implement:
"${spec}"

Output a TypeScript module with EXACTLY this shape (no markdown fences, no explanation, just the code):

import type { Page } from "playwright";
import { heal } from "../src/heal/selfHealingLocator.js";
import assert from "node:assert";

export default async function run(page: Page): Promise<void> {
  // ... steps here
}

Rules:
- Only reference elements that actually appear in the snapshot above — do not invent selectors.
- For simple, stable-by-nature lookups (getByLabel on a form field) call Playwright directly.
- For any element whose selector could plausibly change in a future UI refactor (buttons, submit controls, elements identified mainly by id/class rather than accessible label), resolve it through:
    const el = await heal(page, { intent: "<plain-English description>", primary: () => page.getByRole(...), primaryDescription: "<string form of the locator>" });
    await el.click();
- Include at least one node:assert assertion that directly verifies the spec's expected outcome (e.g. assert.strictEqual(await page.locator("#welcome-message").isVisible(), true)).
- Do not wrap the function body in try/catch — let assertion/locator errors propagate so the orchestrator can catch and report them.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  const code = block.type === "text" ? block.text : "";

  const outDir = path.resolve(import.meta.dirname, "../../generated-tests");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slugify(spec)}.spec.ts`);
  await writeFile(outPath, code, "utf-8");

  return outPath;
}

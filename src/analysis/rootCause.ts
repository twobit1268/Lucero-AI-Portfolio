import { complete } from "../shared/llmClient.js";

/**
 * KaneAI-style root-cause analysis: turn a raw stack trace / assertion
 * error into a short plain-English diagnosis, instead of leaving whoever
 * reads the report to re-parse a Playwright error message from scratch.
 */
export async function explainFailure(testName: string, rawError: string): Promise<string> {
  const prompt = `A browser test named "${testName}" failed with this error:

${rawError}

In 2-3 sentences, explain the likely root cause in plain English (e.g. "selector no longer matches because X changed" vs. "assertion failed because the app returned Y instead of Z" vs. "timing/flake issue"), and suggest one concrete next step. Do not restate the raw error back verbatim.`;

  const text = await complete(prompt, 200);
  return text.trim() || "(no analysis returned)";
}

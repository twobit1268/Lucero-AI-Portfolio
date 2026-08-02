import type { Locator, Page } from "playwright";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { snapshotAccessibleElements } from "../shared/domSnapshot.js";
import { complete, extractJson } from "../shared/llmClient.js";

const LOG_PATH = path.resolve(import.meta.dirname, "../../reports/heal-log.jsonl");

export interface HealOptions {
  /** Plain-English description of what the element is for — this is what
   * the AI reasons from when the primary selector no longer matches, the
   * same "intent survives a UI refactor, a hardcoded selector doesn't" idea
   * KaneAI's self-healing is built on. */
  intent: string;
  /** How to find the element the "normal" way. */
  primary: () => Locator;
  /** Human-readable form of `primary`, for logging (Playwright locators
   * don't expose their selector string cleanly, so the caller states it). */
  primaryDescription: string;
  timeoutMs?: number;
}

interface HealEvent {
  timestamp: string;
  intent: string;
  primaryDescription: string;
  outcome: "primary-ok" | "healed" | "heal-failed";
  healedStrategy?: string;
  reasoning?: string;
}

async function logEvent(event: HealEvent): Promise<void> {
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, JSON.stringify(event) + "\n", "utf-8");
}

interface HealSuggestion {
  strategy: "role" | "text" | "css";
  role?: string;
  name?: string;
  text?: string;
  css?: string;
  reasoning: string;
}

async function askForAlternateSelector(
  page: Page,
  intent: string,
  failedDescription: string
): Promise<HealSuggestion> {
  const domSnapshot = await snapshotAccessibleElements(page);

  const prompt = `A Playwright locator no longer matches any element after a UI change.

Original intent (what the test is trying to interact with): "${intent}"
Original (now-failing) locator description: ${failedDescription}

Current simplified accessibility snapshot of the page:
${domSnapshot}

Find the element that best matches the original intent in the CURRENT snapshot and respond with ONLY a JSON object (no markdown fences, no explanation outside the JSON) shaped exactly like one of:
{"strategy": "role", "role": "button", "name": "Log In", "reasoning": "..."}
{"strategy": "text", "text": "Log In", "reasoning": "..."}
{"strategy": "css", "css": "#submit-button", "reasoning": "..."}

Prefer "role" first, then "text", and only use "css" as a last resort.`;

  const raw = await complete(prompt, 300);
  return extractJson<HealSuggestion>(raw);
}

function buildLocator(page: Page, suggestion: HealSuggestion): Locator {
  switch (suggestion.strategy) {
    case "role":
      return page.getByRole(suggestion.role as Parameters<Page["getByRole"]>[0], {
        name: suggestion.name,
      });
    case "text":
      return page.getByText(suggestion.text ?? "");
    case "css":
      return page.locator(suggestion.css ?? "");
  }
}

/**
 * Resolve a locator the normal way; if it doesn't match exactly one visible
 * element within the timeout, ask Claude to re-find it from intent + a
 * fresh DOM snapshot, and retry once. Every attempt (success, heal, or
 * failure) is logged to reports/heal-log.jsonl for the report/dashboard.
 */
export async function heal(page: Page, options: HealOptions): Promise<Locator> {
  const timeoutMs = options.timeoutMs ?? 1500;
  const primaryLocator = options.primary();

  try {
    await primaryLocator.waitFor({ state: "visible", timeout: timeoutMs });
    await logEvent({
      timestamp: new Date().toISOString(),
      intent: options.intent,
      primaryDescription: options.primaryDescription,
      outcome: "primary-ok",
    });
    return primaryLocator;
  } catch {
    // Primary selector didn't resolve — fall through to AI-assisted healing.
  }

  const suggestion = await askForAlternateSelector(
    page,
    options.intent,
    options.primaryDescription
  );
  const healedLocator = buildLocator(page, suggestion);

  try {
    await healedLocator.waitFor({ state: "visible", timeout: timeoutMs });
    await logEvent({
      timestamp: new Date().toISOString(),
      intent: options.intent,
      primaryDescription: options.primaryDescription,
      outcome: "healed",
      healedStrategy: JSON.stringify(suggestion),
      reasoning: suggestion.reasoning,
    });
    return healedLocator;
  } catch (err) {
    await logEvent({
      timestamp: new Date().toISOString(),
      intent: options.intent,
      primaryDescription: options.primaryDescription,
      outcome: "heal-failed",
      healedStrategy: JSON.stringify(suggestion),
      reasoning: suggestion.reasoning,
    });
    throw new Error(
      `Could not resolve "${options.intent}" — primary selector failed and AI-suggested healing (${JSON.stringify(
        suggestion
      )}) also did not match.`
    );
  }
}

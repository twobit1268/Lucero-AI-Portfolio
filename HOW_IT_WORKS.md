# How it works

A step-by-step walkthrough of the pipeline, tied to the actual code.

## 1. The app under test (`src/fixture/server.ts`)

A tiny local login page — username/password fields, a submit button, a
hidden welcome message. It has two "versions" controlled by `UI_VERSION`:
v1 has a button `id="login-btn"` labeled "Log In"; v2 renames it to
`id="submit-button"` labeled "Sign In" — simulating a real UI refactor.

## 2. Authoring a test from plain English (`src/author/authorTest.ts`)

1. Launches headless Chromium, navigates to the target URL.
2. Calls `snapshotAccessibleElements()` (`src/shared/domSnapshot.ts`), which
   pulls a **reduced** view of the page — just tag, id, role, label, and
   visible text for buttons/inputs/links — not the full HTML. This keeps the
   prompt small and forces the model to reason the way an accessibility tool
   or Playwright's own locator engine would.
3. Sends that snapshot + a natural-language spec (e.g. "Log in with valid
   credentials demo/password123 and see the welcome message") to the LLM
   (`complete()` in `src/shared/llmClient.ts`), with strict instructions:
   only use elements that actually appear in the snapshot, wrap any
   risky/refactor-prone element (like a submit button) in `heal()`, use
   direct Playwright calls for stable stuff (labeled inputs), and include a
   real assertion.
4. The model's response is cleaned up (`extractCode()` strips markdown
   fences models sometimes add) and written to
   `generated-tests/<slug>.spec.ts`.
5. **One thing deliberately not trusted to the model: navigation.** The
   target URL is appended to the file programmatically
   (`export const targetUrl = "..."`) rather than relying on the model to
   write a correct `page.goto()` — an early version of this demo shipped
   with that bug: generated tests never navigated anywhere and silently ran
   against a blank page.

## 3. Self-healing a locator (`src/heal/selfHealingLocator.ts`)

The generated test calls `heal(page, { intent, primary, primaryDescription })`
for anything fragile:

1. Try `primary()` (e.g. `page.getByRole("button", { name: "Log In" })`) with
   a short timeout.
2. **If it resolves** → log `"primary-ok"` and return it, no AI call needed.
3. **If it doesn't** → take a fresh DOM snapshot of the *current* page, send
   it + the original plain-English `intent` to the LLM, asking it to find
   the best match and return strict JSON
   (`{strategy, role/text/css, name, reasoning}`).
4. Build a new locator from that JSON and try it. Success → log `"healed"`
   with the model's reasoning. Failure → log `"heal-failed"` and throw a
   clear error.

Every attempt gets appended to `reports/heal-log.jsonl`.

## 4. Running the suite (`src/orchestrator/runner.ts`)

1. Reads every file in `generated-tests/`.
2. Runs them through a **concurrency-limited worker pool**
   (`runWithConcurrency`) — a stand-in for HyperExecute's distributed grid,
   scaled down to "however many can run on this laptop at once."
3. For each test: launches its own browser, dynamically imports the
   generated module, navigates to its embedded `targetUrl`, calls
   `run(page)`.
4. Pass → record duration. Fail → catch the error and call
   `explainFailure()` for a plain-English root cause before recording it.

## 5. Root-cause analysis (`src/analysis/rootCause.ts`)

Just one LLM call: raw error message in, 2-3 sentence plain-English
diagnosis + suggested next step out — so the report doesn't just dump a raw
Playwright stack trace.

## 6. The report (`src/orchestrator/report.ts`)

Reads all test results + the heal log, renders one static HTML file:
pass/fail counts, a self-heal counter, a table of every test with its root
cause if it failed, and a table of every heal event with the model's
reasoning.

## Tying it together (`src/cli.ts`, the `demo` command)

Start fixture v1 → author the test → run it (passes clean, no healing
needed) → kill fixture, restart as v2 (the refactor) → **re-run the exact
same generated file, unmodified** → primary locator now fails ("Log In"
doesn't exist anymore) → `heal()` kicks in, finds "Sign In" by role +
reasoning → test passes anyway → report shows the heal event.

This was verified for real (not just type-checked) end-to-end using
Ollama/Qwen2.5:7b running locally: the authoring step, a genuine selector
break from the simulated refactor, and a real AI-driven self-heal recovery
all confirmed working.

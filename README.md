# TestPilot AI

A small, fully local, **educational replica** of the ideas behind agentic AI QA
platforms like [TestMu AI](https://www.testmuai.com/) (formerly LambdaTest) —
specifically their **KaneAI** (natural-language test authoring + self-healing
tests) and **HyperExecute** (parallel test orchestration) products.

This is not a production system and doesn't claim feature parity with either
product — it's a portfolio piece built to demonstrate a real, working
understanding of *how* those capabilities are actually implemented under the
hood, at a scale one person can read end-to-end in an afternoon.

## Why this exists

Bet365's parent company (Hillside Technology) [publicly partnered with
TestMu AI](https://www.testmuai.com/customers/bet365/) for their release
pipeline. Rather than only being able to describe those tools from a vendor
case study, this project builds a minimal version of each core capability
against a real (if tiny) local app, so the underlying mechanics — not just
the marketing terms — are something I can speak to and show.

## Architecture

```
src/
  fixture/server.ts       — tiny local login-form app under test (two DOM
                             "versions" to simulate a UI refactor)
  shared/domSnapshot.ts   — extracts a simplified accessibility snapshot
                             (role/id/label/text) of a page — shared by
                             authoring and self-healing so both reason about
                             the same view of the DOM
  author/authorTest.ts    — KaneAI-style natural-language test authoring:
                             loads the target page, sends the DOM snapshot +
                             a plain-English spec to Claude, gets back a
                             runnable test module
  heal/selfHealingLocator.ts — wraps a locator lookup; if the primary
                             selector no longer matches, asks Claude to find
                             the element by original intent from a fresh DOM
                             snapshot, retries once, and logs every attempt
  analysis/rootCause.ts   — turns a raw test failure/stack trace into a
                             short plain-English diagnosis + suggested next
                             step
  orchestrator/runner.ts  — HyperExecute-style parallel execution: runs all
                             generated tests with a bounded concurrency pool,
                             each in its own browser instance, and aggregates
                             pass/fail/duration/root-cause
  orchestrator/report.ts  — renders results + the self-healing event log as
                             a single HTML report
  cli.ts                  — ties it together: author / run / demo commands
```

## What's real here vs. simplified

- **Real**: Playwright drives an actual Chromium browser against an actual
  local app. The AI calls are real LLM calls (Ollama running Qwen2.5:7b
  locally by default, or Claude if configured) — not mocked/scripted
  responses. Test authoring, self-healing, and parallel orchestration are
  genuinely implemented, not stubbed. Verified end-to-end: the demo's
  simulated UI refactor (button id, class, *and* label all change) genuinely
  breaks the original locator, and the self-healing step genuinely recovers
  by re-querying the model with a fresh DOM snapshot — this isn't a scripted
  "always succeeds" demo.
- **Simplified on purpose**: HyperExecute's actual product involves real
  distributed worker infrastructure across a device/browser grid — this repo
  simulates that with a local concurrency-limited worker pool, since a single
  laptop is the whole "grid" here. The DOM snapshot fed to Claude is a
  deliberately reduced view (role/id/label/text), not full HTML, to keep
  prompts small and force the model to reason the way a screen reader /
  Playwright's own locator engine does.

## Setup

Uses [Ollama](https://ollama.com) (free, fully local, open-weight models) by
default — no signup, no cost, no API key. Claude is used automatically
instead if `ANTHROPIC_API_KEY` is set (higher-quality reasoning, especially
for the self-healing JSON output), or force either explicitly with
`LLM_PROVIDER=ollama|anthropic`.

```bash
npm install
npx playwright install chromium

# Free/local path (default):
brew install ollama
brew services start ollama
ollama pull qwen2.5:7b

# Optional: use Claude instead
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
```

## Running the full demo

```bash
npm run demo
```

This will, in order:
1. Start the local fixture app (v1 — original UI).
2. Author a test from a plain-English spec ("Log in with valid credentials
   demo/password123 and see the welcome message") using Claude.
3. Run the suite — clean pass, no healing needed.
4. Swap the fixture to v2, which renames the login button's id, class, *and*
   visible label ("Log In" → "Sign In") — a realistic refactor that breaks
   even a role+name locator, not just a brittle CSS-id one.
5. Re-run the **same, unmodified** generated test against v2. The primary
   locator fails, `heal()` sends the current DOM snapshot + original intent
   back to Claude, gets a new locator strategy, retries, and passes.
6. Opens onto an HTML report summarizing pass/fail + every self-healing
   event with the model's reasoning.

## Running pieces individually

```bash
npm run fixture              # start the app under test on :4173
npm run author -- "Log in with valid credentials demo/password123 and see the welcome message"
npm run run-suite            # run everything in generated-tests/
```

## Honest limitations

- Single-machine concurrency, not a real distributed grid.
- The self-healing model only tries one AI-suggested alternative per
  failure; the real product likely has richer fallback/ranking logic.
- No persistence/dashboard across runs — each run's report is a standalone
  HTML file, not a queryable history.
- Built and tested against one small fixture app; robustness on a truly
  complex production DOM is untested.

import Anthropic from "@anthropic-ai/sdk";

/**
 * Provider-agnostic completion call. Defaults to Ollama (free, fully local)
 * unless ANTHROPIC_API_KEY is set, in which case Claude is used — this lets
 * the project run with zero cost/signup out of the box, while still
 * supporting the higher-quality path for anyone who has a key. Force one or
 * the other explicitly via LLM_PROVIDER=anthropic|ollama.
 */
function resolveProvider(): "anthropic" | "ollama" {
  const explicit = process.env.LLM_PROVIDER;
  if (explicit === "anthropic" || explicit === "ollama") return explicit;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "ollama";
}

async function completeAnthropic(prompt: string, maxTokens: number): Promise<string> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

async function completeOllama(prompt: string, maxTokens: number): Promise<string> {
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
  const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { num_predict: maxTokens },
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Ollama request failed (${res.status}): ${await res.text()}. Is "ollama serve" running and is "${model}" pulled?`
    );
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

export async function complete(prompt: string, maxTokens = 1024): Promise<string> {
  const provider = resolveProvider();
  return provider === "anthropic"
    ? completeAnthropic(prompt, maxTokens)
    : completeOllama(prompt, maxTokens);
}

/** Local models are less reliable than Claude about following "no markdown
 * fences" instructions — strip ```lang / ``` wrappers if present so callers
 * don't have to special-case this per provider. */
export function extractCode(raw: string): string {
  const fenced = raw.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

/** Same idea for JSON — pull out the first {...} block in case the model
 * added prose or fences around it. */
export function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const match = body.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : body) as T;
}

export function currentProvider(): string {
  const provider = resolveProvider();
  return provider === "anthropic"
    ? `anthropic (${process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5"})`
    : `ollama (${process.env.OLLAMA_MODEL ?? "qwen2.5:7b"})`;
}

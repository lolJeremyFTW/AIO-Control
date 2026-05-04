// Per-1M-token pricing in USD cents. Used to compute runs.cost_cents.
// Values track each provider's official price page; sync periodically.
// Coder-Plan / subscription users get flat-rate billing — these numbers
// are still useful as a usage proxy.

export type ModelPricing = {
  input_per_mtok_cents: number;
  output_per_mtok_cents: number;
};

export const PRICING: Record<string, ModelPricing> = {
  // ── Anthropic Claude (per anthropic.com/pricing) ────────────────
  "claude-opus-4-7": { input_per_mtok_cents: 1500, output_per_mtok_cents: 7500 },
  "claude-opus-4-6": { input_per_mtok_cents: 1500, output_per_mtok_cents: 7500 },
  "claude-sonnet-4-7": { input_per_mtok_cents: 300, output_per_mtok_cents: 1500 },
  "claude-sonnet-4-6": { input_per_mtok_cents: 300, output_per_mtok_cents: 1500 },
  "claude-haiku-4-5": { input_per_mtok_cents: 100, output_per_mtok_cents: 500 },
  // Friendly aliases the CLI accepts
  opus: { input_per_mtok_cents: 1500, output_per_mtok_cents: 7500 },
  sonnet: { input_per_mtok_cents: 300, output_per_mtok_cents: 1500 },
  haiku: { input_per_mtok_cents: 100, output_per_mtok_cents: 500 },

  // ── MiniMax (per platform.minimaxi.com) ──────────────────────────
  // Highspeed = the cheap fast tier (Coder Plan default).
  "MiniMax-M2.7-Highspeed": { input_per_mtok_cents: 30, output_per_mtok_cents: 120 },
  "MiniMax-M2.7": { input_per_mtok_cents: 100, output_per_mtok_cents: 500 },
  "MiniMax-Text-01": { input_per_mtok_cents: 20, output_per_mtok_cents: 110 },

  // ── OpenAI / Codex (per openai.com/pricing — Nov 2025 cards) ────
  // Codex CLI / OpenAI-Codex OAuth via OpenClaw uses these.
  "gpt-5.4": { input_per_mtok_cents: 250, output_per_mtok_cents: 1000 },
  "gpt-5.4-mini": { input_per_mtok_cents: 50, output_per_mtok_cents: 200 },
  "gpt-5.2": { input_per_mtok_cents: 200, output_per_mtok_cents: 800 },
  "gpt-4o": { input_per_mtok_cents: 250, output_per_mtok_cents: 1000 },
  "gpt-4o-mini": { input_per_mtok_cents: 15, output_per_mtok_cents: 60 },

  // ── Local models — no marginal cost, but still record tokens ─────
  "llama3": { input_per_mtok_cents: 0, output_per_mtok_cents: 0 },
  "llama3.2:3b": { input_per_mtok_cents: 0, output_per_mtok_cents: 0 },
  "llama3.2-vision:latest": { input_per_mtok_cents: 0, output_per_mtok_cents: 0 },
  "moondream:latest": { input_per_mtok_cents: 0, output_per_mtok_cents: 0 },
};

/**
 * Resolve pricing for a model id, tolerating a few common shapes the
 * CLIs use:
 *   - bare model id ("MiniMax-M2.7-Highspeed")
 *   - provider-prefixed ("minimax/MiniMax-M2.7-Highspeed", "codex/gpt-5.4")
 *   - versioned ("claude-sonnet-4-6@20251020")
 *
 * Returns null when we don't know the model so callers can default to
 * 0 cents instead of inventing a price.
 */
export function priceFor(model: string | null | undefined): ModelPricing | null {
  if (!model) return null;
  // Exact match first.
  const direct = PRICING[model];
  if (direct) return direct;
  // Strip provider prefix ("minimax/MiniMax-M2.7-Highspeed" → "MiniMax-…").
  const slashIdx = model.indexOf("/");
  if (slashIdx !== -1) {
    const tail = model.slice(slashIdx + 1);
    const t = PRICING[tail];
    if (t) return t;
  }
  // Strip @version / :tag suffix.
  const atIdx = model.indexOf("@");
  if (atIdx !== -1) {
    const head = model.slice(0, atIdx);
    const h = PRICING[head];
    if (h) return h;
  }
  return null;
}

export function priceTokens(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = priceFor(model);
  if (!p) return 0;
  return Math.round(
    (inputTokens / 1_000_000) * p.input_per_mtok_cents +
      (outputTokens / 1_000_000) * p.output_per_mtok_cents,
  );
}

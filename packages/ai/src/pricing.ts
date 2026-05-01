// Per-1M-token pricing in USD cents. Used to compute runs.cost_cents.
// Values are filled in during phase 3 when providers are wired up.

export type ModelPricing = { input_per_mtok_cents: number; output_per_mtok_cents: number };

export const PRICING: Record<string, ModelPricing> = {
  // placeholder defaults; phase 3 will sync with current model cards.
  "claude-opus-4-7": { input_per_mtok_cents: 1500, output_per_mtok_cents: 7500 },
  "claude-sonnet-4-6": { input_per_mtok_cents: 300, output_per_mtok_cents: 1500 },
  "claude-haiku-4-5": { input_per_mtok_cents: 100, output_per_mtok_cents: 500 },
};

export function priceTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model];
  if (!p) return 0;
  return Math.round(
    (inputTokens / 1_000_000) * p.input_per_mtok_cents +
      (outputTokens / 1_000_000) * p.output_per_mtok_cents,
  );
}

// Tiny env helper — fail loudly when a required Supabase secret is missing
// instead of letting Supabase throw an unhelpful "URL is required" later.

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(
      `Missing env var ${name}. Copy .env.local.example to .env.local and ` +
        `fill in your Supabase URL + anon key.`,
    );
  }
  return v;
}

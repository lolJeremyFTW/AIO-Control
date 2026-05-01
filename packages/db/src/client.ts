// Server-side Drizzle client over the postgres-js driver.
// Used for migrations, server actions, and API route data access.
// Browser code should use Supabase's JS client (auth + Realtime), not this.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let cached: ReturnType<typeof drizzle> | undefined;

export function db() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in .env.local for local dev " +
        "or in the deployed environment.",
    );
  }
  const queryClient = postgres(url, { prepare: false });
  cached = drizzle(queryClient, { schema });
  return cached;
}

export { schema };

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = join(__dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // BASE_PATH is empty during local dev; on the VPS it becomes "/aio" so the
  // app lives at tromptech.life/aio behind Caddy.
  basePath: process.env.BASE_PATH || undefined,
  // We import .tsx files from workspace packages directly, so they need to be
  // transpiled by Next as part of the app build.
  transpilePackages: ["@aio/ui", "@aio/db", "@aio/ai"],
  // Standalone output makes systemd-on-VPS a one-line `node server.js`.
  output: "standalone",
  // Pin Turbopack to the monorepo root so it stops walking up to the user's
  // home directory looking for an unrelated lockfile.
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;

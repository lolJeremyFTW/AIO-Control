import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const paths = {
  helper: "apps/control/lib/dispatch/spend-limit.ts",
  dispatcher: "apps/control/lib/dispatch/runs.ts",
  chatRoute: "apps/control/app/api/chat/[agent_id]/route.ts",
  migration: "packages/db/supabase/migrations/020_spend_limits.sql",
  costViews: "packages/db/supabase/migrations/018_cost_views.sql",
};

const files = Object.fromEntries(
  Object.entries(paths).map(([key, relativePath]) => [
    key,
    readFileSync(resolve(repoRoot, relativePath), "utf8"),
  ]),
);

const checks = [];
const warnings = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
}

function before(source, left, right) {
  const leftIndex = source.indexOf(left);
  const rightIndex = source.indexOf(right);
  return leftIndex !== -1 && rightIndex !== -1 && leftIndex < rightIndex;
}

check(
  "migration adds workspace daily/monthly limits",
  /alter table aio_control\.workspaces[\s\S]*daily_spend_limit_cents[\s\S]*monthly_spend_limit_cents/.test(
    files.migration,
  ),
  paths.migration,
);

check(
  "migration adds business daily/monthly overrides",
  /alter table aio_control\.businesses[\s\S]*daily_spend_limit_cents[\s\S]*monthly_spend_limit_cents/.test(
    files.migration,
  ),
  paths.migration,
);

check(
  "spend_limit_state resolves business limits before workspace defaults",
  /coalesce\(b\.daily_spend_limit_cents,\s*w\.daily_spend_limit_cents\)[\s\S]*coalesce\(b\.monthly_spend_limit_cents,\s*w\.monthly_spend_limit_cents\)/.test(
    files.migration,
  ),
  paths.migration,
);

check(
  "spend_limit_state reads 24h and 30d spend from cost_by_business",
  /left join aio_control\.cost_by_business/.test(files.migration) &&
    /cost_24h_cents/.test(files.costViews) &&
    /cost_30d_cents/.test(files.costViews),
  `${paths.migration}, ${paths.costViews}`,
);

check(
  "spend-limit helper blocks daily and monthly caps",
  /reason: "daily_exceeded"/.test(files.helper) &&
    /reason: "monthly_exceeded"/.test(files.helper) &&
    /cost24h >= daily/.test(files.helper) &&
    /cost30d >= monthly/.test(files.helper),
  paths.helper,
);

check(
  "spend-limit helper auto-pauses businesses when configured",
  /\.from\("businesses"\)[\s\S]*\.update\(\{ status: "paused" \}\)/.test(
    files.helper,
  ),
  paths.helper,
);

check(
  "queued dispatcher checks spend before provider execution",
  before(
    files.dispatcher,
    "const limit = await checkSpendLimit(business.id);",
    "for await (const event of streamChat({",
  ),
  paths.dispatcher,
);

check(
  "chat route checks spend before creating the run row",
  before(
    files.chatRoute,
    "const limit = await checkSpendLimit(agent.business_id);",
    '.from("runs")',
  ),
  paths.chatRoute,
);

if (
  /if \(business\) \{[\s\S]*checkSpendLimit\(business\.id\)/.test(
    files.dispatcher,
  )
) {
  warnings.push(
    "Queued dispatcher only checks spend when run.business_id resolves to a business.",
  );
}

if (
  /if \(agent\.business_id\) \{[\s\S]*checkSpendLimit\(agent\.business_id\)/.test(
    files.chatRoute,
  )
) {
  warnings.push(
    "Chat route only checks spend for business-scoped agents; workspace-global agents bypass current limits.",
  );
}

const failures = checks.filter((item) => !item.ok);

for (const item of checks) {
  const mark = item.ok ? "PASS" : "FAIL";
  console.log(`${mark} ${item.name} (${item.detail})`);
}

for (const warning of warnings) {
  console.log(`WARN ${warning}`);
}

if (failures.length > 0) {
  console.error(`Spend-limit verification failed: ${failures.length} check(s).`);
  process.exitCode = 1;
} else {
  console.log("Spend-limit verification completed.");
}

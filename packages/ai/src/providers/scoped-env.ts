import type { StreamChatOptions } from "../router";
import { withCliBinPath } from "./cli-bin";

export function scopedSubprocessEnv(
  opts: StreamChatOptions,
): NodeJS.ProcessEnv {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(opts.tenant?.mcpToolKeys ?? {}),
    AIO_SUPABASE_SCHEMA: process.env.AIO_SUPABASE_SCHEMA ?? "aio_control",
    AIO_SUPABASE_PSQL_COMMAND:
      process.env.AIO_SUPABASE_PSQL_COMMAND ??
      "docker exec -i supabase-db psql -U postgres -d postgres",
  };
  if (supabaseUrl) {
    const trimmed = supabaseUrl.replace(/\/+$/, "");
    env.SUPABASE_URL = supabaseUrl;
    env.AIO_SUPABASE_URL = supabaseUrl;
    env.AIO_SUPABASE_REST_URL = `${trimmed}/rest/v1`;
  }

  if (opts.tenant?.workspaceId) {
    env.AIO_WORKSPACE_ID = opts.tenant.workspaceId;
  }
  if (opts.tenant && "businessId" in opts.tenant) {
    env.AIO_BUSINESS_ID = opts.tenant.businessId ?? "";
  }
  if (opts.tenant && "navNodeId" in opts.tenant) {
    env.AIO_NAV_NODE_ID = opts.tenant.navNodeId ?? "";
  }
  if (opts.tenant && "agentId" in opts.tenant) {
    env.AIO_AGENT_ID = opts.tenant.agentId ?? "";
  }
  if (opts.runId) {
    env.AIO_RUN_ID = opts.runId;
  }

  return withCliBinPath(env);
}

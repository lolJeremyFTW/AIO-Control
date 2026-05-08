import type { StreamChatOptions } from "../router";
import { withCliBinPath } from "./cli-bin";

export function scopedSubprocessEnv(
  opts: StreamChatOptions,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(opts.tenant?.mcpToolKeys ?? {}),
  };

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

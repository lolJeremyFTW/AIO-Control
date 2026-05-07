import type { StreamChatOptions } from "../router";

export function scopedSubprocessEnv(opts: StreamChatOptions): NodeJS.ProcessEnv {
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

  return env;
}

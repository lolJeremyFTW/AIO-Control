import type { AgentDashboardTab as AgentDashboardTabData } from "../lib/dashboards/agent-tabs";

type Props = {
  dashboard: AgentDashboardTabData;
};

const defaultDashboardCss = `
.agent-dashboard-tab{color:var(--app-fg);font-family:var(--type);font-size:14px;line-height:1.45}
.agent-dashboard-tab *{box-sizing:border-box}
.agent-dashboard-tab .aio-dashboard{width:100%;max-width:1180px;margin:0 auto;padding:24px 0}
.agent-dashboard-tab section,.agent-dashboard-tab .card,.agent-dashboard-tab .tile,.agent-dashboard-tab .panel{background:var(--app-card);border:1.5px solid var(--app-border);border-radius:10px}
.agent-dashboard-tab h1,.agent-dashboard-tab h2,.agent-dashboard-tab h3,.agent-dashboard-tab p{margin-top:0}
.agent-dashboard-tab h1{font-size:24px;letter-spacing:0}
.agent-dashboard-tab h2{font-size:17px}
.agent-dashboard-tab h3{font-size:14px}
.agent-dashboard-tab a{color:var(--tt-green)}
.agent-dashboard-tab table{width:100%;border-collapse:collapse;background:var(--app-card);border:1px solid var(--app-border);border-radius:10px;overflow:hidden}
.agent-dashboard-tab th,.agent-dashboard-tab td{padding:9px 10px;border-bottom:1px solid var(--app-border-2);text-align:left}
.agent-dashboard-tab th{font-size:11px;text-transform:uppercase;color:var(--app-fg-3);letter-spacing:.08em}
.agent-dashboard-tab button,.agent-dashboard-tab .pill{border-radius:999px;border:1px solid var(--app-border);background:var(--app-card-2);color:var(--app-fg);padding:6px 10px}
.agent-dashboard-tab .muted{color:var(--app-fg-3)}
.agent-dashboard-tab .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.agent-dashboard-tab .kpi,.agent-dashboard-tab .tile{padding:12px 14px}
.agent-dashboard-tab .kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--app-fg-3);font-weight:700}
.agent-dashboard-tab .kpi-value{font-size:22px;font-weight:750;color:var(--app-fg)}
@media(max-width:720px){.agent-dashboard-tab .aio-dashboard{padding:14px 0}.agent-dashboard-tab table{font-size:12px}}
`;

export function AgentDashboardTab({ dashboard }: Props) {
  return (
    <div className="agent-dashboard-tab" data-dashboard-slug={dashboard.slug}>
      <style dangerouslySetInnerHTML={{ __html: defaultDashboardCss }} />
      <div dangerouslySetInnerHTML={{ __html: dashboard.html }} />
    </div>
  );
}

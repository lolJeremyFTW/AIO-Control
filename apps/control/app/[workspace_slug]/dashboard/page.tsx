import { PlusIcon } from "@aio/ui/icon";

export default function WorkspaceDashboardPage() {
  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Dashboard</h1>
        <span className="sub">Phase 1 · auth + workspaces</span>
      </div>

      <div className="empty-state">
        <h2>Maak je eerste business →</h2>
        <p>
          Hier verschijnen straks Faceless YouTube, Etsy, Blog Network en je
          andere automated mini-businesses. CRUD voor businesses + agents
          komt in fase 2.
        </p>
        <button className="cta">
          <PlusIcon /> Nieuwe business
        </button>
      </div>
    </div>
  );
}

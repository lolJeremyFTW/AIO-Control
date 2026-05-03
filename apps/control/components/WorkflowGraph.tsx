// SVG visualizer of an agent's chain. Walks `next_agent_on_done` and
// `next_agent_on_fail` from the focused agent up to N hops deep and
// renders nodes + arrows. Tiny, fully client-side, no external graph
// lib — just absolute-positioned divs with SVG arrows over the top.
//
// Useful inside EditAgentDialog so the user sees what the chain looks
// like as they pick targets in the dropdowns above.

"use client";

import { useMemo } from "react";

type AgentLite = {
  id: string;
  name: string;
  next_agent_on_done?: string | null;
  next_agent_on_fail?: string | null;
};

type Props = {
  /** The focused agent — drawn at the top. */
  focused: AgentLite;
  /** All siblings (including focused) so we can resolve targets by id. */
  agents: AgentLite[];
};

type NodeData = {
  id: string;
  name: string;
  depth: number;
  col: number;
  parentId: string | null;
  edge: "done" | "fail" | null;
};

export function WorkflowGraph({ focused, agents }: Props) {
  const byId = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );

  const nodes = useMemo(() => {
    const out: NodeData[] = [];
    const visited = new Set<string>();

    type Frame = {
      id: string;
      depth: number;
      parentId: string | null;
      edge: "done" | "fail" | null;
    };
    const queue: Frame[] = [
      { id: focused.id, depth: 0, parentId: null, edge: null },
    ];
    const colByDepth = new Map<number, number>();

    while (queue.length > 0) {
      const f = queue.shift()!;
      if (visited.has(f.id) || f.depth > 4) continue;
      visited.add(f.id);
      const a = f.id === focused.id ? focused : byId.get(f.id);
      if (!a) continue;
      const col = colByDepth.get(f.depth) ?? 0;
      colByDepth.set(f.depth, col + 1);
      out.push({
        id: a.id,
        name: a.name,
        depth: f.depth,
        col,
        parentId: f.parentId,
        edge: f.edge,
      });
      if (a.next_agent_on_done) {
        queue.push({
          id: a.next_agent_on_done,
          depth: f.depth + 1,
          parentId: a.id,
          edge: "done",
        });
      }
      if (a.next_agent_on_fail && a.next_agent_on_fail !== a.next_agent_on_done) {
        queue.push({
          id: a.next_agent_on_fail,
          depth: f.depth + 1,
          parentId: a.id,
          edge: "fail",
        });
      }
    }
    return out;
  }, [focused, byId]);

  // Layout. Each level is a row; columns center within their row.
  const colW = 180;
  const rowH = 70;
  const padX = 20;
  const padY = 20;
  const maxNodesInRow = Math.max(
    1,
    ...Object.values(
      nodes.reduce<Record<number, number>>((acc, n) => {
        acc[n.depth] = (acc[n.depth] ?? 0) + 1;
        return acc;
      }, {}),
    ),
  );
  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
  const width = maxNodesInRow * colW + padX * 2;
  const height = (maxDepth + 1) * rowH + padY * 2;

  // Resolve x,y per node id.
  const nodesPerDepth = new Map<number, number>();
  nodes.forEach((n) => {
    nodesPerDepth.set(n.depth, (nodesPerDepth.get(n.depth) ?? 0) + 1);
  });
  const placed = new Map<string, { x: number; y: number; n: NodeData }>();
  const colCounters = new Map<number, number>();
  for (const n of nodes) {
    const total = nodesPerDepth.get(n.depth) ?? 1;
    const idx = colCounters.get(n.depth) ?? 0;
    colCounters.set(n.depth, idx + 1);
    const rowSpan = total * colW;
    const x = (width - rowSpan) / 2 + idx * colW + colW / 2;
    const y = padY + n.depth * rowH + 22;
    placed.set(n.id, { x, y, n });
  }

  if (nodes.length === 1) {
    return (
      <p style={{ fontSize: 11.5, color: "var(--app-fg-3)", margin: 0 }}>
        Geen chain — kies een &quot;next agent&quot; hierboven om er één te
        bouwen.
      </p>
    );
  }

  return (
    <div
      style={{
        background: "var(--app-card)",
        border: "1px solid var(--app-border-2)",
        borderRadius: 10,
        padding: 8,
        overflow: "auto",
      }}
    >
      <svg
        width={width}
        height={height}
        style={{ display: "block" }}
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <marker
            id="arrow-done"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--tt-green)" />
          </marker>
          <marker
            id="arrow-fail"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--rose)" />
          </marker>
        </defs>

        {/* Edges */}
        {nodes
          .filter((n) => n.parentId)
          .map((n, i) => {
            const from = placed.get(n.parentId!);
            const to = placed.get(n.id);
            if (!from || !to) return null;
            const stroke = n.edge === "fail" ? "var(--rose)" : "var(--tt-green)";
            const marker = n.edge === "fail" ? "arrow-fail" : "arrow-done";
            const midY = (from.y + to.y) / 2;
            return (
              <path
                key={i}
                d={`M ${from.x} ${from.y + 14} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y - 14}`}
                stroke={stroke}
                strokeWidth={1.5}
                fill="none"
                markerEnd={`url(#${marker})`}
                opacity={0.85}
              />
            );
          })}

        {/* Nodes */}
        {nodes.map((n) => {
          const p = placed.get(n.id);
          if (!p) return null;
          const focused0 = n.id === focused.id;
          return (
            <g key={n.id}>
              <rect
                x={p.x - 70}
                y={p.y - 14}
                width={140}
                height={28}
                rx={8}
                fill={focused0 ? "var(--tt-green)" : "var(--app-card-2)"}
                stroke={focused0 ? "var(--tt-green)" : "var(--app-border)"}
                strokeWidth={1.5}
              />
              <text
                x={p.x}
                y={p.y + 4}
                fontSize={11}
                fontWeight={700}
                textAnchor="middle"
                fill={focused0 ? "#fff" : "var(--app-fg)"}
                fontFamily="var(--type)"
              >
                {n.name.length > 18 ? n.name.slice(0, 17) + "…" : n.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--app-fg-3)",
          marginTop: 6,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 2,
              background: "var(--tt-green)",
              verticalAlign: "middle",
              marginRight: 4,
            }}
          />
          on done
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 2,
              background: "var(--rose)",
              verticalAlign: "middle",
              marginRight: 4,
            }}
          />
          on fail
        </span>
      </div>
    </div>
  );
}

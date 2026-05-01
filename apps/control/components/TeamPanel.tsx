// Workspace members list with invite-by-email + change-role + remove.
// RLS gates writes to owner/admin so a non-admin only sees the list.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  inviteWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type Role,
} from "../app/actions/members";

export type Member = {
  user_id: string;
  role: Role;
  display_name: string | null;
  email: string | null;
};

const ROLES: Role[] = ["admin", "editor", "viewer"];

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  members: Member[];
  currentUserId: string;
};

export function TeamPanel({ workspaceSlug, workspaceId, members, currentUserId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const res = await inviteWorkspaceMember({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        email,
        role,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmail("");
      setInfo(`${email} toegevoegd als ${role}.`);
      router.refresh();
    });

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>
          Lid uitnodigen
        </h4>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            placeholder="naam@bedrijf.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              background: "var(--app-card-2)",
              border: "1.5px solid var(--app-border)",
              color: "var(--app-fg)",
              padding: "8px 10px",
              borderRadius: 9,
              fontSize: 13,
            }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            style={{
              background: "var(--app-card-2)",
              border: "1.5px solid var(--app-border)",
              color: "var(--app-fg)",
              padding: "8px 10px",
              borderRadius: 9,
              fontSize: 13,
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={pending || !email}
            style={{
              padding: "8px 14px",
              border: "1.5px solid var(--tt-green)",
              background: "var(--tt-green)",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: pending ? "wait" : "pointer",
              opacity: pending || !email ? 0.7 : 1,
            }}
          >
            {pending ? "Bezig…" : "Uitnodigen"}
          </button>
        </div>
        {error && (
          <p
            role="alert"
            style={{
              color: "var(--rose)",
              background: "rgba(230,82,107,0.08)",
              border: "1px solid rgba(230,82,107,0.4)",
              borderRadius: 8,
              padding: "6px 10px",
              marginTop: 8,
              fontSize: 12,
            }}
          >
            {error}
          </p>
        )}
        {info && (
          <p style={{ color: "var(--tt-green)", fontSize: 12, marginTop: 8 }}>
            {info}
          </p>
        )}
      </div>

      <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>
        Huidige leden
      </h4>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: "1.5px solid var(--app-border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {members.map((m, i) => (
          <MemberRow
            key={m.user_id}
            member={m}
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            isFirst={i === 0}
            isSelf={m.user_id === currentUserId}
          />
        ))}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  workspaceSlug,
  workspaceId,
  isFirst,
  isSelf,
}: {
  member: Member;
  workspaceSlug: string;
  workspaceId: string;
  isFirst: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isOwner = member.role === "owner";

  const changeRole = (next: Role) =>
    startTransition(async () => {
      await updateWorkspaceMemberRole({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        user_id: member.user_id,
        role: next,
      });
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      await removeWorkspaceMember({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        user_id: member.user_id,
      });
      router.refresh();
    });

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderTop: isFirst ? "none" : "1px solid var(--app-border-2)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {member.display_name ?? member.email}
          {isSelf && (
            <span style={{ color: "var(--app-fg-3)", fontWeight: 500 }}> (jij)</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
          {member.email}
        </div>
      </div>
      {isOwner ? (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--tt-green)",
          }}
        >
          OWNER
        </span>
      ) : (
        <select
          value={member.role}
          disabled={pending}
          onChange={(e) => changeRole(e.target.value as Role)}
          style={{
            background: "var(--app-card-2)",
            border: "1.5px solid var(--app-border)",
            color: "var(--app-fg)",
            padding: "4px 8px",
            borderRadius: 7,
            fontSize: 11.5,
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
      {!isOwner && !isSelf && (
        <button
          onClick={remove}
          disabled={pending}
          style={{
            padding: "4px 10px",
            border: "1.5px solid var(--rose)",
            background: "transparent",
            color: "var(--rose)",
            borderRadius: 7,
            fontWeight: 700,
            fontSize: 11,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          Verwijder
        </button>
      )}
    </div>
  );
}

// Drizzle schema — Phase 1 (auth + multi-workspace foundation).
// Domain tables (businesses, agents, runs, etc.) land in subsequent migrations.

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  primaryKey,
  jsonb,
} from "drizzle-orm/pg-core";

// Profiles — 1:1 with auth.users (Supabase auth schema).
// id references auth.users.id; we store it as uuid here without a foreign key
// so Drizzle migrations don't try to manage the auth schema.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  avatarLetter: text("avatar_letter").default("U").notNull(),
  avatarVariant: text("avatar_variant").default("orange").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // owner | admin | editor | viewer
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  resourceTable: text("resource_table").notNull(),
  resourceId: uuid("resource_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── Phase 2: domain tables ──────────────────────────────────────────────────

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sub: text("sub"),
  letter: text("letter").notNull().default("B"),
  variant: text("variant").notNull().default("brand"),
  status: text("status").notNull().default("paused"),
  primaryAction: text("primary_action").default("Nieuwe automation"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("chat"),
  provider: text("provider").notNull().default("claude"),
  model: text("model"),
  config: jsonb("config").notNull().default({}),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const queueItems = pgTable("queue_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, {
    onDelete: "set null",
  }),
  state: text("state").notNull(),
  confidence: text("confidence").notNull().default("0"),
  title: text("title").notNull(),
  meta: text("meta"),
  payload: jsonb("payload"),
  decision: text("decision"),
  resolvedBy: uuid("resolved_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "set null",
  }),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("disconnected"),
  lastRefreshAt: timestamp("last_refresh_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Profile = typeof profiles.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type QueueItem = typeof queueItems.$inferSelect;
export type Integration = typeof integrations.$inferSelect;

export type BusinessVariant =
  | "brand"
  | "orange"
  | "indigo"
  | "blue"
  | "violet"
  | "rose"
  | "amber";

export type AgentProvider =
  | "claude"
  | "openrouter"
  | "minimax"
  | "ollama"
  | "openclaw"
  | "hermes"
  | "codex";

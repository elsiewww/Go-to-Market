import {sqliteTable, text, integer, uniqueIndex, index, type AnySQLiteColumn} from "drizzle-orm/sqlite-core";

export const records = sqliteTable("ops_records", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  agentId: text("agent_id").references((): AnySQLiteColumn => records.id),
  status: text("status").notNull(),
  details: text("details").notNull(),
  evidence: text("evidence").notNull(),
  revision: integer("revision").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  originHash: text("origin_hash").notNull(),
  eventId: text("event_id").notNull()
}, t => [index("records_agent").on(t.agentId), index("records_updated").on(t.updatedAt)]);

export const history = sqliteTable("ops_history", {
  id: text("id").primaryKey(),
  recordId: text("record_id").notNull().references(() => records.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  revision: integer("revision").notNull(),
  note: text("note").notNull(),
  actor: text("actor").notNull(),
  previousSnapshot: text("previous_snapshot"),
  createdAt: text("created_at").notNull()
}, t => [uniqueIndex("history_revision").on(t.recordId, t.revision), index("history_created").on(t.createdAt)]);

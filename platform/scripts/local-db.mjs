import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

class BoundStatement {
  constructor(database, statement, values = []) {
    this.database = database;
    this.statement = statement;
    this.values = values;
  }

  bind(...values) {
    return new BoundStatement(this.database, this.statement, values);
  }

  first(column) {
    const row = this.statement.get(...this.values);
    return column === undefined ? (row ?? null) : (row?.[column] ?? null);
  }

  all() {
    const before = this.database.prepare("SELECT total_changes() AS count").get().count;
    const results = this.statement.all(...this.values);
    const after = this.database.prepare("SELECT total_changes() AS count, last_insert_rowid() AS lastId").get();
    return { success: true, results, meta: { changes: after.count - before, last_row_id: after.lastId } };
  }

  run() {
    return this.all();
  }
}

function transaction(database, work) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

// Only local development and tests use this adapter. Hosted requests use Sites D1.
export class LocalD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new BoundStatement(this.database, this.database.prepare(sql));
  }

  batch(statements) {
    return transaction(this.database, () => statements.map(statement => statement.all()));
  }
}

export function migrateLocal(database, migrationDir) {
  const directory = migrationDir instanceof URL ? fileURLToPath(migrationDir) : migrationDir;
  const migrations = readdirSync(directory).filter(file => file.endsWith(".sql")).sort();
  if (!migrations.length) throw new Error("No platform SQL migrations were found.");
  database.exec("CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)");
  const applied = database.prepare("SELECT name FROM local_migrations WHERE name = ?");
  const mark = database.prepare("INSERT INTO local_migrations (name) VALUES (?)");
  for (const name of migrations) {
    transaction(database, () => {
      if (applied.get(name)) return;
      database.exec(readFileSync(join(directory, name), "utf8"));
      mark.run(name);
    });
  }
}

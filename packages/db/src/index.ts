import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createHash } from "node:crypto";
import { migrations } from "./migrations.js";
import * as schema from "./schema.js";

export type StateDockDb = LibSQLDatabase<typeof schema>;
export function createDatabase(url = process.env.DATABASE_URL ?? "file:./statedock.sqlite"): {
  client: Client;
  db: StateDockDb;
} {
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return { client, db: drizzle(client, { schema }) };
}
export async function migrate(client: Client): Promise<void> {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)",
  );
  for (const migration of migrations) {
    const checksum = createHash("sha256").update(migration.sql).digest("hex");
    const tx = await client.transaction("write");
    try {
      const applied = await tx.execute({
        sql: "SELECT checksum FROM schema_migrations WHERE version=?",
        args: [migration.version],
      });
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error("Applied migration checksum mismatch");
      } else {
        await tx.executeMultiple(migration.sql);
        await tx.execute({
          sql: "INSERT INTO schema_migrations(version,checksum) VALUES (?,?)",
          args: [migration.version, checksum],
        });
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }
}

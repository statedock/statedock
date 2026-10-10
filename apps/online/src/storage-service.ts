/** Database deletion queues object cleanup atomically. R2 removal is idempotent. */
export async function deleteStoredObjects(
  db: D1Database,
  bucket: R2Bucket,
  keys: string[],
  mutation: D1PreparedStatement,
) {
  await db.batch([
    ...keys.map((key) =>
      db
        .prepare("INSERT OR IGNORE INTO storage_cleanup(object_key,created_at) VALUES(?,?)")
        .bind(key, new Date().toISOString()),
    ),
    mutation,
  ]);
  await drainStorageCleanup(db, bucket);
}
export async function drainStorageCleanup(db: D1Database, bucket: R2Bucket) {
  const rows = await db
    .prepare("SELECT object_key FROM storage_cleanup ORDER BY created_at LIMIT 100")
    .all<{ object_key: string }>();
  for (const row of rows.results) {
    try {
      await bucket.delete(row.object_key);
      await db.prepare("DELETE FROM storage_cleanup WHERE object_key=?").bind(row.object_key).run();
    } catch {
      console.warn("Attachment cleanup deferred");
    }
  }
}

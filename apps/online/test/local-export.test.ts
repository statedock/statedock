import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createDatabase, migrate } from "../../../packages/db/dist/index.js";
import { fixture } from "./fixture.js";
import { app } from "../src/index.js";
import { digest, type OnlineEnv } from "../src/auth.js";

test("local SQLite export and first-use import preserve task completion summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "local-export-"));
  const database = join(dir, "source.sqlite"),
    output = join(dir, "export.json");
  const { client } = createDatabase(`file:${database}`);
  const f = await fixture();
  try {
    await migrate(client);
    const at = new Date().toISOString();
    await client.execute({
      sql: "INSERT INTO projects(id,slug,name,created_at,updated_at) VALUES('project','export-test','Export Test',?,?)",
      args: [at, at],
    });
    await client.execute({
      sql: "INSERT INTO plans(id,project_id,number,global_number,title,body,summary,status,created_at,updated_at) VALUES('task','project',1,1,'Completed task','Goal','Verified outcome','DONE',?,?)",
      args: [at, at],
    });
    client.close();
    execFileSync("python3", [
      new URL("../scripts/export-local.py", import.meta.url).pathname,
      database,
      output,
    ]);
    const payload = JSON.parse(await readFile(output, "utf8"));
    assert.equal(payload.plans[0].summary, "Verified outcome");
    await f.client.execute({
      sql: "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES('import-session','one',?,?,?)",
      args: [await digest("isolated-import"), new Date(Date.now() + 60000).toISOString(), at],
    });
    const response = await app.request(
      "https://dock.example.test/api/auth/import-local",
      {
        method: "POST",
        headers: {
          Cookie: "statedock_session=isolated-import",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { DB: f.db } as OnlineEnv,
    );
    assert.equal(response.status, 201, await response.text());
    const imported = await f.client.execute(
      "SELECT summary FROM plans WHERE title='Completed task'",
    );
    assert.equal(imported.rows[0].summary, "Verified outcome");
  } finally {
    client.close();
    f.client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { StateDockService } from "@statedock/core";
import { createDatabase, migrate } from "@statedock/db";
import { createRepository } from "@statedock/db/service";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
process.env.DATABASE_URL ??= `file:${fileURLToPath(new URL("../../../statedock.sqlite", import.meta.url))}`;
const { client, db } = createDatabase();
await migrate(client);
const port = Number(process.env.PORT ?? 3000);
const app = createApp(new StateDockService(createRepository(db)));
const webRoot = fileURLToPath(new URL("../../web/dist/", import.meta.url));
app.get("/assets/*", serveStatic({ root: webRoot }));
app.get("/icons/*", serveStatic({ root: webRoot }));
app.get("/", serveStatic({ root: webRoot, path: "index.html" }));
serve({ fetch: app.fetch, port }, (info) =>
  console.log(`StateDock API listening on http://localhost:${info.port}`),
);

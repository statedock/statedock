import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StateDockService } from "@statedock/core";
import { createDatabase, migrate } from "@statedock/db";
import { createRepository } from "@statedock/db/service";
import { fileURLToPath } from "node:url";
import { createServer } from "./server.js";

// Absolute default ensures API and MCP share data regardless of the host's cwd.
process.env.DATABASE_URL ??= `file:${fileURLToPath(new URL("../../../statedock.sqlite", import.meta.url))}`;
const { client, db } = createDatabase();
try {
  await migrate(client);
  const server = createServer(new StateDockService(createRepository(db)), {
    id: process.env.STATEDOCK_ACTOR_ID ?? "coding-agent",
    type: "agent",
    name: process.env.STATEDOCK_ACTOR_NAME,
  });
  const transport = new StdioServerTransport();
  transport.onclose = () => client.close();
  await server.connect(transport);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void server.close().finally(() => {
        client.close();
        process.exit(0);
      });
    });
} catch (error) {
  console.error(error);
  client.close();
  process.exitCode = 1;
}

# Migration history

The Cloudflare Worker uses `apps/online/migrations` and D1's migration ledger. Numbers 0012 and 0013 are intentionally absent: those numbers belonged to hosted-service billing migrations, which are excluded from this product. Nothing needs to be downloaded or inserted into those gaps. Apply the distributed SQL files with Wrangler in their existing order.

Existing instances already record these filenames. Do not renumber or edit applied migrations; append a new migration for schema changes. Migration 0020 introduces explicit administrator approval; see the admission upgrade instructions in the deployment guide.

The local development SQLite adapter has a separate history in `packages/db`. Its schema is for developer tools and regression fixtures, without Worker account/OAuth services. Never apply it to D1 or use a D1 export as a local adapter database. Changes to shared task storage must consider both adapters and pass their tests.

Migration 0023 adds per-device Web Push subscriptions and a durable event delivery queue, and extends notification preferences while preserving existing settings. It does not enqueue historical task events. Back up D1 before applying migrations.

Migration 0024 adds stable agent identities, MCP token bindings and assigned/claimed task identity fields with queue guards. Migration 0025 supports retiring identities, preserving completed history and clearing pending assignments. Existing tokens remain valid but start Unbound; bind them in MCP Connections before claiming remote Ready queues. Existing OAuth connections must reconnect and select an identity. Apply both migrations before deploying the updated Worker.

# Architecture and development

- `packages/core`: task/project contracts and lifecycle semantics. No Cloud billing, SQL, platform, or browser dependencies.
- `packages/db`: SQLite implementation used by the local API and regression fixtures.
- `apps/api`: shared Hono API routes and development server.
- `apps/mcp`: shared MCP tool definitions, policies and stdio development adapter.
- `apps/online`: Cloudflare deployment composition: D1, accounts, OAuth, project membership, attachments, integrations, notification outbox, and instance administration.
- `apps/web`: full application PWA and usage documentation, with no paid upgrade UI or official marketing pages.

The local API/stdio tools are development utilities, not a certified Docker/server deployment. Production support for this release is the Cloudflare Worker.

Project membership and instance administration are separate boundaries. Administrator status does not bypass the repositories' tenant checks. Request-time checks reject suspended users; an authentication version prevents old OAuth grants from recovering when an account is enabled again.

Notification jobs are recorded by the task-event trigger in the same D1 transaction as the task lifecycle change. Delivery uses leases and bounded retry; scheduled work runs every five minutes. It is at-least-once delivery, so retries can produce duplicates. Attachment cleanup has its own durable queue because R2 and D1 do not share a transaction.

Submit issues and pull requests to this repository (`statedock/statedock`). Contributors do not need access to another repository. Maintainers handle synchronization with hosted-service development; an internal export process must not overwrite accepted contributions.

The SQLite development adapter and Cloudflare D1 adapter share Core contracts and MCP tool definitions, but use separate SQL schemas and migration histories. D1 adds accounts, ownership, membership, notifications and instance admission. A schema change must update the affected adapters and regression fixtures deliberately; do not apply migrations from one stack to the other. See [migration history](migrations.md).

Required checks: `pnpm test`, online and browser typechecks, `pnpm lint`, `pnpm format:check`, `pnpm selfhost:check`, deployment dry-run, and an isolated fresh-instance smoke test. Do not commit personal deploy configuration, `.dev.vars`, databases, fixtures containing real users, exports, or secrets.

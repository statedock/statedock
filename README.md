# StateDock

A shared Todo for you & AI. Keep coding. StateDock keeps track.

StateDock connects your existing agents through shared projects, tasks, plans, progress, results, and notifications. Discuss a plan in ChatGPT, continue with Codex or Claude Code, and keep the project history in one place. Each teammate uses their own tools and credentials.

The official marketing website, interactive demos and promotional pages are excluded.

This repository contains the complete self-deployed product: PWA, accounts, shared projects, attachments, history, API, MCP, OAuth, and Bark / ntfy / Telegram / Discord / outgoing Webhook integrations.

There are no subscription tiers, project quotas, paid notification channels, license servers, or redemption codes. Infrastructure costs belong to the instance operator. Authentication, project ownership checks, rate limits, and upload safeguards remain enabled.

## Deploy

The first release targets **your own Cloudflare account** using Workers, D1, KV, and R2. Docker and production deployment on arbitrary servers are not delivered by this release.

Start with [the deployment guide](docs/self-hosting.md). You will need your own email delivery configuration and a public HTTPS origin for external OAuth/MCP clients. All authentication, task data, and notifications work independently of the official StateDock backend.

## Development

`pnpm dev` and `pnpm mcp` start the local SQLite API and stdio MCP adapters for development and regression testing. They do not provide the account, membership, OAuth and notification services of the deployed Worker. Use the Cloudflare guide for a complete instance. The local SQLite and Worker D1 schemas have separate migration histories; see [architecture](docs/architecture.md).

Node.js 22+ and pnpm 9.15.4:

```sh
pnpm install --frozen-lockfile
pnpm deploy:dry-run
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm selfhost:check
pnpm test:release
```

[Validation and limitations](docs/validation.md) · [Architecture and contribution rules](docs/architecture.md) · [Backups and upgrades](docs/operations.md) · [Agent connection](docs/agent-setup.md) · [Security reporting](SECURITY.md)

## License

StateDock is licensed under **AGPL-3.0-only**; see [LICENSE](LICENSE). Third-party packages retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The license does not grant rights to StateDock trademarks or imply official endorsement of third-party instances.

Deployment depends on your Cloudflare resources, email delivery and external client configuration. See the validation guide for checks to run on your own instance.

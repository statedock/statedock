# StateDock

**Shared project memory for you and your coding agents.**

Goals, decisions and handoffs live in one place. Claude Code, Cursor and Codex read context over MCP, pick up ready work and write back handoffs, so the next agent never starts from zero.

This repository is the Cloudflare self-hosted edition. Deploy it in your own Cloudflare account; you operate its Workers, D1, KV, R2, domain, email delivery, and backups. It is separate from StateDock Cloud and has no Cloud subscription tiers. To run StateDock on your own computer or a Linux server with one command, use [StateDock Local](https://github.com/statedock/statedock-local) instead.

- Product and shared feature guide: [statedock.dev/doc](https://statedock.dev/doc#cloudflare-self-hosted)
- Install and deploy: [docs/self-hosting.md](docs/self-hosting.md)
- Back up, restore, and upgrade: [docs/operations.md](docs/operations.md)
- Agent and MCP setup: [docs/agent-setup.md](docs/agent-setup.md)
- Architecture, validation, and migrations: [docs/architecture.md](docs/architecture.md) · [docs/validation.md](docs/validation.md) · [docs/migrations.md](docs/migrations.md)
- Security reports: [SECURITY.md](SECURITY.md)

## Coding-tool plugins

StateDock's separate [MIT plugin repository](https://github.com/statedock/statedock-plugins) provides shared Skills for saving plans, restoring task context, and recording progress through StateDock Remote MCP. The current packages target the hosted service at `https://statedock.dev/mcp`; self-hosted deployments can use the Skills with their own MCP setup, but the published packages' default endpoint is the hosted service.

- **Codex:** available from the plugin repository's local marketplace; installation is documented in its README.
- **DeepSeek Harness:** [`@statedock/dsh-plugin`](https://www.npmjs.com/package/@statedock/dsh-plugin) is published for Harness `0.2.0-rc.2`; see the [official community showcase](https://github.com/deepseek-ai/deepseek-harness/discussions/9776).
- **ChatGPT app:** submitted to OpenAI for review; approval is pending.
- **Cursor:** Marketplace submission materials are being prepared; installation and approval are not yet verified.

These plugins record and restore project state. They do not execute task code or schedule agents. Plugin code is MIT-licensed; this self-hosted service remains AGPL-3.0-only.

For a complete local install, use the deployment guide above. It covers the required Cloudflare resources, verified email sender, public HTTPS origin, secrets, migrations, deployment, administrator approval, and agent access. The operations guide contains offline backup and recovery steps.

## Development checks

Requirements and the repository's checks are listed in [CONTRIBUTING.md](CONTRIBUTING.md). Typical verification:

~~~sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm selfhost:check
~~~

## License

StateDock is licensed under [AGPL-3.0-only](LICENSE). Dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The license does not grant rights to StateDock trademarks or imply official endorsement of third-party instances.

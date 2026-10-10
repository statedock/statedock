# Third-party notices

StateDock source is AGPL-3.0-only. Dependencies retain their upstream licenses; installing this project does not relicense them.

The pinned dependency inventory is in [docs/dependency-licenses.json](docs/dependency-licenses.json), generated from the installed lockfile. Major runtime packages include Hono (MIT), Zod (MIT), React (MIT), Drizzle ORM (Apache-2.0), the MCP SDK (MIT), and the Cloudflare OAuth provider (MIT). Verify individual entries and their package LICENSE files for attribution.

Development dependencies include Sharp/libvips platform binaries. The inventory identifies libvips as LGPL-3.0-or-later; these native dependencies are installed by development tooling and are not included in the Worker source bundle. Any future distribution of native binaries must carry the applicable upstream notices and meet their corresponding license requirements.

This inventory is package metadata, not a legal certification or a provenance audit of all future contributions. Re-generate and review it when changing dependencies. No vendor source, dependency directory, or native binary is committed in this repository.

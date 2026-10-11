# Deploy StateDock to your own Cloudflare account

This guide deploys a complete, independent StateDock. It does not deploy to the official Cloud database or require a StateDock subscription.

## Requirements

- Node.js 22+ and pnpm 9.15.4.
- A Cloudflare account that can use Workers, D1, KV, and R2.
- A public HTTPS origin: your Worker `workers.dev` origin or a custom domain.
- An email sending provider. The default setup uses your own Resend API key and verified sender domain; the optional Cloudflare `EMAIL` binding is also supported when configured in your account.
- Your own Telegram bot / Discord application / notification endpoints, for the channels you enable. These integrations are optional.

## 1. Install and create resources

```sh
git clone https://github.com/statedock/statedock.git
cd statedock
pnpm install --frozen-lockfile
pnpm --filter @statedock/online exec wrangler d1 create statedock-selfhost
pnpm --filter @statedock/online exec wrangler kv namespace create statedock-selfhost-oauth
pnpm --filter @statedock/online exec wrangler r2 bucket create statedock-selfhost-attachments
```

If Wrangler is not already logged in, run `pnpm --filter @statedock/online exec wrangler login` before creating resources. Existing global login can be reused; logging in again and running `whoami` are optional.

Use a different resource name if it already exists in your account. KV namespace names must be unique in the account; the runtime binding remains `OAUTH_KV` regardless of the namespace title. Record the D1 and KV IDs returned by these commands.

## 2. Prepare personal configuration

```sh
cp apps/online/wrangler.jsonc apps/online/wrangler.deploy.jsonc
```

The personal file is Git-ignored. Edit it:

| Setting | Value |
|---|---|
| `name` | Your Worker name |
| `d1_databases[0].database_name` / `database_id` | Your new D1 database |
| `kv_namespaces[0].id` | Your new KV namespace |
| `r2_buckets[0].bucket_name` | Your new R2 bucket |
| `vars.PUBLIC_BASE_URL` | Your HTTPS origin, without a path |
| `vars.EMAIL_FROM` | Your verified sending address |

Keep the application and OAuth endpoint on the same origin for the first release. Host-only session cookies intentionally do not share sessions across arbitrary subdomains. The MCP endpoint is `https://YOUR_ORIGIN/mcp`.

For a custom domain, add a `routes` entry with `custom_domain: true` following [Cloudflare configuration docs](https://developers.cloudflare.com/workers/wrangler/configuration/). A `workers.dev` URL can be read from your account's Worker subdomain setting; the deploy output confirms the final URL.

## 3. Configure secrets

Run these from `apps/online` (interactive values are not put in source code):

```sh
pnpm exec wrangler secret put SESSION_SECRET --config wrangler.deploy.jsonc
pnpm exec wrangler secret put OWNER_EMAIL --config wrangler.deploy.jsonc
```

Use a randomly generated long value for `SESSION_SECRET`. `OWNER_EMAIL` is the email allowed to initialize the instance. Choose one email delivery method:

- **Resend:** configure and verify your sender domain, then run `pnpm exec wrangler secret put RESEND_API_KEY --config wrangler.deploy.jsonc`.
- **Cloudflare Email Service:** if your sender domain is already enabled for Email Sending, add the binding below to your personal config and set `vars.EMAIL_FROM` to that verified address. No Resend key is needed. If not enabled, follow the [Cloudflare setup guide](https://developers.cloudflare.com/email-service/get-started/) first.

```json
"send_email": [{ "name": "EMAIL", "allowed_sender_addresses": ["YOUR_VERIFIED_SENDER_ADDRESS"] }]
```

Use your own provider account. See [Resend email API](https://resend.com/docs/api-reference/emails/send-email).

Wrangler secret operations can create or update Worker versions. Do not reuse the official Cloud Worker name or resource IDs. A newly created Worker may not be usable until the app deployment is complete.

## 4. Migrate, build, and deploy

From the repository root:

```sh
pnpm --filter @statedock/online exec wrangler d1 migrations apply statedock-selfhost --remote --config wrangler.deploy.jsonc
pnpm deploy:online
```

Use your actual database name if changed. `pnpm deploy:online` builds the shared Core before the PWA and Worker, so it works directly after a clean clone. For packaging without deploying, run `pnpm deploy:dry-run`.

Fresh instances apply all distributed migrations; [migration history](migrations.md) explains the intentional gaps at 0012/0013. Do not apply this schema to the official Cloud database.

Open your HTTPS origin and sign in with `OWNER_EMAIL` using its email verification code. Only a verified match can initialize the administrator; the saved administrator ID will not change merely because an environment variable changes.

## 5. Invite users and connect agents

The administrator sees **Instance users**. It can approve emails, disable/enable users, and inspect administration history. Public registration is permanently disabled; old `REGISTRATION_MODE` values and stored registration settings do not enable it. Allowing a user does not send an invitation email; share the instance URL yourself. Project owners can invite only approved, active instance users. A project invitation never creates an account or grants server admission. Users can create their own projects; joining the instance does not expose other projects.

Disabled users cannot use browser sessions, API keys, OAuth MCP access, or linked bots, and do not receive pending notifications. Existing sessions/API keys remain revoked after re-enabling; old OAuth grants remain invalid and require reconnection. The administrator cannot disable itself through the UI. Instance administrators have no automatic project-data access.

Generate an Agent Access Token from **Connect Agent**, or connect using OAuth. [Agent setup](agent-setup.md) covers both options. External ChatGPT clients require public HTTPS and correct OAuth discovery metadata; localhost is insufficient.

## 6. Notifications

- Bark / ntfy: configure your own device key or topic in the notification center.
- Outgoing Webhook: configure your endpoint and optional signing secret there.
- Discord channel notifications: configure your webhook in the notification center. For slash commands, configure your own Discord application, `DISCORD_PUBLIC_KEY` and `DISCORD_APPLICATION_ID`, and point its interactions URL to `/api/discord/interactions`.
- Telegram: configure your own `TELEGRAM_BOT_TOKEN`, then use the Telegram connection flow. It registers your own instance's webhook; the bot must not simultaneously be used by another instance.

Check the implemented endpoint paths in the integration routes when configuring provider consoles. Keep API keys and bot tokens in Wrangler secrets.

## Local checks

The distributed `wrangler.jsonc` uses placeholder resource IDs and a local origin; it is intended for isolated development and dry runs. It does not contain account IDs or production resources.

```sh
pnpm --filter @statedock/core build
pnpm --filter @statedock/web build
pnpm --filter @statedock/online exec wrangler d1 migrations apply statedock-selfhost --local
pnpm --filter @statedock/online run deploy:dry-run
pnpm --filter @statedock/online dev
```

For local email sign-in, create the Git-ignored `apps/online/.dev.vars` with your test email configuration and owner email; do not commit it. Local tests inject an isolated email transport and test account data, without sending real messages.

## Admission upgrade

Apply migration 0020 before deploying this version. It adds explicit account approval and login rate counters. The existing administrator and users with a recorded invitation by that administrator remain approved. Accounts created only through old project invitations remain stored, but need administrator approval before they can log in or use existing MCP/bot credentials. Their projects and membership data are not deleted. Review the user list after upgrade. Re-enabling an unapproved account does not approve it.

First administrator initialization requires the server-configured `OWNER_EMAIL` and a successful one-time code delivered to that mailbox; the first public visitor cannot choose the administrator. Changing `OWNER_EMAIL` after initialization does not replace the saved administrator.

Verification-code requests have atomic fixed 15-minute window limits: three per email and thirty per source IP. The same success response is returned for approved and unapproved emails, but only approved active users receive mail. Unknown emails create neither accounts nor codes. Incorrect, expired, consumed, or over-attempt codes cannot sign in. OAuth uses this same login/admission check. Mail delivery still requires a configured supported email provider.

## Optional local-development import

The empty-workspace UI supports a one-time import from the local SQLite development adapter, not a live Cloud account or D1 backup. Export your own compatible database with:

```sh
python3 apps/online/scripts/export-local.py /PATH/TO/LOCAL_DATABASE.sqlite /PRIVATE/PATH/local-export.json
```

The script reads the source without modifying it and creates a protected JSON file. Sign in as the account that should own the imported projects, then use **Import Local SQLite Export** in its empty workspace. This is a bounded first-use migration: at most 2 MB, 20 projects, 30 tasks, 20 documents, 50 activities and 50 task events, with at most 90 records in total. It does not import users, project members, OAuth credentials, notification settings or attachment bytes. It is not a replacement for the D1/R2/KV backup procedure. Never commit or share the export; remove the private export when no longer needed.

## Ready task execution

Planned keeps ideas for discussion. Mark an agreed task Ready in the PWA, then copy the Ready directive and send it to the coding agent bound to this instance and project. The agent claims one Ready task at a time and writes results back. Telegram/Discord captures and Inbox moves stay Planned. This does not create a scheduler or remote-control service.

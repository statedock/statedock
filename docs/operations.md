# Backups, recovery and upgrades

## Scope of a complete backup

Save these separately, with restricted access:

1. **D1**: accounts, projects, members, tasks, files, history, attachment metadata, administration state and notification preferences.
2. **R2**: attachment objects. A database export alone does not contain their bytes.
3. **OAuth KV**: OAuth clients, grants and provider keys. Losing this does not delete tasks, but requires OAuth clients to reconnect. KV contains sensitive authorization material.
4. **Personal configuration and secrets**: domain, resource IDs, email sender, `SESSION_SECRET`, provider keys and bot tokens. Store these in your secret manager, never Git.

For a consistent backup, pause agent/user writes and scheduled delivery during the backup window. D1, R2 and KV are separate services; there is no atomic snapshot across all three.

From `apps/online`, create a protected backup directory outside the checkout:

```sh
umask 077
mkdir -p /YOUR_SECURE_BACKUP_DIRECTORY
pnpm exec wrangler d1 export YOUR_DATABASE --remote --config wrangler.deploy.jsonc --output /YOUR_SECURE_BACKUP_DIRECTORY/database.sql
pnpm exec wrangler d1 execute YOUR_DATABASE --remote --config wrangler.deploy.jsonc --command "SELECT object_key FROM attachments ORDER BY object_key" --json
```

For every recorded attachment key, download the corresponding object with `wrangler r2 object get YOUR_BUCKET/OBJECT_KEY --remote --file BACKUP_FILE`. Preserve a mapping between keys and downloaded files, including content types. For a large bucket use a restricted R2 S3 credential with an S3-compatible backup client; use environment/secret-manager credentials rather than command arguments.

For OAuth KV, list keys using `wrangler kv key list --binding OAUTH_KV --remote --config wrangler.deploy.jsonc`, and export each key with `wrangler kv key get KEY --binding OAUTH_KV --remote --config wrangler.deploy.jsonc`. Preserve expiration metadata and protect all exported values. Do not post export contents in logs or issues. Operators who choose not to retain OAuth sessions can instead provision empty KV on recovery and reconnect clients.

## Recovery

Restore into **new resources** first. Never test a restore by overwriting the live database.

1. Create a fresh D1 database and import the SQL export with `wrangler d1 execute NEW_DATABASE --remote --file BACKUP_SQL --config RECOVERY_CONFIG`. A full export includes schema and migration state; do not apply initial migrations before importing a full export.
2. Upload attachment objects to a new R2 bucket at their original keys, preserving relevant object metadata.
3. Restore OAuth KV keys/expiry/provider secrets, or reconnect OAuth clients using an empty KV namespace. Keep the same origin if restoring existing grants.
4. Restore your personal configuration and secrets; point them to the new resource IDs. Start the same application version first.
5. Check login, project membership, task/history counts, attachments and MCP. Check the saved administrator ID, not merely `OWNER_EMAIL`.
6. Re-enable user writes and scheduled delivery only after verification. Notify jobs are at-least-once; restored pending jobs can cause duplicate delivery.

Cloudflare D1 Time Travel can supplement your exports; retention depends on your account. Follow [D1 backup documentation](https://developers.cloudflare.com/d1/reference/time-travel/) for your plan. Worker code rollback does not roll back D1/R2/KV.

## Upgrade

1. Read the release notes and minimum runtime requirements.
2. Take and verify a complete backup; retain the old code version.
3. Check out the new version and install with `pnpm install --frozen-lockfile`.
4. Run migrations against a restored staging database, then run the new version and verify representative data.
5. Apply pending migrations to your real database using your personal config, and deploy using `pnpm deploy:online`.
6. Verify `/api/health`, OAuth metadata, login, project access, task changes, attachments and channels.

Never rewrite an already released migration. Downgrading the Worker does not undo schema changes; incompatible downgrades require a data restore and coordinated resource recovery.

## Administrator recovery

The configured first email is only used for initial verified bootstrap. Changing it does not transfer administrator rights. If the administrator account is lost, the instance operator can perform a deliberate recovery directly in their own D1 database while access is paused: verify the new email/account identity, approve the verified replacement account by setting `users.instance_approved_at`, replace `instance_settings.admin_user_id`, revoke old sessions/API keys and increment its authentication version. Back up first and record the operation. There is no public unauthenticated administrator-reset endpoint.

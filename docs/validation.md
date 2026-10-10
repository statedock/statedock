# Validation and known limitations

## Supported deployment

This version deploys the full application to your own Cloudflare account: Worker, D1, OAuth KV and R2. Docker and production deployment on arbitrary servers are not supported. The local SQLite API and stdio MCP are development/test tools. Compatibility date and Wrangler are pinned to the tested versions; upgrade them deliberately with regression checks.

## Code checks

Run the commands in README after installing the lockfile. Tests use isolated databases, KV, storage and email transports; they do not prove that your live provider credentials work. The release scan examines tracked and non-ignored source files and rejects personal configurations, credentials and Cloud/marketing modules. It is a guardrail, not a complete security audit or scan of Git history.

## Check your instance

1. Apply migrations and deploy using your own resource IDs and public HTTPS origin. Verify `/api/health` and the PWA.
2. Sign in with the configured founder email. Verify only that email can initialize the administrator and changing the setting cannot replace it.
3. Verify an unapproved email receives no code. Approve B, confirm B initially has no project access, and let B create a private project. Administrator A must not read that project automatically.
4. Verify B cannot admit C through a project invitation. Approve C as administrator before B adds C to the project. Test removal and private-project isolation.
5. Connect your actual agent client. Check `get_instance_info` on that active connection before writes; verify OAuth discovery, PKCE, scopes, token refresh and revocation with the clients you use.
6. Disable B and verify browser sessions, API tokens, OAuth and linked bots stop working. Re-enable B and confirm old credentials remain invalid.
7. Check attachment upload/download, member removal and your configured notification channels. Notification retries can deliver duplicates; provider quotas and webhook policies vary.
8. Restore a backup into separate resources and verify task/history counts, membership and attachment bytes before relying on the backup.

Real email and Telegram/Discord delivery require your own configured providers. ChatGPT and other external OAuth clients require publicly reachable HTTPS; localhost alone is insufficient. Multi-instance guide safeguards cannot force a third-party agent to select the right connection. See [agent setup](agent-setup.md), [deployment](self-hosting.md) and [operations](operations.md).

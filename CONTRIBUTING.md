# Contributing

Submit pull requests and issues to `https://github.com/statedock/statedock`. This repository is the contribution destination; no private upstream access is required.

Use Node.js 22+ and the pinned pnpm version. Start from the architecture guide and run the checks in README before submitting a change.

Keep changes focused on a user-visible goal. Add regression tests for permission, concurrency, storage, notification and authentication changes; avoid tests that only mirror trivial UI implementation.

Do not remove project authorization or OAuth scopes in the name of unrestricted self-hosted functionality. Commercial quotas are absent; security and resource safeguards remain part of the product.

Contributions are submitted under this repository's AGPL-3.0-only license. Third-party code/assets must include their license and provenance. Do not submit secrets, production database dumps or real user information.

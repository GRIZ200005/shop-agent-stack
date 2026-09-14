# Project boundaries

- Build this as an independent personal project intended for future public release.
- Do not import private reference repositories or their Git history, company branding, internal URLs, credentials, proprietary prompts, documents, screenshots, customer data, or environment metadata. Reimplement general mechanisms independently.
- Do not treat removing names from proprietary code as permission to redistribute it.
- Use personal Git author metadata configured by the user; do not inherit organization identities or invent author details.
- Before committing, inspect the staged diff and file list for confidential content. Before publishing, inspect the full repository history and generated artifacts as well.
- Respect all upstream licenses. For mall-derived code, preserve applicable notices, include Apache-2.0 license text, mark modified files, and record the exact upstream commit and modifications.
- The repository includes a P1 three-role frontend and local commerce/after-sale baseline. Describe integration and validation status accurately; use docs/08-p1-runbook-and-verification.md for current evidence. AI, external payment and durable asynchronous refund processing are not implemented.
- Keep secrets and runtime data outside tracked files. Commit only placeholder configuration examples and reviewed synthetic/public fixtures.

See docs/05-repository-and-provenance.md for repository setup and publication requirements.

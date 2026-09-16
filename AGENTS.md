# Project boundaries

## Source, privacy and licensing

- Build Aster as an independent project. Do not import private reference repositories or their Git history, company branding, internal URLs, credentials, proprietary prompts, documents, screenshots, customer data or environment metadata.
- Reimplement general mechanisms independently. Removing names from proprietary code does not grant redistribution rights.
- Use the user's configured personal Git author metadata. Never inherit organization identities or invent author details.
- Before committing, inspect the staged diff and file list. Before publishing, inspect the full repository history, refs, authors and generated artifacts.
- Respect upstream licenses. Preserve mall license text, author notices and modification markers; record its exact commit and changes in THIRD_PARTY_NOTICES.md.
- Keep secrets, runtime databases, raw evaluation outputs and personal learning notes outside tracked files. Only reviewed synthetic/public fixtures and screenshots belong in the repository.
- Follow docs/public-release.md for release checks. Do not change visibility, push a release or rewrite shared history as a side effect of local editing.

## Business authority

- Java owns identity, role checks, prices, inventory, order state, policy authority and business transactions. Page navigation and model output do not grant permission.
- Customer reads and mutations must check ownership. Employee mutations must check current role and, where required, the assigned employee.
- Agent after-sale writes require backend-saved previews, expiry checks and one-time confirmation consumption. Never treat text confirmation as authorization.
- Keep product-then-SKU lock ordering, expected-stock checks, reserved-stock lower bounds and atomic checkout reservations. Inventory audit covers the new API, not every legacy mutation or a complete warehouse ledger.
- Do not enable blocked legacy payment/cancellation routes to make a test pass. Synthetic cleanup must target its exact owner and unpaid order.
- Human support is a customer-confirmed text ticket, not a refund authorization or verified transcript. Preserve assignee-only mutations, row locking and request idempotency. Visible pages use five-second polling, not push delivery.
- Fulfillment is simulated, single-package delivery. Preserve order locking, unique event stages, owner-scoped receipt, after-sale conflicts and legacy receipt delegation. Do not invent missing shipment history or claim real carrier integration.

## Agent, models and context

- Keep owner-scoped encrypted model credentials, redacted responses, separate ignored deployment keys and public-only pinned outbound connections. Never expose API keys to model context or browser storage.
- Preserve bounded tool loops, time/usage budgets, terminal states, SSE event replay and explicit confirmation boundaries.
- User quotes are claims, not authority. Keep successful run termination and task snapshots atomic; never persist failed/stopped updates or confirmation secrets as memory.
- Product tools perform live MySQL keyword/filter lookup and snapshot revalidation, not semantic product retrieval or checkout reservation. Never persist prices/stock as authoritative reference memory.
- Preserve host-owned product references and bounded citation repair. The 16,000 reported-token continuation threshold is not a hard billing cap.
- Do not expose raw model internal reasoning as execution evidence. Tool progress, business cards and final answers are separate outputs.
- Do not describe network search, third-party commerce MCP or cross-session long-term profiles as implemented without code and verification.

## Policies and retrieval

- Published, effective, customer-visible MySQL clauses are authoritative. Drafts are not customer evidence; publication is explicit.
- Preserve transactional policy revisions/withdrawal, index Outbox, catalog digests, generation checks and final source revalidation.
- Online Hybrid/RRF/Rerank has explicit BM25 degradation. Never use experimental Milvus collections for customer answers.
- The index worker is single-instance. Do not scale it without lease/fencing and concurrent publication design.
- The policy evidence subgraph has a two-search budget. Preserve clarification/insufficient-evidence terminal behavior with no subsequent business actions.
- Model assessment is not proven entailment. Hash equality is not semantic correctness; deterministic branch tests do not establish model judgment accuracy.

## Refund delivery and recovery

- Only the admin application enables the refund worker. Preserve transactional Outbox, at-least-once delivery, idempotent consumption and the local simulator ledger.
- A publisher confirm is not a refund success. The local ledger is not an external payment integration.
- Retain exhausted-retry/manual-review states and consumer errors. A publish confirmation must not clear a prior consumer failure.
- Diagnostics are staff-only and read-only. Database pending counts are not broker queue depth; legacy refunds remain outside the asynchronous ledger scope. Never auto-repair mismatches.

## Verification and documentation

- Run checks proportionate to the change. Prefer usable business features and bounded regression over continually expanding model evaluation.
- Paid model calls require explicit authorization; do not run them while paused or as an automatic regression side effect. Scripted/fixture engines must never silently replace unavailable real models.
- Run stop/restart fault tests sequentially; restore Milvus, broker and worker state in finally blocks.
- Preserve first failures, incomplete outcomes and targeted reruns. Contract pass rates, retrieval metrics and answer accuracy are different measurements.
- Development datasets and unrun reserved scenarios are not independently validated holdouts. Do not tune on reserved sets or infer answer accuracy from contract checks.
- Local short tests do not demonstrate production capacity, high availability or complete upstream security review.
- Public guides describe implemented behavior and supported limits. Keep personal learning plans in ignored local files, and dated experiment evidence in docs/records.

See docs/README.md for current engineering guides and docs/records/README.md for design and verification evidence.

# Third-party provenance

Aster Commerce includes code derived from [macrozheng/mall](https://github.com/macrozheng/mall).

- Upstream commit: `9bfc2fd2c4aaa4ac519e9152e65d673a5380de1a`.
- Included modules: mall-common, mall-mbg, mall-security, mall-admin, mall-portal.
- Location: `services/commerce`.
- License: Apache License 2.0; complete upstream text in [services/commerce/LICENSE](services/commerce/LICENSE). Original author comments are retained.
- Database: `deploy/mysql/init/01-schema.sql` derives from that revision's `document/sql/mall.sql`. Only CREATE TABLE statements are included; all upstream INSERT records are excluded.
- No upstream Git history is imported. No private reference project source is included.

## Aster changes

- Parent `pom.xml`: selected five modules, removed the upstream Docker host, enabled tests by default.
- Admin/portal `application.yml`: local Aster profile and externally supplied JWT secrets.
- Removed upstream dev/prod profiles and generator connection configuration from this distribution.
- `OmsPortalOrderServiceImpl.java`: order-detail ownership validation, checkout address ownership validation, empty-cart rejection.
- `OmsPromotionServiceImpl.java`: authoritative SKU pricing before promotion calculation, invalid quantity/SKU/product rejection.
- `OrderOwnershipTest.java` and `CartPricingTest.java`: independently written regression tests.
- `deploy`, scripts and synthetic seed: independently written local baseline and verification workflow, except the attributed schema extraction.

The upstream provides the existing commerce functionality. AI workflows, three-role interfaces and production reliability enhancements are planned; they are not completed contributions in P0. Dependency licenses remain applicable independently of this source license.

## P1 additions and modifications

- Original module `services/commerce/aster-after-sale`: transactional after-sale requests, atomic claims, decisions, local payment/refund simulation and policy persistence using Spring JDBC. Portal/admin dependencies and parent module list were amended with modification notices.
- Original portal `AsterCustomerController` and `AsterPaymentBoundary`: owned customer endpoints and restrictions on unverified legacy payment/cancellation routes.
- Original admin `aster/admin` classes: current role checks, local bootstrap, staff management and legacy-route guard.
- Modified upstream `UmsAdminController`: disabled public administrator registration; retains original author notice.
- Modified upstream `SecurityConfig`: authenticated `/aster/**` routing; domain role/ownership authorization remains in Aster handlers.
- Original `apps/web`: React/TypeScript frontend, inline SVG product illustrations, CSS, API client and browser/API integration tests. No private reference source or proprietary assets imported.
- Original migration `003-p1.sql`, Nginx config and scripts. Local logging disables upstream payload/invalid-token loggers to avoid retaining credentials in new request logs.

Frontend runtime dependencies include React, React DOM, Scheduler (MIT) and Lucide (ISC and included notices). Their supplied license texts are copied to `apps/web/public/licenses` and distributed at `/licenses/*.txt` with the frontend. Exact dependency versions are in `apps/web/package-lock.json`. Build/test dependencies retain their own licenses. No root license for all new work is selected by this attribution document.

## P2 additions and modifications

- Original `AgentOperationService`, `AgentOperationTest` and portal `AsterAgentController`: short execution grants, persisted previews, owner-bound confirmation, row locks, expiry and atomic operation consumption. Original module test dependency added. Modified upstream `SecurityConfig` allows internal Aster handlers to authenticate their execution header; all business handlers still validate the grant and ownership.
- Original `services/agent`: FastAPI sessions and SSE, LangGraph orchestration, multi-provider Chat Completions adapter, official MCP SDK transport, isolated SQLite event store and tests. No private source, prompts or metadata imported.
- Original React assistant workspace, P2 SQL migration, Compose/proxy configuration and run/verification scripts.
- Python dependencies are installed from the pinned `services/agent/requirements.lock`, not copied from a reference application. FastAPI, LangGraph, MCP Python SDK and HTTPX retain their MIT notices inside installed distributions; all transitive/build/test dependencies retain their own licenses. The MCP dependency is explicitly on the v1 maintenance line (`mcp==1.30.0`), not a claim of using the v2 API. Container redistribution must retain installed package notices.

## P2.1 additions and modifications

- Original React login page, account menu, preferences/model settings and their styling/tests; no imported product assets.
- Original encrypted personal model preferences and public-only pinned outbound HTTP transport. Uses the existing locked cryptography package under its supplied Apache-2.0/BSD notices.
- Modified upstream `UmsMemberController.info` to return only public account identity fields, preserving author notices.
- Startup creates an ignored separate deployment encryption key; no credentials or generated key files are distributed with the source.

## Assistant streaming and Markdown rendering

- Original viewport chat layout, observable tool progress, incremental provider SSE adapter and regression tests.
- React Markdown and remark-gfm render responses without raw HTML. Their supplied licenses, along with all installed production transitive dependencies, are collected during the frontend build into `apps/web/public/licenses/runtime-dependencies.txt` and distributed at `/licenses/runtime-dependencies.txt`. Exact versions remain in the npm lockfile.

## P3a policy knowledge

- Original `PolicyService`, policy migration 005, MCP policy retrieval, source validation, administrator revision/withdrawal and customer citation UI. Original Aster controllers now delegate policy operations to the dedicated service; the original AfterSaleService no longer contains the old publication path.
- Original synthetic authoring drafts, lexical baseline, development labels and verification scripts. LangChain Core Document uses the existing pinned dependency; no private source data, embeddings, models or reference code were imported.

## P3b retrieval experiments

- Milvus (Apache-2.0), etcd (Apache-2.0), and MinIO (AGPL-3.0) run as separate upstream containers; this repository contains original local deployment configuration, not redistributed modified server binaries. Preserve upstream notices when distributing images.
- BAAI/bge-small-zh-v1.5 and BAAI/bge-reranker-base are downloaded from their public Hugging Face model repositories, whose model cards identify the MIT license. Model cards and pinned revisions remain in the local cache and experiment manifests; model weights are not committed or bundled into this repository. Review and include the supplied license before redistributing weights.
- PyTorch, Sentence Transformers, Transformers and PyMilvus are installed in an isolated evaluation image. Exact resolved package versions are recorded per run. The RRF implementation, evaluation orchestration, synthetic questions and reports are original Aster work; no private prompts or company metadata are used.

## P3c online policy retrieval

- Original Aster transactional index outbox, authenticated index endpoints, single-worker generation builds, snapshot digests, MCP hybrid selection/fallback and UI retrieval status. Reuses the pinned public P3b models and dependencies; no additional private source or model data imported. Formal and experimental Milvus collections have separate ownership prefixes.

## P3d policy evidence gate

- Original assessment prompt, bounded LangGraph subgraph, fixed clarification messages, runtime budget integration and deterministic branch tests. Reuses existing pinned LangGraph and provider integrations; no private reference prompts or company materials imported.

## P3e session task context

- Original bounded context builder, user-quote task memory tool, owner-scoped SQLite snapshots, runtime integration and synthetic multi-turn tests. Uses existing dependencies; no private reference code, prompts or datasets imported.

## P3f Agent evaluation

- Original synthetic multi-turn development scenarios, isolated tool adapter, history/task ablation, contract scorer and experiment reporting. Uses existing dependencies; no external benchmark or private customer data imported.

## P4a asynchronous simulated refunds

- Original refund outbox schema, dispatcher/consumer, local simulator ledger, state transitions, UI polling and recovery tests. Uses Spring AMQP under the existing Spring Boot dependency management; H2 is added only for tests. This is not an external payment SDK or proprietary channel integration.

## P4b refund diagnostics

- Original read-only reconciliation rules, staff monitoring UI, controlled consumer error persistence and tests. Reuses current dependencies and synthetic fixtures; no external payment records imported.

## Original product catalog

The original catalog expansion adds independently authored synthetic product records and AI-generated product illustrations (see `catalog/image-manifest.json` for prompts and hashes). These are fictional goods, not third-party merchant inventory or product photography. PNG originals remain local; the repository uses WebP encodings. No private reference assets are included.

`mall-portal/.../PmsPortalProductServiceImpl.java` is additionally modified to give default and equal-price search results deterministic ordering for pagination; the upstream author notice is retained. Original frontend code now displays product pictures, category filters, pages and product details.

## Product Agent integration

Original `ProductQueryService`, MCP product tools, snapshot validation, Agent product cards, development evaluation runner and tests connect the synthetic catalog to the existing Agent. The upstream-derived `PmsPortalProductServiceImpl.java` additionally rejects missing, deleted or unpublished product details; its author and modification notices are preserved. No new external source code or private data is imported.

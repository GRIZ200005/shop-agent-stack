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

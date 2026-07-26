# Flow-First Local Knowledge Base Design

## Summary

Restructure Gus Knowledge around end-to-end business flows for developers. Markdown remains the source of truth. Astro Starlight renders the documentation as a local static site, and Pagefind provides full-text search without a backend or deployment platform.

The primary navigation model is:

1. Business capability
2. End-to-end flow
3. Flow section

Service names describe ownership inside a flow. They are searchable metadata and must not determine the top-level document structure.

## Goals

- Let a developer start with a business flow such as Swap, Withdraw, or Internal Transfer and find the complete behavior in one place.
- Keep each flow understandable from its trigger through its final outcomes.
- Identify which service owns each rule or step without splitting the flow by service.
- Provide local full-text search across Thai and English terms, service names, integrations, and error codes.
- Use one command to build, index, and serve a searchable local site.
- Validate document structure and metadata before serving the site.

## Non-Goals

- Public or private hosting
- Vercel configuration
- Authentication or authorization
- AI-oriented prompts, skills, or navigation
- A backend search service
- Semantic or LLM-powered search
- Moving implementation plans into external service repositories during this migration

Existing implementation-plan files will not be migrated into the new documentation tree or indexed by the new site. They will remain untouched until each owning service repository or issue-tracker destination is explicitly selected.

## Information Architecture

```text
Gus Knowledge/
├── README.md
├── package.json
├── astro.config.mjs
├── src/
│   ├── content.config.ts
│   └── content/
│       └── docs/
│           ├── index.md
│           ├── business-flows/
│           │   ├── trading/
│           │   │   ├── index.md
│           │   │   ├── swap/
│           │   │   └── big-lot/
│           │   ├── fund-movement/
│           │   │   ├── deposit/
│           │   │   ├── withdraw/
│           │   │   └── internal-transfer/
│           │   ├── asset-management/
│           │   │   ├── portfolio-balance/
│           │   │   ├── ledger-processing/
│           │   │   └── cost-calculation/
│           │   ├── payment/
│           │   │   ├── payment-request/
│           │   │   └── payment-inquiry/
│           │   └── offering/
│           │       ├── subscription/
│           │       └── eligibility/
│           ├── shared-rules/
│           ├── system-context/
│           └── developer-guides/
├── public/
│   └── assets/
├── tools/
│   └── validate-docs.mjs
└── dist/
```

`dist/` is generated output and remains ignored by Git.

### Navigation rules

- `business-flows/` is the main interface for readers.
- Capabilities group related flows but do not contain service-specific implementation details.
- Each capability has an `index.md` that explains its scope and lists its flows.
- `shared-rules/` contains rules used by multiple flows, such as shared error codes, permissions, security constraints, and common states.
- `system-context/` contains service maps, integrations, and infrastructure constraints needed to understand a flow.
- `developer-guides/` contains instructions for reading and maintaining the business documentation.
- Implementation plans and AI workflow documents are excluded from the generated site.

## Flow Document Model

A flow document is a deep module for business knowledge: its interface is the flow name and table of contents, while its implementation contains the participating services, rules, transitions, failures, and integrations.

Each flow must contain:

1. Purpose and scope
2. Trigger and preconditions
3. Participating services
4. End-to-end sequence
5. Business rules
6. State transitions
7. Error and recovery behavior
8. Final outcomes
9. Related shared rules and flows
10. Code references where available

Service ownership is expressed within the relevant section:

```markdown
## Validate withdrawal request

**Owner service:** `order-service`

- The amount must be greater than the configured minimum.
- The available balance must cover the amount and transfer fee.
```

When a rule is reused by multiple flows, the flow summarizes the effect and links to the canonical shared rule instead of duplicating the full rule.

## Metadata Schema

Every published document requires frontmatter validated through Astro's content collection schema:

```yaml
---
title: Fiat Withdrawal
description: การถอนเงินบาทจากบัญชีลูกค้าไปยังธนาคาร
capability: Fund Movement
services:
  - order-service
integrations:
  - scb
aliases:
  - ถอนเงิน
  - ถอนเงินบาท
  - withdraw
  - withdrawal
errorCodes:
  - WITHDRAW_AMOUNT_INVALID
  - INSUFFICIENT_BALANCE
status: active
lastUpdated: 2026-07-27
---
```

Rules:

- `title`, `description`, `status`, and `lastUpdated` are required for all published pages.
- `capability`, `services`, and `aliases` are required for business-flow pages.
- `integrations` and `errorCodes` are optional arrays.
- Valid status values are `draft`, `active`, and `deprecated`.
- Draft pages do not appear in the production-style local build or search index.
- Deprecated pages remain searchable and visibly show their status.
- Titles and generated slugs must be unique.
- Aliases should contain both Thai and English terminology when both are used by developers.

## Local Site and Search

Astro Starlight renders Markdown using a standard Markdown implementation. This replaces the current custom renderer.

Pagefind indexes the generated HTML after the Astro build. Search covers:

- Page titles
- Headings and body text
- Aliases
- Capability
- Service names
- Integration names
- Error codes

Search results show:

- Flow title
- Matching section
- Capability
- Participating services
- An excerpt around the matching text
- A direct link to the matching section

Thai and English synonyms are explicit aliases. Search does not attempt semantic expansion.

The initial search interface provides text search. Capability and service filters are included only if they can be implemented through Pagefind metadata without replacing Starlight's search interface with a large custom application.

## Local Commands

```bash
npm run docs:dev
```

Starts Astro's development server for fast Markdown editing. Full-text search is not guaranteed to reflect unbuilt changes.

```bash
npm run docs:local
```

Runs validation, builds the static site, generates the Pagefind index, and serves the indexed output locally. This is the primary command for reading the knowledge base.

```bash
npm run docs:build
```

Runs validation and creates the static site plus Pagefind index in `dist/`.

```bash
npm run docs:check
```

Validates content without starting a server.

## Validation

`docs:check` fails when:

- Required frontmatter is absent or invalid.
- A published page contains an unresolved internal link.
- Two pages produce the same title or slug.
- A business-flow page lacks capability, services, or aliases.
- A referenced asset does not exist.
- A generated local link points to a directory rather than a page.
- An implementation-plan document is placed under the published documentation tree.

Cross-repository code references are represented as text or structured metadata, not machine-specific `file:///Users/...` links.

## Migration Strategy

Migration happens in vertical slices:

1. Add the Astro Starlight shell, validation, and local commands.
2. Migrate shared rules and system context.
3. Migrate one complete flow, Swap Limit Order, and verify navigation and search.
4. Use the validated flow as the template for the remaining trading flows.
5. Migrate Fund Movement, Asset Management, Payment, and Offering.
6. Update internal links after each slice.
7. Remove the old custom HTML generator only after all published content is represented in the new site.

Existing source documents remain in place until their replacement flow passes validation. Deletion or relocation occurs only after content parity is checked.

## Content Mapping Principles

- Existing service-specific documents are inputs, not the target structure.
- Multiple source documents may be merged into one end-to-end flow.
- A source document may contribute to multiple flows only through a canonical shared rule; duplicated full sections are avoided.
- Historical implementation reasoning is not copied into business-flow documents unless it describes current system behavior.
- The current `03-Implementation/` tree is excluded from migration and search.
- AI prompt and skill documents are excluded from the new developer-facing site.

## Error Handling

- Validation errors identify the source file, field or link, and expected correction.
- A failed validation prevents `docs:build` and `docs:local` from serving a misleading site.
- Pagefind indexing failure makes `docs:build` fail.
- The local server starts only after validation, static build, and search indexing succeed.

## Verification

Automated verification covers:

- Metadata schema validation
- Internal link and asset validation
- Duplicate slug detection
- Successful Astro static build
- Successful Pagefind indexing
- Presence of expected search terms in the generated index
- Exclusion of drafts and implementation plans

Manual verification covers:

- Navigation from capability to flow
- Readability of an end-to-end flow
- Search by Thai alias, English alias, service name, integration, and error code
- Direct navigation to a matching section
- Mobile and desktop layout

## Acceptance Criteria

- A developer can run `npm install` followed by `npm run docs:local` and open the local documentation site.
- Search works without internet access after dependencies are installed.
- A developer can locate Swap Limit Order by searching `swap`, `limit order`, its Thai alias, a participating service, or a documented error code.
- The complete Swap Limit Order behavior is readable without navigating through service-based folders.
- Every rule or sequence stage identifies its owning service.
- No implementation plans or AI workflow documents appear in navigation or search.
- The old custom renderer is no longer the active documentation interface after migration completes.
- Existing user changes outside the migration are preserved.

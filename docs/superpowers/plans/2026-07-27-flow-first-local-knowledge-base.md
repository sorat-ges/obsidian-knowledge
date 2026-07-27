# Flow-First Local Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom documentation renderer with a local Astro Starlight site organized by end-to-end business flow and searchable through Pagefind.

**Architecture:** Markdown under `src/content/docs/` is the only published source. Starlight validates frontmatter and renders the site, a focused Node validator enforces cross-file rules, and Starlight's Pagefind integration builds the local full-text index. Existing documents stay untouched until their content has been represented and verified in the new tree.

**Tech Stack:** Node.js, npm, Astro, Astro Starlight, Pagefind, YAML, Node's built-in test runner

## Global Constraints

- The site is local-only; do not add Vercel, hosting, authentication, SSR, or deployment configuration.
- Navigation is capability → end-to-end flow → section.
- Service names are metadata and section ownership labels, not top-level folders.
- Markdown remains the source of truth.
- Search is keyword-based; Thai/English equivalence is expressed through explicit aliases.
- Published business-flow pages require `capability`, `services`, and `aliases`.
- Implementation plans and AI workflow documents must not enter `src/content/docs/`.
- Existing implementation-plan files remain untouched until an external destination is selected.
- Preserve the existing user changes in `.obsidian/workspace.json` and `03-Implementation/Active/swap-cancel-webhook-race-handling.md`.
- Keep the old source documents until content parity has been checked.
- Use `apply_patch` for repository file edits and targeted `git add` commands for commits.

---

## File Map

### Tooling and configuration

- `package.json`: dependency and local-doc command interface.
- `package-lock.json`: exact dependency lock.
- `astro.config.mjs`: Starlight navigation, Pagefind, component override, and styling configuration.
- `tsconfig.json`: Astro TypeScript defaults.
- `src/content.config.ts`: Starlight schema extended with business metadata.
- `tools/lib/content-rules.mjs`: pure validation module.
- `tools/validate-docs.mjs`: CLI adapter for the validation module.
- `tests/content-rules.test.mjs`: validator behavior tests.
- `tests/site-shell.test.mjs`: generated-site behavior test.
- `tests/content-parity.test.mjs`: legacy-to-new parity behavior test.

### Site presentation

- `src/components/FlowPageTitle.astro`: title plus searchable flow metadata.
- `src/styles/custom.css`: metadata chips and local documentation styling.
- `src/content/docs/index.md`: developer entry point.
- `src/content/docs/developer-guides/reading-business-flows.md`: short usage guide.
- `src/content/docs/developer-guides/maintaining-docs.md`: authoring contract.

### Migrated content

- `src/content/docs/shared-rules/*.md`: canonical shared rules.
- `src/content/docs/system-context/**/*.md`: architecture and integration context.
- `src/content/docs/business-flows/trading/*.md`: Swap, Big Lot, Routing, Hedge.
- `src/content/docs/business-flows/fund-movement/*.md`: Fiat withdrawal, Fireblocks deposit/withdrawal, internal transfer.
- `src/content/docs/business-flows/asset-management/*.md`: Ledger processing, portfolio/reporting, XD sync, master-data sync.
- `src/content/docs/business-flows/payment/*.md`: Payment request/transfer and inquiry/callback.
- `src/content/docs/business-flows/offering/*.md`: Subscription and eligibility.
- `public/assets/*`: migrated images.

### Existing interface retirement

- `README.md`: local usage and new source layout.
- `.gitignore`: generated/build directories.
- `00-Home.md`: retained as a legacy pointer during parity checking.
- `tools/build-docs-site.mjs`: removed after parity verification.
- `tools/check-docs-site.mjs`: removed after validator replacement.
- `tools/serve-docs-site.mjs`: removed after local Starlight command replacement.
- `tools/normalize-markdown.mjs`: removed after source migration and schema enforcement.

---

### Task 1: Validation Module and Command Interface

**Files:**
- Modify: `package.json`
- Create: `tests/content-rules.test.mjs`
- Create: `tools/lib/content-rules.mjs`
- Create: `tools/validate-docs.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Markdown files rooted at `src/content/docs/` and assets rooted at `public/`.
- Produces: `validateDocs({ docsDir, publicDir }): Promise<Array<{ file: string, message: string }>>`.
- Produces: CLI command `node tools/validate-docs.mjs` with exit code `0` on success and `1` on diagnostics.

- [ ] **Step 1: Add the test and dependency command surface**

Replace `package.json` scripts with:

```json
{
  "name": "gus-knowledge",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "docs:dev": "astro dev",
    "docs:check": "node tools/validate-docs.mjs",
    "docs:build": "npm run docs:check && astro build",
    "docs:local": "npm run docs:build && astro preview"
  }
}
```

Install and lock the implementation dependencies:

```bash
npm install astro @astrojs/starlight yaml
```

Append these generated paths to `.gitignore`:

```gitignore
node_modules/
.astro/
dist/
```

- [ ] **Step 2: Write failing validator tests**

Create `tests/content-rules.test.mjs` using `node:test`, `node:assert/strict`, `fs/promises.mkdtemp`, and temporary `docs`/`public` directories. The test file must import:

```js
import { validateDocs } from "../tools/lib/content-rules.mjs";
```

Cover these exact cases:

```js
test("accepts a valid business flow", async () => {
  // Write business-flows/trading/swap-limit-order.md with every required field.
  // Assert diagnostics deep-equal [].
});

test("requires common metadata", async () => {
  // Write shared-rules/glossary.md with only a title.
  // Assert messages mention description, status, and lastUpdated.
});

test("requires flow metadata", async () => {
  // Write business-flows/trading/swap.md without capability/services/aliases.
  // Assert one diagnostic for each missing field.
});

test("rejects duplicate slugs", async () => {
  // Write foo.md and foo/index.md.
  // Assert the duplicate slug "foo" is reported.
});

test("rejects missing markdown targets and directory links", async () => {
  // Link to ./missing.md and ../shared-rules/.
  // Assert both references are reported.
});

test("rejects missing assets and machine-specific file URLs", async () => {
  // Reference /assets/missing.png and file:///Users/example/code.go.
  // Assert both references are reported.
});

test("rejects implementation plans in published docs", async () => {
  // Write developer-guides/example.md with documentType: implementation-plan.
  // Assert the implementation-plan diagnostic is returned.
});
```

- [ ] **Step 3: Run tests and verify the missing-module failure**

Run:

```bash
npm test
```

Expected: FAIL because `tools/lib/content-rules.mjs` does not exist.

- [ ] **Step 4: Implement the pure validator**

Implement `tools/lib/content-rules.mjs` with these exports:

```js
export function slugForRelativePath(relativePath) {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/\.(md|mdx)$/, "")
    .replace(/(^|\/)index$/, "")
    .replace(/^\/|\/$/g, "");
}

export async function validateDocs({ docsDir, publicDir }) {
  // Return diagnostics; do not print or call process.exit here.
}
```

Implementation requirements:

- Recursively load `.md` and `.mdx`.
- Parse YAML between the first pair of `---` delimiters with `yaml.parse`.
- Require `title`, `description`, `status`, and `lastUpdated`.
- Permit only `draft`, `active`, and `deprecated` status values.
- For paths under `business-flows/`, require non-empty `capability`, `services`, and `aliases`.
- Generate slugs with `slugForRelativePath()` and reject duplicates.
- Validate Markdown links and images while ignoring `http:`, `https:`, `mailto:`, and `#`.
- Reject every `file:` URL with the message `machine-specific file URL is not allowed`.
- Reject local links whose target is a directory.
- Resolve `/assets/...` from `public/` and relative links from the source file directory.
- Reject `documentType: implementation-plan`.
- Sort diagnostics by `file`, then `message`, for deterministic tests.

- [ ] **Step 5: Implement the CLI adapter**

Create `tools/validate-docs.mjs`:

```js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDocs } from "./lib/content-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagnostics = await validateDocs({
  docsDir: path.join(root, "src/content/docs"),
  publicDir: path.join(root, "public"),
});

if (diagnostics.length > 0) {
  for (const diagnostic of diagnostics) {
    console.error(`${diagnostic.file}: ${diagnostic.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("Documentation validation passed.");
}
```

- [ ] **Step 6: Run validator tests**

Run:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit the validation interface**

```bash
git add package.json package-lock.json .gitignore tests/content-rules.test.mjs tools/lib/content-rules.mjs tools/validate-docs.mjs
git commit -m "feat: add flow documentation validator"
```

---

### Task 2: Astro Starlight Shell and Searchable Metadata

**Files:**
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `src/content.config.ts`
- Create: `src/components/FlowPageTitle.astro`
- Create: `src/styles/custom.css`
- Create: `src/content/docs/index.md`
- Create: `src/content/docs/developer-guides/reading-business-flows.md`
- Create: `src/content/docs/business-flows/trading/index.md`

**Interfaces:**
- Consumes: validated Markdown metadata.
- Produces: static pages in `dist/`, Pagefind index in `dist/pagefind/`, and local URLs matching content paths.
- Produces: visible/indexed `capability`, `services`, `integrations`, `aliases`, `errorCodes`, and `status` metadata.

- [ ] **Step 1: Write a failing generated-site behavior test**

Create `tests/site-shell.test.mjs`. Run the real build with `spawnSync`, then
read the generated Trading page and assert consumer-visible HTML:

```js
const build = spawnSync("npm", ["run", "docs:build"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

const html = await readFile(
  path.join(root, "dist/business-flows/trading/index.html"),
  "utf8",
);
assert.match(html, /<h1 id="_top">Trading<\/h1>/);
assert.match(html, /data-pagefind-filter="capability"[^>]*>[\s\S]*Trading/);
assert.match(html, /data-pagefind-filter="service"[^>]*>[\s\S]*order-service/);
await access(path.join(root, "dist/pagefind/pagefind.js"));
```

- [ ] **Step 2: Run the smoke test**

Run:

```bash
node --test tests/site-shell.test.mjs
```

Expected: FAIL because the Starlight shell and Trading page do not exist.

- [ ] **Step 3: Add Astro and Starlight configuration**

Create `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Gus Knowledge",
      description: "End-to-end business flows for developers",
      pagefind: true,
      customCss: ["./src/styles/custom.css"],
      components: {
        PageTitle: "./src/components/FlowPageTitle.astro",
      },
      sidebar: [
        {
          label: "Business Flows",
          autogenerate: { directory: "business-flows" },
        },
        {
          label: "Shared Rules",
          autogenerate: { directory: "shared-rules" },
        },
        {
          label: "System Context",
          autogenerate: { directory: "system-context" },
        },
        {
          label: "Developer Guides",
          autogenerate: { directory: "developer-guides" },
        },
      ],
    }),
  ],
});
```

Create `tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict"
}
```

- [ ] **Step 4: Define the frontmatter schema**

Create `src/content.config.ts`:

```ts
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

const status = z.enum(["draft", "active", "deprecated"]);

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        capability: z.string().min(1).optional(),
        services: z.array(z.string().min(1)).optional(),
        integrations: z.array(z.string().min(1)).optional(),
        aliases: z.array(z.string().min(1)).optional(),
        errorCodes: z.array(z.string().min(1)).optional(),
        status: status.default("active"),
        documentType: z.enum(["flow", "shared-rule", "system-context", "developer-guide"]).optional(),
      }),
    }),
  }),
};
```

- [ ] **Step 5: Render metadata through the page-title seam**

Create `src/components/FlowPageTitle.astro` with:

```astro
---
const { entry } = Astro.locals.starlightRoute;
const {
  title,
  capability,
  services = [],
  integrations = [],
  aliases = [],
  errorCodes = [],
  status = "active",
} = entry.data;
---

<h1 id="_top">{title}</h1>

{
  capability && (
    <div class="flow-metadata" aria-label="Flow metadata">
      <span class="metadata-label">Capability</span>
      <span data-pagefind-filter="capability" data-pagefind-meta="capability">
        {capability}
      </span>
      {services.map((service) => (
        <span data-pagefind-filter="service" data-pagefind-meta="service">
          {service}
        </span>
      ))}
      {integrations.map((integration) => <span>{integration}</span>)}
      <span class={`status status-${status}`}>{status}</span>
    </div>
  )
}

{
  aliases.length > 0 && (
    <p class="search-aliases">
      <strong>คำค้น:</strong> {aliases.join(", ")}
    </p>
  )
}

{
  errorCodes.length > 0 && (
    <p class="search-error-codes">
      <strong>Error codes:</strong> {errorCodes.join(", ")}
    </p>
  )
}
```

Style `.flow-metadata`, metadata spans, status variants, and alias/error-code lines in `src/styles/custom.css`. Do not hide aliases with `display: none`; visible terminology helps developers understand why a page matched.

- [ ] **Step 6: Add the entry page and reading guide**

Create `src/content/docs/index.md` with four cards or heading lists:

- Trading
- Fund Movement
- Asset Management
- Payment and Offering

Explain that readers start from a flow, not a service.

Create `src/content/docs/developer-guides/reading-business-flows.md` explaining:

- Search by Thai/English flow term, service, integration, or error code.
- `Owner service` labels identify responsibility.
- Shared rules are canonical references.
- Implementation plans are intentionally outside this site.

Both pages require `title`, `description`, `status`, `lastUpdated`, and `documentType`.

Create the initial `src/content/docs/business-flows/trading/index.md`:

```yaml
---
title: Trading
description: จุดเริ่มต้นสำหรับ Flow การซื้อขายและการจัดการความเสี่ยง
capability: Trading
services: [order-service]
aliases: [trading, trade, ซื้อขาย]
status: active
lastUpdated: 2026-07-27
documentType: flow
---
```

Its body states that Swap Market, Swap Limit, Big Lot, Routing, and Hedging are
added as end-to-end flows in the Trading migration.

- [ ] **Step 7: Run the shell tests and build**

Run:

```bash
npm test
npm run docs:build
```

Expected: tests PASS; Astro build succeeds; `dist/index.html` and `dist/pagefind/pagefind.js` exist.

- [ ] **Step 8: Commit the shell**

```bash
git add astro.config.mjs tsconfig.json src/content.config.ts src/components/FlowPageTitle.astro src/styles/custom.css src/content/docs/index.md src/content/docs/developer-guides/reading-business-flows.md tests/site-shell.test.mjs
git commit -m "feat: add local searchable documentation shell"
```

---

### Task 3: Shared Rules and System Context

**Files:**
- Create: `src/content/docs/shared-rules/glossary.md`
- Create: `src/content/docs/shared-rules/error-codes.md`
- Create: `src/content/docs/shared-rules/permissions.md`
- Create: `src/content/docs/shared-rules/security.md`
- Create: `src/content/docs/system-context/service-map.md`
- Create: `src/content/docs/system-context/integrations.md`
- Create: `src/content/docs/system-context/infrastructure/system-constraints.md`
- Create: `src/content/docs/system-context/infrastructure/kong-ingress.md`
- Create: `src/content/docs/system-context/infrastructure/kong-rate-limit.md`
- Create: `src/content/docs/system-context/infrastructure/kong-debugging.md`
- Create: `src/content/docs/system-context/infrastructure/migration.md`
- Copy: `Assets/RateLimit.png` → `public/assets/RateLimit.png`

**Interfaces:**
- Consumes: current shared and architecture Markdown documents.
- Produces: stable canonical links under `/shared-rules/` and `/system-context/`.

- [ ] **Step 1: Migrate shared rules**

Use these exact mappings:

```text
02-Business-Logic/Shared/Glossary.md          → shared-rules/glossary.md
02-Business-Logic/Shared/Error-Codes.md       → shared-rules/error-codes.md
02-Business-Logic/Shared/Permission-Rules.md  → shared-rules/permissions.md
02-Business-Logic/Shared/Security-Rules.md    → shared-rules/security.md
```

For each target:

- Preserve the current business content.
- Convert `last-updated` to `lastUpdated`.
- Add a concise `description`.
- Set `documentType: shared-rule`.
- Replace machine-specific file URLs with inline code paths.
- Update links to target the new canonical locations.

- [ ] **Step 2: Migrate architecture and integration context**

Use these mappings:

```text
01-Architecture/Integrations/Profiles.md                    → system-context/integrations.md
01-Architecture/Infrastructure/System-Constraints.md        → system-context/infrastructure/system-constraints.md
01-Architecture/Infrastructure/Kong/Ingress.md              → system-context/infrastructure/kong-ingress.md
01-Architecture/Infrastructure/Kong/Ratelimit.md            → system-context/infrastructure/kong-rate-limit.md
01-Architecture/Infrastructure/Kong/KongCommand.md          → system-context/infrastructure/kong-debugging.md
01-Architecture/Infrastructure/Move-Infrastructure.md       → system-context/infrastructure/migration.md
```

Create `system-context/service-map.md` summarizing these relationships without inventing new behavior:

```text
order-service   → order validation, trading orchestration, withdrawal, internal transfer
asset-service   → portfolio balances and reports
asset-consumer  → ledger application, XD sync, master-data sync
payment-gateway → payment requests, bank adapters, inquiry, callbacks
```

Each system-context page uses `documentType: system-context`.

- [ ] **Step 3: Copy the rate-limit asset and fix its reference**

Copy `Assets/RateLimit.png` to `public/assets/RateLimit.png` and reference it as:

```markdown
![Rate-limit flow](/assets/RateLimit.png)
```

- [ ] **Step 4: Validate and build**

Run:

```bash
npm test
npm run docs:build
```

Expected: validator tests PASS; no unresolved links; static build succeeds.

- [ ] **Step 5: Commit shared context**

```bash
git add src/content/docs/shared-rules src/content/docs/system-context public/assets/RateLimit.png
git commit -m "docs: migrate shared rules and system context"
```

---

### Task 4: Trading End-to-End Flows

**Files:**
- Modify: `src/content/docs/business-flows/trading/index.md`
- Create: `src/content/docs/business-flows/trading/swap-market-order.md`
- Create: `src/content/docs/business-flows/trading/swap-limit-order.md`
- Create: `src/content/docs/business-flows/trading/big-lot.md`
- Create: `src/content/docs/business-flows/trading/routing.md`
- Create: `src/content/docs/business-flows/trading/hedging.md`
- Create: `src/content/docs/shared-rules/trading-fees-and-campaigns.md`
- Create: `src/content/docs/shared-rules/order-state-machine.md`
- Create: `src/content/docs/shared-rules/ledger-and-money-flow.md`
- Copy: `Assets/FlowBiglot.png` → `public/assets/FlowBiglot.png`

**Interfaces:**
- Consumes: Order Service trading rules and shared ledger/state rules.
- Produces: complete Trading flow pages where every sequence section names its owner service.

- [ ] **Step 1: Create canonical shared Trading rules**

Map:

```text
Fee-Campaign-Rules.md → shared-rules/trading-fees-and-campaigns.md
State-Rules.md        → shared-rules/order-state-machine.md
Ledger-Rules.md       → shared-rules/ledger-and-money-flow.md
```

Preserve rules and add links back to the flow pages that consume them. Trading,
Fund Movement, and Asset Management pages summarize the relevant ledger effect
and link to `ledger-and-money-flow.md` instead of copying the full shared rule.

- [ ] **Step 2: Build Swap Market Order as one end-to-end flow**

Use `Swap-Rules.md`, `Routing-Rules.md`, `Ledger-Rules.md`, `State-Rules.md`, and `Hedge-Rules.md`.

Required metadata:

```yaml
title: Swap Market Order
description: Flow การซื้อขาย Swap แบบ Market ตั้งแต่รับคำสั่งจนปรับยอดสินทรัพย์และ Hedge
capability: Trading
services: [order-service, asset-service, asset-consumer]
integrations: [remarketer]
aliases: [swap, market order, ซื้อขายทันที, แลกสินทรัพย์]
status: active
lastUpdated: 2026-07-27
documentType: flow
```

Required sections:

- Purpose and scope
- Trigger and preconditions
- Participating services
- Validate request — owner `order-service`
- Select route and calculate fees — owner `order-service`
- Submit and execute order — owner `order-service`
- Record ledger — owner `order-service`
- Apply portfolio balance — owner `asset-consumer`
- Hedge exposure — owner `order-service`
- State transitions
- Error and recovery behavior
- Final outcomes
- Related shared rules

- [ ] **Step 3: Build Swap Limit Order as the pilot end-to-end flow**

Use `Swap-Limit-Order-Flow.md` as the sequence source, then merge the relevant rules from `Swap-Rules.md`, `Routing-Rules.md`, `Ledger-Rules.md`, `State-Rules.md`, and `Hedge-Rules.md`.

Required metadata:

```yaml
title: Swap Limit Order
description: Flow คำสั่ง Swap Limit ตั้งแต่สร้าง order, Remarketer webhook, ledger และ portfolio balance
capability: Trading
services: [order-service, order-consumer, asset-service, asset-consumer]
integrations: [remarketer]
aliases: [swap limit, limit order, ตั้งราคารอซื้อขาย, คำสั่งลิมิต]
status: active
lastUpdated: 2026-07-27
documentType: flow
```

Required sequence ownership:

```text
Create and validate order       → owner: order-service
Reserve source balance          → owner: order-service; executing service: order-consumer
Submit to Remarketer            → owner: order-service; executing service: order-consumer
Process Remarketer webhook      → owner: order-service
Write logical ledger            → owner: order-service
Apply ledger to portfolio       → owner: asset-consumer
Expose updated balance/report   → owner: asset-service
```

Include cancellation/webhook race behavior only when it describes current confirmed behavior. Do not copy uncommitted implementation-plan content from `03-Implementation/Active/swap-cancel-webhook-race-handling.md`.

The inclusion of `order-consumer` in searchable service metadata and the
owner/executor split above are evidence-based corrections from the confirmed
end-to-end source. `order-service` remains the business owner while
`order-consumer` executes the asynchronous reserve and Remarketer submission
steps.

- [ ] **Step 4: Migrate Big Lot, Routing, and Hedging**

Mappings:

```text
BigLot-Rules.md  → business-flows/trading/big-lot.md
Routing-Rules.md → business-flows/trading/routing.md
Hedge-Rules.md   → business-flows/trading/hedging.md
```

Although Routing is rule-heavy, frame it as the end-to-end route-selection flow: inputs, eligibility, scoring, selection, failure, and output. Frame Hedging as the post-trade exposure flow.

- [ ] **Step 5: Complete the Trading capability index**

List the five flows and explain when a developer should open each one. Link shared fees/campaigns and the order state machine below the flow list.

- [ ] **Step 6: Copy the Big Lot image and validate**

Copy the asset and use:

```markdown
![Big Lot flow](/assets/FlowBiglot.png)
```

Run:

```bash
npm test
npm run docs:build
rg -n "Swap Limit Order|คำสั่งลิมิต|order-service|remarketer" dist
```

Expected: tests/build PASS and all four search terms occur in generated content or Pagefind data.

- [ ] **Step 7: Commit Trading flows**

```bash
git add src/content/docs/business-flows/trading src/content/docs/shared-rules/trading-fees-and-campaigns.md src/content/docs/shared-rules/order-state-machine.md src/content/docs/shared-rules/ledger-and-money-flow.md public/assets/FlowBiglot.png
git commit -m "docs: organize trading knowledge by flow"
```

---

### Task 5: Fund Movement and Asset Management Flows

**Files:**
- Create: `src/content/docs/business-flows/fund-movement/index.md`
- Create: `src/content/docs/business-flows/fund-movement/fiat-withdrawal.md`
- Create: `src/content/docs/business-flows/fund-movement/crypto-deposit-and-withdrawal.md`
- Create: `src/content/docs/business-flows/fund-movement/internal-transfer.md`
- Create: `src/content/docs/business-flows/asset-management/index.md`
- Create: `src/content/docs/business-flows/asset-management/ledger-processing.md`
- Create: `src/content/docs/business-flows/asset-management/portfolio-and-reporting.md`
- Create: `src/content/docs/business-flows/asset-management/xd-sync.md`
- Create: `src/content/docs/business-flows/asset-management/master-data-sync.md`

**Interfaces:**
- Consumes: Order, Asset Service, and Asset Consumer rules.
- Produces: Fund Movement and Asset Management capability navigation plus complete flow pages.

- [ ] **Step 1: Migrate Fund Movement**

Mappings:

```text
Withdraw-Rules.md          → fund-movement/fiat-withdrawal.md
Fireblocks-Hook-Rules.md   → fund-movement/crypto-deposit-and-withdrawal.md
Internal-Transfer-Rules.md → fund-movement/internal-transfer.md
```

Required ownership labels:

```text
Request validation and orchestration → order-service
Portfolio balance/report reads       → asset-service
Ledger application/cost update       → asset-consumer
Fireblocks callback                   → order-service
```

Each page must include trigger, preconditions, service participation, end-to-end sequence, rules, states, errors/recovery, outcomes, and shared-rule links.

- [ ] **Step 2: Migrate Asset Management**

Mappings:

```text
Ledger-Processing-Rules.md  → asset-management/ledger-processing.md
Asset-Rules.md + Report-Rules.md → asset-management/portfolio-and-reporting.md
XD-Sync-Rules.md            → asset-management/xd-sync.md
Master-Data-Sync-Rules.md   → asset-management/master-data-sync.md
```

Do not duplicate ledger rules already described by a business flow. This capability explains how ledger events are consumed and materialized; Trading and Fund Movement pages link to it.

- [ ] **Step 3: Create both capability indexes**

Each index lists its flows, their trigger, and primary participating services in a compact table.

- [ ] **Step 4: Validate and build**

Run:

```bash
npm test
npm run docs:build
rg -n "ถอนเงิน|internal transfer|asset-consumer|XD" dist
```

Expected: tests/build PASS; each representative term occurs in output.

- [ ] **Step 5: Commit Fund Movement and Asset Management**

```bash
git add src/content/docs/business-flows/fund-movement src/content/docs/business-flows/asset-management
git commit -m "docs: add fund movement and asset flows"
```

---

### Task 6: Payment and Offering Flows

**Files:**
- Create: `src/content/docs/business-flows/payment/index.md`
- Create: `src/content/docs/business-flows/payment/payment-request-and-transfer.md`
- Create: `src/content/docs/business-flows/payment/payment-inquiry-and-callback.md`
- Create: `src/content/docs/business-flows/offering/index.md`
- Create: `src/content/docs/business-flows/offering/subscription-and-eligibility.md`

**Interfaces:**
- Consumes: Payment Gateway and Order Offering rules.
- Produces: end-to-end payment and offering flows with adapter ownership identified inside each sequence.

- [ ] **Step 1: Merge the payment request and transfer flow**

Use:

```text
Payment-End-to-End-Flow.md
Payment-Request-Rules.md
SCB-Adaptor-Worker-Rules.md
```

Sequence:

```text
Validate payment request       → payment-gateway core
Publish initial SCB event      → payment-gateway core
Consume and call bank transfer → SCB adapter worker
Publish transaction result     → SCB adapter worker
```

Metadata aliases include `payment`, `bank transfer`, `ชำระเงิน`, `โอนธนาคาร`, and `IMBANK`.

- [ ] **Step 2: Merge payment inquiry and callback**

Use:

```text
Payment-End-to-End-Flow.md
Payment-Inquiry-Worker-Rules.md
```

Sequence:

```text
Consume request/transaction events → payment inquiry worker
Build inquiry summary              → payment inquiry worker
Invoke callback                    → payment inquiry worker
```

- [ ] **Step 3: Merge subscription and eligibility**

Use:

```text
Order-Offering-Rules.md
ICO-Subscription-Rules.md
```

Create one flow from eligibility/preconditions through validation, subscription, state, errors, and final allocation outcome. Use `order-service` as the owner where confirmed by the source documents.

- [ ] **Step 4: Create Payment and Offering indexes**

List flows and participating services. Do not create separate navigation folders for SCB or individual workers.

- [ ] **Step 5: Validate, build, and commit**

Run:

```bash
npm test
npm run docs:build
rg -n "IMBANK|payment inquiry|subscription|eligibility" dist
```

Expected: tests/build PASS and each search term occurs.

Commit:

```bash
git add src/content/docs/business-flows/payment src/content/docs/business-flows/offering
git commit -m "docs: add payment and offering flows"
```

---

### Task 7: Maintainer Guide, Entry Point, and Legacy Interface Retirement

**Files:**
- Create: `src/content/docs/developer-guides/maintaining-docs.md`
- Create: `src/content/docs/developer-guides/logging-and-quality.md`
- Create: `src/content/docs/developer-guides/order-service-standards.md`
- Modify: `src/content/docs/index.md`
- Modify: `README.md`
- Modify: `00-Home.md`
- Create: `tools/lib/content-parity.mjs`
- Create: `tools/content-parity.mjs`
- Create: `tests/content-parity.test.mjs`
- Delete: `tools/build-docs-site.mjs`
- Delete: `tools/check-docs-site.mjs`
- Delete: `tools/serve-docs-site.mjs`
- Delete: `tools/normalize-markdown.mjs`

**Interfaces:**
- Consumes: fully migrated content tree and validator.
- Produces: one documented local command interface and no active custom renderer.

- [ ] **Step 1: Write the maintainer guide**

`maintaining-docs.md` must define:

- Where new flows, shared rules, context, and guides belong.
- Required frontmatter.
- Required flow sections.
- `Owner service` labeling.
- Thai/English alias guidance.
- The four npm commands.
- The rule that implementation plans and AI documents stay outside `src/content/docs/`.

- [ ] **Step 2: Migrate the current logging guide**

Migrate the current behavior-oriented parts of `05-Guides/Logging-and-Sonar-Best-Practices.md` into `developer-guides/logging-and-quality.md`.

- Replace every machine-specific `file:///Users/...` link with an inline repository-relative code path.
- Exclude historical refactoring milestones and unimplemented rollout plans.
- Set `documentType: developer-guide`.

Do not migrate:

- `AI-Development-Workflow.md`
- `AI-Implementation-Prompt.md`
- `AI-Investigation-Prompt.md`
- `AI-Maintenance-Prompt.md`
- `Required-Skills.md`
- `order-portfolio-hold-discrepancy.md`
- `Flutter-Deployment.md`

These files remain untouched outside the published tree.

- [ ] **Step 3: Preserve the Order Service development standards**

Migrate the human-facing rules from
`02-Business-Logic/Order-Service/AGENTS.md` into
`developer-guides/order-service-standards.md`:

- Handler, Service, and Repository responsibilities
- Go naming and error-wrapping conventions
- Context-aware logging rules
- Table-driven test guidance
- Linter, test, and Swagger verification commands

Set `documentType: developer-guide`. Do not retain the special `AGENTS.md`
filename in the published tree.

- [ ] **Step 4: Finalize the home page**

Update `src/content/docs/index.md` to link every capability and include examples:

```text
ค้น "ถอนเงิน" → Fund Movement / Fiat Withdrawal
ค้น "remarketer" → Trading / Swap Market Order and Swap Limit Order
ค้น "IMBANK" → Payment / Payment Request and Transfer
```

- [ ] **Step 5: Replace the README command interface**

README must contain:

```bash
npm install
npm run docs:local
```

And a concise command table for `docs:dev`, `docs:check`, `docs:build`, and `docs:local`. State that `src/content/docs/` is the published source and `dist/` is generated.

- [ ] **Step 6: Turn the legacy home into a pointer**

Replace the navigational body of `00-Home.md` with a short legacy notice linking to `README.md` and stating:

```text
Run npm run docs:local and open the URL shown in the terminal.
```

Retain valid frontmatter so Obsidian users see a clear migration path.

- [ ] **Step 7: Write failing parity behavior tests**

Create `tests/content-parity.test.mjs` against this interface:

```js
import { checkContentParity } from "../tools/lib/content-parity.mjs";

const diagnostics = await checkContentParity({
  root,
  docsDir: path.join(root, "src/content/docs"),
  publicDir: path.join(root, "public"),
  mappings: [
    { source: "legacy/source.md", targets: ["shared-rules/target.md"] },
  ],
});
```

Cover three real failures using temporary directories:

- Missing mapped source returns `mapped source does not exist`.
- Missing mapped target returns `mapped target does not exist`.
- Target with invalid required metadata returns the validator diagnostic.

Run:

```bash
node --test tests/content-parity.test.mjs
```

Expected: FAIL because `tools/lib/content-parity.mjs` does not exist.

- [ ] **Step 8: Implement and run content parity**

Create `tools/lib/content-parity.mjs` exporting:

```js
export async function checkContentParity({
  root,
  docsDir,
  publicDir,
  mappings,
}) {
  // Return sorted diagnostics without printing or exiting.
}
```

It imports `validateDocs()`, checks each source and target with `fs.access`, and
includes validation diagnostics for mapped targets.

Create `tools/content-parity.mjs` as the CLI adapter with explicit
legacy-to-new mapping arrays from Tasks 3–7. It must fail if:

- A mapped target does not exist.
- A mapped source has no target.
- A target fails metadata validation.

Run:

```bash
node tools/content-parity.mjs
npm test
npm run docs:build
```

Expected: all commands PASS.

- [ ] **Step 9: Remove the custom renderer**

Delete the four old tool files only after Step 8 passes. Do not delete the ignored local `site/` directory as part of this task; it is generated user-local output and can be removed manually later.

- [ ] **Step 10: Commit the active-interface switch**

```bash
git add README.md 00-Home.md src/content/docs/developer-guides src/content/docs/index.md tools/lib/content-parity.mjs tools/content-parity.mjs tests/content-parity.test.mjs tools/build-docs-site.mjs tools/check-docs-site.mjs tools/serve-docs-site.mjs tools/normalize-markdown.mjs
git commit -m "docs: switch to the flow-first local interface"
```

---

### Task 8: End-to-End Local Verification

**Files:**
- Create: `tests/local-site.test.mjs`
- Modify: any migration file only when verification exposes a concrete defect.

**Interfaces:**
- Consumes: the complete local documentation interface.
- Produces: repeatable evidence that validation, build, Pagefind, and exclusions work.

- [ ] **Step 1: Write end-to-end artifact tests**

Create `tests/local-site.test.mjs` that assumes `npm run docs:build` has run and asserts:

```js
await access("dist/index.html");
await access("dist/pagefind/pagefind.js");

const generated = await collectTextFiles("dist");
assert.match(generated, /Swap Limit Order/);
assert.match(generated, /คำสั่งลิมิต/);
assert.match(generated, /order-service/);
assert.match(generated, /remarketer/i);
assert.match(generated, /IMBANK/);
assert.doesNotMatch(generated, /AI Prompt: Business Logic Implementation/);
assert.doesNotMatch(generated, /Logging and SonarQube Refactoring Plan/);
```

Also assert generated links contain no `file:///Users/`.

- [ ] **Step 2: Run the full automated suite**

Run:

```bash
npm run docs:check
npm run docs:build
npm test
node tools/content-parity.mjs
```

Expected: all commands exit `0`.

- [ ] **Step 3: Start the searchable local site**

Run:

```bash
npm run docs:local
```

Expected:

- Terminal shows a local URL.
- Home page loads.
- Business Flows, Shared Rules, System Context, and Developer Guides appear in navigation.
- Search opens and returns results.

- [ ] **Step 4: Perform manual search acceptance checks**

Verify these queries:

```text
swap
คำสั่งลิมิต
ถอนเงิน
order-service
remarketer
IMBANK
```

For each query, confirm the result links to the correct page or section and includes a useful excerpt.

- [ ] **Step 5: Verify no user changes were overwritten**

Run:

```bash
git diff -- .obsidian/workspace.json 03-Implementation/Active/swap-cancel-webhook-race-handling.md
```

Compare with the pre-implementation state and confirm these files contain only the user's original changes.

- [ ] **Step 6: Commit end-to-end verification**

```bash
git add tests/local-site.test.mjs
git commit -m "test: verify local flow documentation site"
```

- [ ] **Step 7: Final repository check**

Run:

```bash
git status --short
git log --oneline -10
```

Expected: only the user's pre-existing modifications remain unstaged; all implementation commits are present.

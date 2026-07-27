import assert from "node:assert/strict";
import {
  access,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse } from "parse5";
import { pagefindRanking } from "../src/pagefind-ranking.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "src/content/docs");
const fixtureDir = path.join(docsDir, "business-flows/trading");
const activeFixture = path.join(fixtureDir, "search-contract-fixture.md");
const draftFixture = path.join(fixtureDir, "draft-contract-fixture.md");
const deprecatedFixture = path.join(
  docsDir,
  "developer-guides/deprecated-contract-fixture.md",
);
const conflictFixture = path.join(
  docsDir,
  "developer-guides/conflicting-draft-contract-fixture.md",
);
const activeRoute = path.join(
  root,
  "dist/business-flows/trading/search-contract-fixture/index.html",
);
const draftRoute = path.join(
  root,
  "dist/business-flows/trading/draft-contract-fixture/index.html",
);
const deprecatedRoute = path.join(
  root,
  "dist/developer-guides/deprecated-contract-fixture/index.html",
);

let tradingHtml;
let contractHtml;
let swapLimitHtml;
let pagefind;
const originalFetch = globalThis.fetch;
const createdFixtures = new Set();

function runBuild() {
  return spawnSync("npm", ["run", "docs:build"], {
    cwd: root,
    encoding: "utf8",
  });
}

async function reserveFixture(file, contents) {
  const handle = await open(file, "wx");
  createdFixtures.add(file);
  try {
    await handle.writeFile(contents);
  } finally {
    await handle.close();
  }
}

async function removeFixture(file) {
  if (!createdFixtures.delete(file)) return;
  await rm(file);
}

async function removeAllFixtures() {
  await Promise.all([...createdFixtures].map(removeFixture));
}

function elements(node, predicate, matches = []) {
  if (node.tagName && predicate(node)) matches.push(node);
  for (const child of node.childNodes ?? []) elements(child, predicate, matches);
  return matches;
}

function attribute(node, name) {
  return node.attrs?.find((item) => item.name === name)?.value;
}

function textContent(node) {
  if (node.nodeName === "#text") return node.value;
  return (node.childNodes ?? []).map(textContent).join("");
}

function urlForFetchInput(input) {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  if (input instanceof Request) return new URL(input.url);
  throw new TypeError("unsupported fetch input");
}

function metadataValue(document, label) {
  const groups = elements(
    document,
    (node) => attribute(node, "class")?.split(" ").includes("metadata-group"),
  );
  const group = groups.find((candidate) => {
    const term = elements(candidate, (node) => node.tagName === "dt")[0];
    return term && textContent(term).trim() === label;
  });
  assert.ok(group, `missing metadata group: ${label}`);
  const description = elements(group, (node) => node.tagName === "dd")[0];
  assert.ok(description, `missing metadata value: ${label}`);
  return description;
}

async function searchUrls(query, options) {
  const response = await pagefind.search(query, {
    ranking: pagefindRanking,
    ...options,
  });
  return Promise.all(
    response.results.map(async (result) => (await result.data()).raw_url),
  );
}

before(async () => {
  await mkdir(fixtureDir, { recursive: true });
  try {
    await reserveFixture(
      activeFixture,
      `---
title: Search Contract Fixture
description: Fixture exercising searchable metadata
capability: Search Test
services: [contract-service]
integrations: [contract-integration]
aliases: [unique-english-alias, ค้นหาทดลองเฉพาะ]
errorCodes: [CONTRACT_ERROR]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

Search contract fixture body.
`,
    );
    await reserveFixture(
      draftFixture,
      `---
title: Draft Contract Fixture
description: Draft content must not be published or indexed
capability: Search Test
services: [contract-service]
aliases: [draft-secret-term, คำลับฉบับร่าง]
status: draft
lastUpdated: 2026-07-27
documentType: flow
---

Draft-only content.
`,
    );
    await reserveFixture(
      deprecatedFixture,
      `---
title: Deprecated Contract Fixture
description: Deprecated non-flow metadata fixture
status: deprecated
lastUpdated: 2026-07-27
documentType: developer-guide
---

Deprecated non-flow content.
`,
    );
  } catch (error) {
    await removeAllFixtures();
    throw error;
  }

  const build = runBuild();
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  [tradingHtml, contractHtml, swapLimitHtml] = await Promise.all([
    readFile(
      path.join(root, "dist/business-flows/trading/index.html"),
      "utf8",
    ),
    readFile(activeRoute, "utf8"),
    readFile(
      path.join(
        root,
        "dist/business-flows/trading/swap-limit-order/index.html",
      ),
      "utf8",
    ),
  ]);

  const pagefindBase = pathToFileURL(path.join(root, "dist/pagefind/")).href;
  globalThis.fetch = async (input, init) => {
    const url = urlForFetchInput(input);
    if (url.protocol === "file:") {
      return new Response(await readFile(url), { status: 200 });
    }
    return originalFetch(input, init);
  };
  pagefind = await import(
    `${pagefindBase}pagefind.js?site-shell=${Date.now()}`
  );
  await pagefind.options({ basePath: pagefindBase, language: "th" });
});

after(async () => {
  globalThis.fetch = originalFetch;
  await removeAllFixtures();
  const build = runBuild();
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
});

test("renders the Thai document shell and exact Trading metadata", () => {
  const document = parse(tradingHtml);
  const html = elements(document, (node) => node.tagName === "html")[0];
  assert.equal(attribute(html, "lang"), "th");

  const heading = elements(
    document,
    (node) => node.tagName === "h1" && attribute(node, "id") === "_top",
  );
  assert.equal(heading.length, 1);
  assert.equal(textContent(heading[0]).trim(), "Trading");

  assert.equal(textContent(metadataValue(document, "Capability")).trim(), "Trading");
  assert.equal(
    textContent(metadataValue(document, "Services")).trim(),
    "order-service",
  );
  assert.equal(textContent(metadataValue(document, "Status")).trim(), "active");
});

test("renders labeled searchable metadata including status without capability", async () => {
  const contractDocument = parse(contractHtml);
  assert.equal(
    textContent(metadataValue(contractDocument, "Capability")).trim(),
    "Search Test",
  );
  assert.equal(
    textContent(metadataValue(contractDocument, "Services")).trim(),
    "contract-service",
  );
  assert.equal(
    textContent(metadataValue(contractDocument, "Integrations")).trim(),
    "contract-integration",
  );
  assert.equal(
    textContent(metadataValue(contractDocument, "Error codes")).trim(),
    "CONTRACT_ERROR",
  );
  assert.equal(
    textContent(metadataValue(contractDocument, "Status")).trim(),
    "active",
  );

  const deprecatedGuide = parse(await readFile(deprecatedRoute, "utf8"));
  assert.equal(
    textContent(metadataValue(deprecatedGuide, "Status")).trim(),
    "deprecated",
  );
  assert.equal(
    elements(deprecatedGuide, (node) => node.tagName === "dt").some(
      (node) => textContent(node).trim() === "Capability",
    ),
    false,
  );
});

test("Pagefind searches Thai and English aliases and exposes metadata filters", async () => {
  assert.ok(
    (await searchUrls("unique-english-alias")).includes(
      "/business-flows/trading/search-contract-fixture/",
    ),
  );
  assert.ok(
    (await searchUrls("ค้นหาทดลองเฉพาะ")).includes(
      "/business-flows/trading/search-contract-fixture/",
    ),
  );

  const filters = await pagefind.filters();
  assert.ok(filters.capability["Search Test"] >= 1);
  assert.ok(filters.service["contract-service"] >= 1);
  assert.ok(filters.integration["contract-integration"] >= 1);
  assert.ok(filters.errorCode.CONTRACT_ERROR >= 1);
  assert.ok(filters.status.active >= 1);
  assert.ok(filters.status.deprecated >= 1);

  assert.deepEqual(
    await searchUrls(null, {
      filters: {
        capability: "Search Test",
        service: "contract-service",
        integration: "contract-integration",
        errorCode: "CONTRACT_ERROR",
        status: "active",
      },
    }),
    ["/business-flows/trading/search-contract-fixture/"],
  );
});

test("Pagefind ranks the exact Thai Swap Limit alias first and filters its executor", async () => {
  const swapLimitRoute = "/business-flows/trading/swap-limit-order/";
  assert.equal((await searchUrls("คำสั่งลิมิต"))[0], swapLimitRoute);

  const filters = await pagefind.filters();
  assert.ok(filters.service["order-consumer"] >= 1);
  assert.ok(
    (
      await searchUrls(null, {
        filters: { service: "order-consumer" },
      })
    ).includes(swapLimitRoute),
  );

  const document = parse(swapLimitHtml);
  const heading = elements(
    document,
    (node) => node.tagName === "h1" && attribute(node, "id") === "_top",
  )[0];
  assert.equal(attribute(heading, "data-pagefind-weight"), "10");
  assert.equal(
    attribute(metadataValue(document, "คำค้น"), "data-pagefind-weight"),
    "10",
  );
  assert.equal(
    attribute(metadataValue(document, "คำค้น"), "data-pagefind-meta"),
    "alias",
  );
});

test("Pagefind default search ranks the exact Thai Swap Limit phrase first", async () => {
  const response = await pagefind.search("คำสั่งลิมิต");
  const urls = await Promise.all(
    response.results.map(async (result) => (await result.data()).raw_url),
  );

  assert.equal(urls[0], "/business-flows/trading/swap-limit-order/");
});

test("Pagefind ranks the browser-segmented Thai Swap Limit query first", async () => {
  const response = await pagefind.search("คำ สั่ง ลิ มิต", {
    ranking: pagefindRanking,
  });
  const first = await response.results[0].data();
  assert.equal(first.raw_url, "/business-flows/trading/swap-limit-order/");
  assert.match(first.plain_excerpt, /คำสั่งลิมิต \(Swap Limit Order\)/);
});

test("Swap Limit visible body includes the exact Thai search phrase", () => {
  const document = parse(swapLimitHtml);
  const body = elements(
    document,
    (node) =>
      node.tagName === "div" &&
      attribute(node, "class")?.split(" ").includes("sl-markdown-content"),
  )[0];
  assert.ok(body, "missing Swap Limit document body");

  assert.match(textContent(body), /คำสั่งลิมิต \(Swap Limit Order\)/);
});

test("renders weighted segmented Thai aliases for search without changing visible aliases", () => {
  const document = parse(swapLimitHtml);
  const body = elements(
    document,
    (node) =>
      node.tagName === "div" &&
      attribute(node, "class")?.split(" ").includes("sl-markdown-content"),
  )[0];
  assert.ok(body, "missing Swap Limit document body");
  const variants = elements(
    body,
    (node) =>
      attribute(node, "class")
        ?.split(" ")
        .includes("search-alias-variants"),
  );

  assert.equal(variants.length, 1);
  assert.equal(attribute(variants[0], "aria-hidden"), "true");
  assert.equal(attribute(variants[0], "data-pagefind-weight"), "10");
  assert.equal(attribute(variants[0], "data-pagefind-ignore"), undefined);
  assert.equal(textContent(variants[0]).trim(), "คำ สั่ง ลิ มิต");
  assert.doesNotMatch(textContent(variants[0]), /swap limit|limit order/);
  assert.equal(
    textContent(metadataValue(document, "คำค้น")).trim(),
    "swap limit, limit order, ตั้งราคารอซื้อขาย, คำสั่งลิมิต",
  );
});

test("Pagefind filters cross-service ownership for fund and asset flows", async () => {
  const fiatWithdrawalRoute =
    "/business-flows/fund-movement/fiat-withdrawal/";
  const portfolioReportingRoute =
    "/business-flows/asset-management/portfolio-and-reporting/";

  assert.ok(
    (
      await searchUrls(null, {
        filters: { service: "payment-gateway" },
      })
    ).includes(fiatWithdrawalRoute),
  );
  for (const service of ["customer-service", "report-service"]) {
    assert.ok(
      (
        await searchUrls(null, {
          filters: { service },
        })
      ).includes(portfolioReportingRoute),
    );
  }
});

test("Pagefind finds Payment and Offering flows by ownership, integration, and aliases", async () => {
  const paymentIndexRoute = "/business-flows/payment/";
  const paymentRequestRoute =
    "/business-flows/payment/payment-request-and-transfer/";
  const paymentInquiryRoute =
    "/business-flows/payment/payment-inquiry-and-callback/";
  const offeringRoute =
    "/business-flows/offering/subscription-and-eligibility/";

  const filters = await pagefind.filters();
  assert.ok(filters.service["payment-inquiry-service"] >= 1);
  assert.ok(filters.service["payment-adaptor-service-scb"] >= 1);
  assert.ok(filters.service["payment-gateway"] >= 3);
  assert.ok(filters.integration.kafka >= 3);

  assert.ok(
    (
      await searchUrls(null, {
        filters: { service: "payment-inquiry-service" },
      })
    ).includes(paymentInquiryRoute),
  );
  assert.ok(
    (
      await searchUrls(null, {
        filters: { service: "payment-adaptor-service-scb" },
      })
    ).includes(paymentRequestRoute),
  );

  const umbrellaRoutes = await searchUrls(null, {
    filters: { service: "payment-gateway" },
  });
  for (const route of [
    paymentIndexRoute,
    paymentRequestRoute,
    paymentInquiryRoute,
  ]) {
    assert.ok(umbrellaRoutes.includes(route));
  }

  const kafkaRoutes = await searchUrls(null, {
    filters: { integration: "kafka" },
  });
  for (const route of [
    paymentIndexRoute,
    paymentRequestRoute,
    paymentInquiryRoute,
  ]) {
    assert.ok(kafkaRoutes.includes(route));
  }

  for (const alias of ["IMBANK", "ชำระเงิน"]) {
    assert.ok((await searchUrls(alias)).includes(paymentRequestRoute));
  }
  assert.ok((await searchUrls("payment inquiry")).includes(paymentInquiryRoute));
  for (const alias of ["subscription", "eligibility"]) {
    assert.ok((await searchUrls(alias)).includes(offeringRoute));
  }
});

test("the Pagefind file fetch adapter accepts string, URL, and Request inputs", async () => {
  const pagefindUrl = pathToFileURL(
    path.join(root, "dist/pagefind/pagefind.js"),
  );
  const responses = await Promise.all([
    globalThis.fetch(pagefindUrl.href),
    globalThis.fetch(pagefindUrl),
    globalThis.fetch(new Request(pagefindUrl)),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200, 200],
  );
});

test("draft status omits the route and Pagefind entry", async () => {
  await assert.rejects(access(draftRoute), { code: "ENOENT" });
  assert.equal(
    (await searchUrls("draft-secret-term")).includes(
      "/business-flows/trading/draft-contract-fixture/",
    ),
    false,
  );
  assert.equal(
    (await searchUrls("คำลับฉบับร่าง")).includes(
      "/business-flows/trading/draft-contract-fixture/",
    ),
    false,
  );
});

test("rejects explicit Starlight draft metadata that conflicts with status", async () => {
  await reserveFixture(
    conflictFixture,
    `---
title: Conflicting Draft Contract Fixture
description: Conflicting draft metadata must fail validation
status: active
draft: true
lastUpdated: 2026-07-27
documentType: developer-guide
---

Conflicting draft metadata.
`,
  );

  try {
    const build = runBuild();
    assert.notEqual(build.status, 0, "conflicting draft metadata built successfully");
    assert.match(
      `${build.stdout}\n${build.stderr}`,
      /draft must match status/,
    );
  } finally {
    await removeFixture(conflictFixture);
  }
});

test("the PageTitle override retains Starlight h1 styling", async () => {
  const assetNames = await readdir(path.join(root, "dist/_astro"));
  const stylesheets = await Promise.all(
    assetNames
      .filter((name) => name.endsWith(".css"))
      .map((name) => readFile(path.join(root, "dist/_astro", name), "utf8")),
  );
  const css = stylesheets.join("\n").replaceAll(/\s+/g, "");
  const h1Rules = [...css.matchAll(/h1:where\([^)]*\)\{([^}]*)\}/g)].map(
    (match) => match[1],
  );
  assert.ok(
    h1Rules.some(
      (rule) =>
        rule.includes("margin-top:1rem") &&
        rule.includes("font-size:var(--sl-text-h1)") &&
        rule.includes("line-height:var(--sl-line-height-headings)") &&
        rule.includes("font-weight:600") &&
        rule.includes("color:var(--sl-color-white)"),
    ),
    "missing Starlight PageTitle h1 declarations",
  );
});

import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateDocs } from "../tools/lib/content-rules.mjs";

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gus-content-rules-"));
  const docsDir = path.join(root, "docs");
  const publicDir = path.join(root, "public");
  await Promise.all([
    mkdir(docsDir, { recursive: true }),
    mkdir(publicDir, { recursive: true }),
  ]);

  return {
    root,
    docsDir,
    publicDir,
    async writeDoc(relativePath, contents) {
      const file = path.join(docsDir, relativePath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    },
    async writePublic(relativePath, contents = "") {
      const file = path.join(publicDir, relativePath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    },
    async writeRoot(relativePath, contents = "") {
      const file = path.join(root, relativePath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    },
  };
}

const commonMetadata = `---
title: Example
description: Example documentation
status: active
lastUpdated: 2026-07-27
---
`;

test("accepts a valid business flow", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "business-flows/trading/swap-limit-order.md",
    `---
title: Swap Limit Order
description: End-to-end limit-order swap flow
status: active
lastUpdated: 2026-07-27
capability: Trading
services:
  - order-service
  - asset-service
aliases:
  - swap
  - แลกเหรียญ
---

# Swap Limit Order
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, []);
});

test("requires common metadata", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "shared-rules/glossary.md",
    `---
title: Glossary
---
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "shared-rules/glossary.md",
      message: "missing required field: description",
    },
    {
      file: "shared-rules/glossary.md",
      message: "missing required field: lastUpdated",
    },
    {
      file: "shared-rules/glossary.md",
      message: "missing required field: status",
    },
  ]);
});

test("requires flow metadata", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "business-flows/trading/swap.md",
    `${commonMetadata}
# Swap
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "business-flows/trading/swap.md",
      message: "missing required business flow field: aliases",
    },
    {
      file: "business-flows/trading/swap.md",
      message: "missing required business flow field: capability",
    },
    {
      file: "business-flows/trading/swap.md",
      message: "missing required business flow field: services",
    },
  ]);
});

test("rejects duplicate titles after trimming and case folding", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeDoc(
      "shared-rules/first.md",
      commonMetadata.replace("title: Example", "title: ' Swap Flow '"),
    ),
    fixture.writeDoc(
      "shared-rules/second.md",
      commonMetadata.replace("title: Example", "title: swap flow"),
    ),
  ]);

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "shared-rules/first.md",
      message: 'duplicate title "swap flow"',
    },
    {
      file: "shared-rules/second.md",
      message: 'duplicate title "swap flow"',
    },
  ]);
});

test("normalizes Turkish-I-style titles and sorts files by code point", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeDoc(
      "z-I.md",
      commonMetadata
        .replace("title: Example", "title: I FLOW")
        .replace("description: Example documentation\n", ""),
    ),
    fixture.writeDoc(
      "ä-i.md",
      commonMetadata
        .replace("title: Example", "title: i flow")
        .replace("description: Example documentation\n", ""),
    ),
    fixture.writeDoc(
      "İ.md",
      commonMetadata
        .replace("title: Example", "title: İ FLOW")
        .replace("description: Example documentation\n", ""),
    ),
    fixture.writeDoc(
      "ı.md",
      commonMetadata
        .replace("title: Example", "title: Dotless")
        .replace("description: Example documentation\n", ""),
    ),
  ]);

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    { file: "z-I.md", message: 'duplicate title "i flow"' },
    { file: "z-I.md", message: "missing required field: description" },
    { file: "ä-i.md", message: 'duplicate title "i flow"' },
    { file: "ä-i.md", message: "missing required field: description" },
    { file: "İ.md", message: "missing required field: description" },
    { file: "ı.md", message: "missing required field: description" },
  ]);
});

test("rejects invalid common metadata shapes", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "shared-rules/invalid.md",
    `---
title:
  - Not a string
description: 42
status:
  - active
lastUpdated: 27/07/2026
---
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "shared-rules/invalid.md",
      message: "description must be a non-empty string",
    },
    {
      file: "shared-rules/invalid.md",
      message: "lastUpdated must be a valid YYYY-MM-DD date",
    },
    {
      file: "shared-rules/invalid.md",
      message: "status must be a non-empty string",
    },
    {
      file: "shared-rules/invalid.md",
      message: "title must be a non-empty string",
    },
  ]);
});

test("rejects invalid business flow metadata shapes", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "business-flows/trading/invalid.md",
    `---
title: Invalid flow
description: Invalid flow metadata
status: active
lastUpdated: 2026-07-27
capability:
  - Trading
services: order-service
aliases:
  - swap
  - " "
---
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "business-flows/trading/invalid.md",
      message: "aliases must be a non-empty array of non-empty strings",
    },
    {
      file: "business-flows/trading/invalid.md",
      message: "capability must be a non-empty string",
    },
    {
      file: "business-flows/trading/invalid.md",
      message: "services must be a non-empty array of non-empty strings",
    },
  ]);
});

test("rejects duplicate slugs", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeDoc(
      "foo.md",
      commonMetadata.replace("title: Example", "title: Foo"),
    ),
    fixture.writeDoc(
      "foo/index.md",
      commonMetadata.replace("title: Example", "title: Foo index"),
    ),
  ]);

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    { file: "foo.md", message: 'duplicate slug "foo"' },
    { file: "foo/index.md", message: 'duplicate slug "foo"' },
  ]);
});

test("rejects duplicate slugs for uppercase Markdown extensions", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeDoc(
      "foo.MD",
      commonMetadata.replace("title: Example", "title: Foo uppercase"),
    ),
    fixture.writeDoc(
      "foo/index.MDX",
      commonMetadata.replace("title: Example", "title: Foo index uppercase"),
    ),
  ]);

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    { file: "foo.MD", message: 'duplicate slug "foo"' },
    { file: "foo/index.MDX", message: 'duplicate slug "foo"' },
  ]);
});

test("rejects missing markdown targets and directory links", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeDoc(
      "developer-guides/example.md",
      `${commonMetadata}
[Missing](./missing.md)
[Directory](../shared-rules/)
`,
    ),
    fixture.writeDoc(
      "shared-rules/glossary.md",
      commonMetadata.replace("title: Example", "title: Glossary"),
    ),
  ]);

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "developer-guides/example.md",
      message: "local link target does not exist: ./missing.md",
    },
    {
      file: "developer-guides/example.md",
      message: "local link target must not be a directory: ../shared-rules/",
    },
  ]);
});

test("rejects missing assets and machine-specific file URLs", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "developer-guides/example.md",
    `${commonMetadata}
![Missing asset](/assets/missing.png)
[Source](file:///Users/example/code.go)
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "developer-guides/example.md",
      message: "local link target does not exist: /assets/missing.png",
    },
    {
      file: "developer-guides/example.md",
      message:
        "machine-specific file URL is not allowed: file:///Users/example/code.go",
    },
  ]);
});

test("rejects links that traverse outside their allowed roots", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeRoot("outside.md", "outside"),
    fixture.writeRoot("outside.png", "outside"),
    fixture.writeDoc(
      "developer-guides/example.md",
      `${commonMetadata}
[Relative escape](../../outside.md)
[Root escape](/../outside.md)
![Asset escape](/assets/../../outside.png)
`,
    ),
  ]);

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "developer-guides/example.md",
      message: "local link target escapes allowed root: ../../outside.md",
    },
    {
      file: "developer-guides/example.md",
      message: "local link target escapes allowed root: /../outside.md",
    },
    {
      file: "developer-guides/example.md",
      message:
        "local link target escapes allowed root: /assets/../../outside.png",
    },
  ]);
});

test("rejects existing symlink targets that resolve outside allowed roots", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeRoot("outside.md", "outside"),
    fixture.writeRoot("outside.png", "outside"),
  ]);
  const linkedDoc = path.join(fixture.docsDir, "developer-guides/external.md");
  const linkedAsset = path.join(fixture.publicDir, "assets/external.png");
  await Promise.all([
    mkdir(path.dirname(linkedDoc), { recursive: true }),
    mkdir(path.dirname(linkedAsset), { recursive: true }),
  ]);
  await Promise.all([
    symlink(path.join(fixture.root, "outside.md"), linkedDoc),
    symlink(path.join(fixture.root, "outside.png"), linkedAsset),
  ]);
  await fixture.writeDoc(
    "developer-guides/example.md",
    `${commonMetadata}
[Symlinked doc](./external.md)
![Symlinked asset](/assets/external.png)
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "developer-guides/example.md",
      message: "local link target escapes allowed root: ./external.md",
    },
    {
      file: "developer-guides/example.md",
      message: "local link target escapes allowed root: /assets/external.png",
    },
  ]);
});

test("finds file URLs in Markdown nodes but ignores code and frontmatter", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "developer-guides/example.md",
    `---
title: Example
description: "[Frontmatter example](file:///Users/ignored/frontmatter.md)"
status: active
lastUpdated: 2026-07-27
---

[Inline](file:///Users/example/inline.md)
[Reference][source]
<file:///Users/example/autolink.md>

[source]: file:///Users/example/reference.md

\`\`\`md
[Code](file:///Users/ignored/code.md)
[Code reference][ignored]
<file:///Users/ignored/autolink.md>
[ignored]: file:///Users/ignored/reference.md
\`\`\`
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "developer-guides/example.md",
      message:
        "machine-specific file URL is not allowed: file:///Users/example/autolink.md",
    },
    {
      file: "developer-guides/example.md",
      message:
        "machine-specific file URL is not allowed: file:///Users/example/inline.md",
    },
    {
      file: "developer-guides/example.md",
      message:
        "machine-specific file URL is not allowed: file:///Users/example/reference.md",
    },
  ]);
});

test("accepts existing Markdown and asset targets", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeDoc(
      "developer-guides/example.md",
      `${commonMetadata}
[Relative](../shared-rules/glossary.md)
[Root](/shared-rules/glossary.md)
![Asset](/assets/logo.png)
[Web](https://example.com)
[Mail](mailto:docs@example.com)
[Heading](#local-heading)
`,
    ),
    fixture.writeDoc(
      "shared-rules/glossary.md",
      commonMetadata.replace("title: Example", "title: Glossary"),
    ),
    fixture.writePublic("assets/logo.png", "logo"),
  ]);

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, []);
});

test("rejects invalid YAML without cascading metadata errors", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "shared-rules/invalid.md",
    `---
title: [broken
---
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "shared-rules/invalid.md",
      message: "invalid frontmatter",
    },
  ]);
});

test("rejects unsupported status values", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "shared-rules/archived.md",
    commonMetadata
      .replace("title: Example", "title: Archived")
      .replace("status: active", "status: archived"),
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "shared-rules/archived.md",
      message:
        'invalid status "archived"; expected draft, active, or deprecated',
    },
  ]);
});

test("sorts diagnostics by file and then message", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeDoc(
      "z-last.md",
      `---
title: Last
status: active
lastUpdated: 2026-07-27
---
`,
    ),
    fixture.writeDoc(
      "a-first.md",
      `---
description: First
status: archived
lastUpdated: 2026-07-27
---
`,
    ),
  ]);

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "a-first.md",
      message:
        'invalid status "archived"; expected draft, active, or deprecated',
    },
    {
      file: "a-first.md",
      message: "missing required field: title",
    },
    {
      file: "z-last.md",
      message: "missing required field: description",
    },
  ]);
});

test("rejects implementation plans in published docs", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc(
    "developer-guides/example.md",
    `---
title: Example
description: Example documentation
status: draft
lastUpdated: 2026-07-27
documentType: implementation-plan
---
`,
  );

  const diagnostics = await validateDocs(fixture);

  assert.deepEqual(diagnostics, [
    {
      file: "developer-guides/example.md",
      message:
        "implementation-plan documents are not allowed in published docs",
    },
  ]);
});

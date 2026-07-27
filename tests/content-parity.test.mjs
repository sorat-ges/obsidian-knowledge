import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkContentParity } from "../tools/lib/content-parity.mjs";

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gus-content-parity-"));
  const docsDir = path.join(root, "src/content/docs");
  const publicDir = path.join(root, "public");
  await Promise.all([
    mkdir(docsDir, { recursive: true }),
    mkdir(publicDir, { recursive: true }),
  ]);

  return {
    root,
    docsDir,
    publicDir,
    async writeRoot(relativePath, contents = "") {
      const file = path.join(root, relativePath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    },
    async writeDoc(relativePath, contents) {
      const file = path.join(docsDir, relativePath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    },
  };
}

const validMetadata = `---
title: Target
description: Migrated target
status: active
lastUpdated: 2026-07-27
documentType: shared-rule
---
`;

test("reports a mapped source that does not exist", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc("shared-rules/target.md", validMetadata);

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      {
        source: "legacy/missing.md",
        targets: ["shared-rules/target.md"],
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: "legacy/missing.md",
      message: "mapped source does not exist",
    },
  ]);
});

test("reports a mapped target that does not exist", async () => {
  const fixture = await createFixture();
  await fixture.writeRoot("legacy/source.md");

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      {
        source: "legacy/source.md",
        targets: ["shared-rules/missing.md"],
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: "shared-rules/missing.md",
      message: "mapped target does not exist",
    },
  ]);
});

test("reports a mapped source that has no target", async () => {
  const fixture = await createFixture();
  await fixture.writeRoot("legacy/source.md");

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      {
        source: "legacy/source.md",
        targets: [],
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: "legacy/source.md",
      message: "mapped source has no target",
    },
  ]);
});

test("returns validator metadata diagnostics for a mapped target", async () => {
  const fixture = await createFixture();
  await fixture.writeRoot("legacy/source.md");
  await fixture.writeDoc(
    "shared-rules/target.md",
    `---
title: Target
---
`,
  );

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      {
        source: "legacy/source.md",
        targets: ["shared-rules/target.md"],
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: "shared-rules/target.md",
      message: "missing required field: description",
    },
    {
      file: "shared-rules/target.md",
      message: "missing required field: lastUpdated",
    },
    {
      file: "shared-rules/target.md",
      message: "missing required field: status",
    },
  ]);
});

test("rejects empty, absolute, and traversing mapped source paths", async () => {
  const fixture = await createFixture();
  await fixture.writeDoc("shared-rules/target.md", validMetadata);

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      { source: "", targets: ["shared-rules/target.md"] },
      { source: ".", targets: ["shared-rules/target.md"] },
      {
        source: path.join(path.sep, "legacy", "source.md"),
        targets: ["shared-rules/target.md"],
      },
      {
        source: "../legacy/source.md",
        targets: ["shared-rules/target.md"],
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: ".",
      message: "mapped source must be a non-empty relative path",
    },
    {
      file: "../legacy/source.md",
      message: "mapped source escapes root",
    },
    {
      file: "/legacy/source.md",
      message: "mapped source must be a relative path",
    },
    {
      file: "<empty source>",
      message: "mapped source must be a non-empty relative path",
    },
  ]);
});

test("rejects empty, absolute, and traversing mapped target paths", async () => {
  const fixture = await createFixture();
  await fixture.writeRoot("legacy/source.md");

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      { source: "legacy/source.md", targets: [""] },
      { source: "legacy/source.md", targets: ["."] },
      {
        source: "legacy/source.md",
        targets: [path.join(path.sep, "shared-rules", "target.md")],
      },
      {
        source: "legacy/source.md",
        targets: ["../shared-rules/target.md"],
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: ".",
      message:
        "mapped target must be a non-empty relative Markdown file path",
    },
    {
      file: "../shared-rules/target.md",
      message: "mapped target escapes docs directory",
    },
    {
      file: "/shared-rules/target.md",
      message: "mapped target must be a relative Markdown file path",
    },
    {
      file: "<empty target>",
      message:
        "mapped target must be a non-empty relative Markdown file path",
    },
  ]);
});

test("rejects non-canonical and non-Markdown mapped targets", async () => {
  const fixture = await createFixture();
  await fixture.writeRoot("legacy/source.md");

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      { source: "legacy/source.md", targets: ["./shared-rules/target.md"] },
      {
        source: "legacy/source.md",
        targets: ["shared-rules/../target.md"],
      },
      { source: "legacy/source.md", targets: ["shared-rules/target.txt"] },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: "./shared-rules/target.md",
      message: "mapped target must be a canonical relative path",
    },
    {
      file: "shared-rules/../target.md",
      message: "mapped target must be a canonical relative path",
    },
    {
      file: "shared-rules/target.txt",
      message: "mapped target must be a .md or .mdx file",
    },
  ]);
});

test("rejects mapped source and target directories even when their names look like files", async () => {
  const fixture = await createFixture();
  await Promise.all([
    mkdir(path.join(fixture.root, "legacy/source.md"), { recursive: true }),
    mkdir(path.join(fixture.docsDir, "shared-rules/target.md"), {
      recursive: true,
    }),
  ]);

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      {
        source: "legacy/source.md",
        targets: ["shared-rules/target.md"],
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: "legacy/source.md",
      message: "mapped source must be a regular file",
    },
    {
      file: "shared-rules/target.md",
      message: "mapped target must be a regular file",
    },
  ]);
});

test("rejects mapped source and target symlinks that escape their allowed roots", async () => {
  const fixture = await createFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "gus-parity-outside-"));
  const outsideSource = path.join(outside, "source.md");
  const outsideTarget = path.join(outside, "target.md");
  await Promise.all([
    writeFile(outsideSource, "legacy"),
    writeFile(outsideTarget, validMetadata),
    mkdir(path.join(fixture.root, "legacy"), { recursive: true }),
    mkdir(path.join(fixture.docsDir, "shared-rules"), { recursive: true }),
  ]);
  await Promise.all([
    symlink(outsideSource, path.join(fixture.root, "legacy/source.md")),
    symlink(
      outsideTarget,
      path.join(fixture.docsDir, "shared-rules/target.md"),
    ),
  ]);

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      {
        source: "legacy/source.md",
        targets: ["shared-rules/target.md"],
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: "legacy/source.md",
      message: "mapped source escapes root",
    },
    {
      file: "shared-rules/target.md",
      message: "mapped target escapes docs directory",
    },
  ]);
});

test("accepts mapped symlinks to regular files within their allowed roots", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeRoot("legacy/real-source.md", "legacy"),
    fixture.writeDoc("shared-rules/real-target.md", validMetadata),
  ]);
  await Promise.all([
    symlink(
      "real-source.md",
      path.join(fixture.root, "legacy/source-link.md"),
    ),
    symlink(
      "real-target.md",
      path.join(fixture.docsDir, "shared-rules/target-link.md"),
    ),
  ]);

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      {
        source: "legacy/source-link.md",
        targets: ["shared-rules/target-link.md"],
      },
    ],
  });

  assert.deepEqual(diagnostics, []);
});

test("validates metadata through a mapped target symlink within docsDir", async () => {
  const fixture = await createFixture();
  await Promise.all([
    fixture.writeRoot("legacy/source.md", "legacy"),
    fixture.writeDoc(
      "shared-rules/real-target.md",
      `---
title: Target
---
`,
    ),
  ]);
  await symlink(
    "real-target.md",
    path.join(fixture.docsDir, "shared-rules/target-link.md"),
  );

  const diagnostics = await checkContentParity({
    ...fixture,
    mappings: [
      {
        source: "legacy/source.md",
        targets: ["shared-rules/target-link.md"],
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    {
      file: "shared-rules/real-target.md",
      message: "missing required field: description",
    },
    {
      file: "shared-rules/real-target.md",
      message: "missing required field: lastUpdated",
    },
    {
      file: "shared-rules/real-target.md",
      message: "missing required field: status",
    },
  ]);
});

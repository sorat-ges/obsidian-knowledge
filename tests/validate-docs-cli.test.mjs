import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runValidateDocsCli } from "../tools/validate-docs.mjs";

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gus-validate-cli-"));
  const docsDir = path.join(root, "docs");
  const publicDir = path.join(root, "public");
  await Promise.all([
    mkdir(docsDir, { recursive: true }),
    mkdir(publicDir, { recursive: true }),
  ]);
  return { docsDir, publicDir };
}

function outputSink() {
  let output = "";
  return {
    stream: {
      write(chunk) {
        output += chunk;
      },
    },
    value() {
      return output;
    },
  };
}

test("CLI returns zero and writes only a success message for valid docs", async () => {
  const fixture = await createFixture();
  await writeFile(
    path.join(fixture.docsDir, "index.md"),
    `---
title: Home
description: Developer entry point
status: active
lastUpdated: 2026-07-27
---
`,
  );
  const stdout = outputSink();
  const stderr = outputSink();

  const exitCode = await runValidateDocsCli({
    ...fixture,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout.value(), "Documentation validation passed.\n");
  assert.equal(stderr.value(), "");
});

test("CLI returns one and writes diagnostics only to stderr", async () => {
  const fixture = await createFixture();
  await writeFile(
    path.join(fixture.docsDir, "index.md"),
    `---
title: Home
---
`,
  );
  const stdout = outputSink();
  const stderr = outputSink();

  const exitCode = await runValidateDocsCli({
    ...fixture,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.value(), "");
  assert.equal(
    stderr.value(),
    [
      "index.md: missing required field: description",
      "index.md: missing required field: lastUpdated",
      "index.md: missing required field: status",
      "",
    ].join("\n"),
  );
});

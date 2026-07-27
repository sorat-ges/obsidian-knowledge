import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".xml",
]);

async function collectTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectTextFiles(target);
      if (!entry.isFile() || !textExtensions.has(path.extname(entry.name))) {
        return "";
      }
      return readFile(target, "utf8");
    }),
  );
  return contents.join("\n");
}

test("build emits the local site and Pagefind runtime", async () => {
  await access(path.join(distDir, "index.html"));
  await access(path.join(distDir, "pagefind/pagefind.js"));
});

test("built artifacts include representative business search content", async () => {
  const generated = await collectTextFiles(distDir);

  assert.match(generated, /Swap Limit Order/);
  assert.match(generated, /คำสั่งลิมิต/);
  assert.match(generated, /order-service/);
  assert.match(generated, /remarketer/i);
  assert.match(generated, /IMBANK/);
});

test("built artifacts exclude implementation plans and local file links", async () => {
  const generated = await collectTextFiles(distDir);

  assert.doesNotMatch(generated, /AI Prompt: Business Logic Implementation/);
  assert.doesNotMatch(generated, /Logging and SonarQube Refactoring Plan/);
  assert.doesNotMatch(generated, /file:\/\/\/Users\//);
});

test("npm test rebuilds documentation artifacts and runs test files serially", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts.test,
    "npm run docs:build && node --test --test-concurrency=1",
  );
});

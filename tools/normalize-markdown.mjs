import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const today = "2026-05-31";

const ignoredDirs = new Set([".git", ".gemini", ".obsidian", "site", ".docs-cache"]);

async function listMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function titleFromFilename(filePath) {
  const base = path.basename(filePath, ".md");
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function tagsFromPath(filePath) {
  const relative = path.relative(root, filePath);
  const parts = relative.split(path.sep).slice(0, -1);
  const tags = parts
    .filter((part) => !part.startsWith("."))
    .map((part) => part.toLowerCase().replace(/^\d+-/, "").replace(/[^a-z0-9]+/g, "-"))
    .filter(Boolean);

  return tags.length > 0 ? tags : ["docs"];
}

function hasFrontmatter(content) {
  return content.startsWith("---\n") && content.indexOf("\n---", 4) !== -1;
}

function normalize(content, filePath) {
  let next = content.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");

  if (!hasFrontmatter(next)) {
    const titleMatch = next.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].replace(/^[^\p{L}\p{N}]+/u, "").trim() : titleFromFilename(filePath);
    const tags = tagsFromPath(filePath).join(", ");

    next = [
      "---",
      `title: ${title}`,
      `tags: [${tags}]`,
      "status: active",
      `last-updated: ${today}`,
      "---",
      "",
      next.trimStart(),
    ].join("\n");
  }

  return `${next.trimEnd()}\n`;
}

const files = await listMarkdownFiles(root);
let changed = 0;

for (const file of files) {
  const current = await readFile(file, "utf8");
  const next = normalize(current, file);

  if (next !== current) {
    await writeFile(file, next, "utf8");
    changed += 1;
  }
}

console.log(`Normalized ${changed} of ${files.length} Markdown files.`);

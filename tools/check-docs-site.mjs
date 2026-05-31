import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "site");

async function listHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listHtmlFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }

  return files;
}

const htmlFiles = await listHtmlFiles(siteDir);
const missing = [];

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);

  for (const reference of references) {
    if (/^(https?:|mailto:|#)/.test(reference)) continue;

    const targetReference = reference.split("#")[0];
    if (!targetReference) continue;

    const targetPath = path.resolve(path.dirname(file), targetReference);
    if (!existsSync(targetPath)) {
      missing.push(`${path.relative(root, file)} -> ${reference}`);
    }
  }
}

if (missing.length > 0) {
  console.error(missing.join("\n"));
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML files: no broken local href/src refs.`);

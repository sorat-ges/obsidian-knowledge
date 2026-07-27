import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateDocs } from "./lib/content-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runValidateDocsCli({
  docsDir = path.join(root, "src/content/docs"),
  publicDir = path.join(root, "public"),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const diagnostics = await validateDocs({ docsDir, publicDir });

  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) {
      stderr.write(`${diagnostic.file}: ${diagnostic.message}\n`);
    }
    return 1;
  }

  stdout.write("Documentation validation passed.\n");
  return 0;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await runValidateDocsCli();
}

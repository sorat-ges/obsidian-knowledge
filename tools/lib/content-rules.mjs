import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse } from "yaml";

const ALLOWED_STATUSES = new Set(["draft", "active", "deprecated"]);

function compareCodePoints(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function slugForRelativePath(relativePath) {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/\.(md|mdx)$/i, "")
    .replace(/(^|\/)index$/, "")
    .replace(/^\/|\/$/g, "");
}

async function markdownFiles(root) {
  const files = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
        files.push(absolutePath);
      }
    }
  }

  await walk(root);
  return files.sort(compareCodePoints);
}

function splitDocument(source) {
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { body: source, frontmatter: null };
  }

  const closingDelimiter = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );
  if (closingDelimiter === -1) {
    throw new Error("frontmatter is missing a closing --- delimiter");
  }

  return {
    body: lines.slice(closingDelimiter + 1).join("\n"),
    frontmatter: lines.slice(1, closingDelimiter).join("\n"),
  };
}

function isMissing(value) {
  return value === undefined || value === null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isNonEmptyString(item))
  );
}

function isValidDate(value) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function linkTargets(source) {
  const targets = [];
  const tree = unified().use(remarkParse).parse(source);
  visit(tree, ["link", "image", "definition"], (node) => {
    targets.push(node.url);
  });
  return targets;
}

function localPathForTarget({ target, sourceFile, docsDir, publicDir }) {
  const withoutFragment = target.split("#", 1)[0].split("?", 1)[0];
  let decodedTarget;
  try {
    decodedTarget = decodeURIComponent(withoutFragment);
  } catch {
    decodedTarget = withoutFragment;
  }

  if (decodedTarget.startsWith("/assets/")) {
    return {
      allowedRoot: publicDir,
      decodedTarget,
      localPath: path.join(publicDir, decodedTarget.slice(1)),
    };
  }
  if (decodedTarget.startsWith("/")) {
    return {
      allowedRoot: docsDir,
      decodedTarget,
      localPath: path.join(docsDir, decodedTarget.slice(1)),
    };
  }
  return {
    allowedRoot: docsDir,
    decodedTarget,
    localPath: path.resolve(path.dirname(sourceFile), decodedTarget),
  };
}

function isWithinRoot(root, candidate) {
  const relativePath = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

async function diagnoseTarget({
  target,
  sourceFile,
  relativeFile,
  docsDir,
  publicDir,
  knownSlugs,
}) {
  if (/^file:/i.test(target)) {
    return {
      file: relativeFile,
      message: `machine-specific file URL is not allowed: ${target}`,
    };
  }
  if (/^(https?:|mailto:|#)/i.test(target) || target === "") {
    return null;
  }

  const { allowedRoot, decodedTarget, localPath } = localPathForTarget({
    target,
    sourceFile,
    docsDir,
    publicDir,
  });
  if (!isWithinRoot(allowedRoot, localPath)) {
    return {
      file: relativeFile,
      message: `local link target escapes allowed root: ${target}`,
    };
  }

  const isCanonicalDocsRoute =
    decodedTarget.startsWith("/") &&
    !decodedTarget.startsWith("/assets/") &&
    decodedTarget.endsWith("/");
  if (
    isCanonicalDocsRoute &&
    knownSlugs.has(decodedTarget.replace(/^\/|\/$/g, ""))
  ) {
    return null;
  }

  try {
    const targetStat = await stat(localPath);
    if (targetStat.isDirectory()) {
      return {
        file: relativeFile,
        message: `local link target must not be a directory: ${target}`,
      };
    }
    const [resolvedRoot, resolvedTarget] = await Promise.all([
      realpath(allowedRoot),
      realpath(localPath),
    ]);
    if (!isWithinRoot(resolvedRoot, resolvedTarget)) {
      return {
        file: relativeFile,
        message: `local link target escapes allowed root: ${target}`,
      };
    }
    if (
      path.resolve(allowedRoot) === path.resolve(docsDir) &&
      /\.(md|mdx)$/i.test(decodedTarget)
    ) {
      return {
        file: relativeFile,
        message: `published local Markdown link must use a canonical extensionless route: ${target}`,
      };
    }
    return null;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    file: relativeFile,
    message: `local link target does not exist: ${target}`,
  };
}

export async function validateDocs({ docsDir, publicDir }) {
  const diagnostics = [];
  const files = await markdownFiles(docsDir);
  const documents = [];

  for (const file of files) {
    const relativeFile = path.relative(docsDir, file).replace(/\\/g, "/");
    const source = await readFile(file, "utf8");
    let body = source;
    let metadata = {};
    let metadataIsValid = true;
    try {
      const document = splitDocument(source);
      body = document.body;
      metadata =
        document.frontmatter === null ? {} : (parse(document.frontmatter) ?? {});
    } catch {
      diagnostics.push({
        file: relativeFile,
        message: "invalid frontmatter",
      });
      metadataIsValid = false;
    }

    if (metadataIsValid) {
      for (const field of ["title", "description", "status", "lastUpdated"]) {
        if (isMissing(metadata[field])) {
          diagnostics.push({
            file: relativeFile,
            message: `missing required field: ${field}`,
          });
        }
      }

      for (const field of ["title", "description", "status"]) {
        if (!isMissing(metadata[field]) && !isNonEmptyString(metadata[field])) {
          diagnostics.push({
            file: relativeFile,
            message: `${field} must be a non-empty string`,
          });
        }
      }

      if (
        !isMissing(metadata.lastUpdated) &&
        !isValidDate(metadata.lastUpdated)
      ) {
        diagnostics.push({
          file: relativeFile,
          message: "lastUpdated must be a valid YYYY-MM-DD date",
        });
      }

      if (
        isNonEmptyString(metadata.status) &&
        !ALLOWED_STATUSES.has(metadata.status)
      ) {
        diagnostics.push({
          file: relativeFile,
          message: `invalid status "${metadata.status}"; expected draft, active, or deprecated`,
        });
      }

      if (relativeFile.startsWith("business-flows/")) {
        for (const field of ["capability", "services", "aliases"]) {
          if (isMissing(metadata[field])) {
            diagnostics.push({
              file: relativeFile,
              message: `missing required business flow field: ${field}`,
            });
          }
        }

        if (
          !isMissing(metadata.capability) &&
          !isNonEmptyString(metadata.capability)
        ) {
          diagnostics.push({
            file: relativeFile,
            message: "capability must be a non-empty string",
          });
        }
        for (const field of ["services", "aliases"]) {
          if (!isMissing(metadata[field]) && !isStringArray(metadata[field])) {
            diagnostics.push({
              file: relativeFile,
              message: `${field} must be a non-empty array of non-empty strings`,
            });
          }
        }
      }

      if (metadata.documentType === "implementation-plan") {
        diagnostics.push({
          file: relativeFile,
          message:
            "implementation-plan documents are not allowed in published docs",
        });
      }
    }

    documents.push({
      file,
      relativeFile,
      slug: slugForRelativePath(relativeFile),
      source: body,
      status: metadata.status,
      title: isNonEmptyString(metadata.title)
        ? metadata.title.trim().toLowerCase()
        : null,
    });
  }

  const documentsBySlug = new Map();
  for (const document of documents) {
    const matches = documentsBySlug.get(document.slug) ?? [];
    matches.push(document);
    documentsBySlug.set(document.slug, matches);
  }
  for (const [slug, matches] of documentsBySlug) {
    if (matches.length > 1) {
      for (const document of matches) {
        diagnostics.push({
          file: document.relativeFile,
          message: `duplicate slug "${slug}"`,
        });
      }
    }
  }

  const publishedSlugs = new Set(
    documents
      .filter((document) => document.status !== "draft")
      .map((document) => document.slug),
  );

  const documentsByTitle = new Map();
  for (const document of documents) {
    if (document.title === null) {
      continue;
    }
    const matches = documentsByTitle.get(document.title) ?? [];
    matches.push(document);
    documentsByTitle.set(document.title, matches);
  }
  for (const [title, matches] of documentsByTitle) {
    if (matches.length > 1) {
      for (const document of matches) {
        diagnostics.push({
          file: document.relativeFile,
          message: `duplicate title "${title}"`,
        });
      }
    }
  }

  for (const document of documents) {
    for (const target of linkTargets(document.source)) {
      const diagnostic = await diagnoseTarget({
        target,
        sourceFile: document.file,
        relativeFile: document.relativeFile,
        docsDir,
        publicDir,
        knownSlugs: publishedSlugs,
      });
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    }
  }

  return diagnostics.sort(
    (left, right) =>
      compareCodePoints(left.file, right.file) ||
      compareCodePoints(left.message, right.message),
  );
}

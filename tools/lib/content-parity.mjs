import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { validateDocs } from "./content-rules.mjs";

function compareCodePoints(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

async function inspectMappedFile({
  allowedRoot,
  candidate,
  file,
  escapeMessage,
  missingMessage,
  regularFileMessage,
}) {
  try {
    const [resolvedRoot, resolvedCandidate] = await Promise.all([
      realpath(allowedRoot),
      realpath(candidate),
    ]);
    if (!isWithinRoot(resolvedRoot, resolvedCandidate)) {
      return {
        diagnostic: {
          file,
          message: escapeMessage,
        },
      };
    }

    const candidateStat = await stat(resolvedCandidate);
    if (!candidateStat.isFile()) {
      return {
        diagnostic: {
          file,
          message: regularFileMessage,
        },
      };
    }
    return {
      diagnostic: null,
      resolvedCandidate,
      resolvedRoot,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        diagnostic: {
          file,
          message: missingMessage,
        },
      };
    }
    throw error;
  }
}

function normalizeRelativePath(file) {
  return file.replace(/\\/g, "/");
}

function isAbsolutePath(file) {
  return path.posix.isAbsolute(file) || /^[A-Za-z]:\//.test(file);
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

function sourcePathDiagnostic(source, root) {
  if (typeof source !== "string" || source.trim() === "" || source === ".") {
    return {
      file: source || "<empty source>",
      message: "mapped source must be a non-empty relative path",
    };
  }
  if (isAbsolutePath(source)) {
    return {
      file: source,
      message: "mapped source must be a relative path",
    };
  }
  if (!isWithinRoot(root, path.resolve(root, source))) {
    return {
      file: source,
      message: "mapped source escapes root",
    };
  }
  return null;
}

function targetPathDiagnostic(target, docsDir) {
  if (typeof target !== "string" || target.trim() === "" || target === ".") {
    return {
      file: target || "<empty target>",
      message: "mapped target must be a non-empty relative Markdown file path",
    };
  }
  if (isAbsolutePath(target)) {
    return {
      file: target,
      message: "mapped target must be a relative Markdown file path",
    };
  }
  if (!isWithinRoot(docsDir, path.resolve(docsDir, target))) {
    return {
      file: target,
      message: "mapped target escapes docs directory",
    };
  }
  if (path.posix.normalize(target) !== target || target.startsWith("./")) {
    return {
      file: target,
      message: "mapped target must be a canonical relative path",
    };
  }
  if (!/\.(md|mdx)$/i.test(target)) {
    return {
      file: target,
      message: "mapped target must be a .md or .mdx file",
    };
  }
  return null;
}

export async function checkContentParity({
  root,
  docsDir,
  publicDir,
  mappings,
}) {
  const diagnostics = [];
  const mappedTargets = new Set();

  for (const mapping of mappings) {
    const source =
      typeof mapping.source === "string"
        ? normalizeRelativePath(mapping.source)
        : mapping.source;
    const targets = mapping.targets ?? [];
    const sourceDiagnostic = sourcePathDiagnostic(source, root);

    if (sourceDiagnostic) {
      diagnostics.push(sourceDiagnostic);
    } else {
      const mappedSource = await inspectMappedFile({
        allowedRoot: root,
        candidate: path.join(root, source),
        file: source,
        escapeMessage: "mapped source escapes root",
        missingMessage: "mapped source does not exist",
        regularFileMessage: "mapped source must be a regular file",
      });
      if (mappedSource.diagnostic) {
        diagnostics.push(mappedSource.diagnostic);
      }
    }

    if (targets.length === 0) {
      diagnostics.push({
        file: source,
        message: "mapped source has no target",
      });
    }

    for (const mappedTarget of targets) {
      const target =
        typeof mappedTarget === "string"
          ? normalizeRelativePath(mappedTarget)
          : mappedTarget;
      const targetDiagnostic = targetPathDiagnostic(target, docsDir);
      if (targetDiagnostic) {
        diagnostics.push(targetDiagnostic);
        continue;
      }
      const inspectedTarget = await inspectMappedFile({
        allowedRoot: docsDir,
        candidate: path.join(docsDir, target),
        file: target,
        escapeMessage: "mapped target escapes docs directory",
        missingMessage: "mapped target does not exist",
        regularFileMessage: "mapped target must be a regular file",
      });
      if (inspectedTarget.diagnostic) {
        diagnostics.push(inspectedTarget.diagnostic);
      } else {
        mappedTargets.add(
          path
            .relative(
              inspectedTarget.resolvedRoot,
              inspectedTarget.resolvedCandidate,
            )
            .replace(/\\/g, "/"),
        );
      }
    }
  }

  const validationDiagnostics = await validateDocs({ docsDir, publicDir });
  diagnostics.push(
    ...validationDiagnostics.filter(({ file }) => mappedTargets.has(file)),
  );

  return diagnostics.sort(
    (left, right) =>
      compareCodePoints(left.file, right.file) ||
      compareCodePoints(left.message, right.message),
  );
}

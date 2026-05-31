import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "site");
const ignoredDirs = new Set([".git", ".gemini", ".obsidian", "site", ".docs-cache", "tools"]);
const assetExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) {
    return { data: {}, body: content };
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    return { data: {}, body: content };
  }

  const raw = content.slice(4, end).trim();
  const data = {};

  for (const line of raw.split("\n")) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) data[match[1].trim()] = match[2].trim();
  }

  return { data, body: content.slice(end + 5).trimStart() };
}

function mdLinkToHtml(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;

  if (href === "00-Home.md" || href === "./00-Home.md") {
    return href.startsWith("./") ? "./index.html" : "index.html";
  }

  if (href.endsWith(".md")) return `${href.slice(0, -3)}.html`;

  const [withoutHash, hash = ""] = href.split("#");
  if (withoutHash === "00-Home.md" || withoutHash === "./00-Home.md") {
    const indexHref = withoutHash.startsWith("./") ? "./index.html" : "index.html";
    return `${indexHref}${hash ? `#${hash}` : ""}`;
  }

  if (withoutHash.endsWith(".md")) {
    return `${withoutHash.slice(0, -3)}.html${hash ? `#${hash}` : ""}`;
  }

  return href;
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    return `<img src="${escapeHtml(mdLinkToHtml(src))}" alt="${escapeHtml(alt)}">`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    return `<a href="${escapeHtml(mdLinkToHtml(href))}">${text}</a>`;
  });
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return html;
}

function renderTable(lines) {
  const rows = lines
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));

  if (rows.length < 2) return null;
  const headers = rows[0];
  const body = rows.slice(2);

  return [
    "<table>",
    "<thead><tr>",
    ...headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`),
    "</tr></thead>",
    "<tbody>",
    ...body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`),
    "</tbody>",
    "</table>",
  ].join("");
}

function renderMarkdown(markdown) {
  const lines = markdown.split("\n");
  const html = [];
  const headings = [];
  let paragraph = [];
  let list = [];
  let code = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (list.length === 0) return;
    html.push("<ul>");
    for (const item of list) html.push(`<li>${inlineMarkdown(item)}</li>`);
    html.push("</ul>");
    list = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (code) {
      if (line.startsWith("```")) {
        html.push(`<pre><code class="language-${escapeHtml(code.lang)}">${escapeHtml(code.lines.join("\n"))}</code></pre>`);
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      code = { lang: line.slice(3).trim(), lines: [] };
      continue;
    }

    if (line.trim().startsWith("|") && lines[index + 1]?.includes("---")) {
      flushParagraph();
      flushList();
      const tableLines = [];
      while (lines[index]?.trim().startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html.push(renderTable(tableLines) ?? `<p>${inlineMarkdown(tableLines.join(" "))}</p>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    if (line.trim() === "---") {
      flushParagraph();
      flushList();
      html.push("<hr>");
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return { html: html.join("\n"), headings };
}

function pageTitle(file, frontmatter, markdown) {
  if (frontmatter.title) return frontmatter.title.replace(/^["']|["']$/g, "");
  const title = markdown.match(/^#\s+(.+)$/m);
  if (title) return title[1].replace(/^[^\p{L}\p{N}]+/u, "").trim();
  return path.basename(file, ".md").replace(/[-_]+/g, " ");
}

function htmlPathForMarkdown(file) {
  const relative = path.relative(root, file);
  if (relative === "00-Home.md") return "index.html";
  return relative.replace(/\.md$/, ".html");
}

function relativeHref(fromHtmlPath, toHtmlPath) {
  const fromDir = path.posix.dirname(fromHtmlPath);
  const relative = path.posix.relative(fromDir, toHtmlPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function rootPrefix(htmlPath) {
  const fromDir = path.posix.dirname(htmlPath);
  const relative = path.posix.relative(fromDir, ".");
  return relative === "" ? "." : relative;
}

function formatGroupName(segment) {
  return segment
    .replace(/^\d+-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function layout({ title, content, nav, toc, sourcePath, htmlPath }) {
  const prefix = rootPrefix(htmlPath);
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Gus Knowledge</title>
  <link rel="stylesheet" href="${prefix}/assets/styles.css">
</head>
<body>
  <aside class="sidebar">
    <a class="brand" href="${relativeHref(htmlPath, "index.html")}">Gus Knowledge</a>
    <label class="nav-search-label" for="nav-search">Search docs</label>
    <input id="nav-search" class="nav-search" type="search" placeholder="Filter files..." autocomplete="off">
    <nav>${nav}</nav>
  </aside>
  <main>
    <div class="doc-meta">Source: <code>${escapeHtml(sourcePath)}</code></div>
    ${content}
  </main>
  <aside class="toc">
    <div class="toc-title">On this page</div>
    ${toc}
  </aside>
  <script>
    const searchInput = document.querySelector("#nav-search");
    const navDetails = [...document.querySelectorAll(".nav-section, .nav-subsection")];
    const navLinks = [...document.querySelectorAll(".nav-link")];
    const initiallyOpen = new Set(navDetails.filter((item) => item.open).map((item) => item.dataset.navId));

    searchInput?.addEventListener("input", () => {
      const query = searchInput.value.trim().toLowerCase();

      for (const link of navLinks) {
        const match = !query || link.textContent.toLowerCase().includes(query);
        link.hidden = !match;
      }

      for (const details of navDetails.slice().reverse()) {
        const hasVisibleLink = [...details.querySelectorAll(".nav-link")].some((link) => !link.hidden);
        details.hidden = query ? !hasVisibleLink : false;
        details.open = query ? hasVisibleLink : initiallyOpen.has(details.dataset.navId);
      }
    });
  </script>
</body>
</html>`;
}

function buildNav(pages, currentHtmlPath) {
  const home = pages.filter((page) => page.relative === "00-Home.md" || page.relative === "README.md");
  const grouped = new Map();

  for (const page of pages) {
    if (home.includes(page)) continue;

    const parts = page.relative.split(path.sep);
    const group = parts.length > 1 ? parts[0] : "Other";
    if (!grouped.has(group)) grouped.set(group, new Map());

    const subgroup = parts.length > 2 ? parts[1] : "";
    const groupMap = grouped.get(group);
    if (!groupMap.has(subgroup)) groupMap.set(subgroup, []);
    groupMap.get(subgroup).push(page);
  }

  const lines = [];

  for (const page of home) {
    const active = page.htmlPath === currentHtmlPath ? " nav-active" : "";
    lines.push(`<a class="nav-link nav-home${active}" href="${relativeHref(currentHtmlPath, page.htmlPath)}">${escapeHtml(page.title)}</a>`);
  }

  for (const [group, subgroups] of grouped) {
    const groupPages = [...subgroups.values()].flat();
    const groupIsOpen = groupPages.some((page) => page.htmlPath === currentHtmlPath);
    lines.push(`<details class="nav-section" data-nav-id="${escapeHtml(group)}"${groupIsOpen ? " open" : ""}>`);
    lines.push(`<summary>${escapeHtml(formatGroupName(group))}</summary>`);

    for (const [subgroup, groupPages] of subgroups) {
      if (subgroup) {
        const subgroupId = `${group}/${subgroup}`;
        const subgroupIsOpen = groupPages.some((page) => page.htmlPath === currentHtmlPath);
        lines.push(`<details class="nav-subsection" data-nav-id="${escapeHtml(subgroupId)}"${subgroupIsOpen ? " open" : ""}>`);
        lines.push(`<summary>${escapeHtml(formatGroupName(subgroup))}</summary>`);
      }

      for (const page of groupPages) {
        const active = page.htmlPath === currentHtmlPath ? " nav-active" : "";
        lines.push(`<a class="nav-link${active}" href="${relativeHref(currentHtmlPath, page.htmlPath)}">${escapeHtml(page.title)}</a>`);
      }

      if (subgroup) {
        lines.push("</details>");
      }
    }

    lines.push("</details>");
  }

  return lines.join("\n");
}

function buildToc(headings) {
  const items = headings
    .filter((heading) => heading.level > 1 && heading.level <= 3)
    .map((heading) => `<a class="toc-level-${heading.level}" href="#${heading.id}">${escapeHtml(heading.text)}</a>`);

  return items.length > 0 ? items.join("\n") : "<span>No sections</span>";
}

async function copyAssets(files) {
  for (const file of files) {
    if (!assetExtensions.has(path.extname(file).toLowerCase())) continue;
    const relative = path.relative(root, file);
    const target = path.join(outDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(file, target);
  }
}

const files = await listFiles(root);
const markdownFiles = files.filter((file) => file.endsWith(".md")).sort();
const pages = [];

for (const file of markdownFiles) {
  const raw = await readFile(file, "utf8");
  const parsed = parseFrontmatter(raw);
  const title = pageTitle(file, parsed.data, parsed.body);
  const relative = path.relative(root, file);
  pages.push({
    file,
    relative,
    title,
    htmlPath: htmlPathForMarkdown(file),
    parsed,
  });
}

pages.sort((a, b) => {
  if (a.relative === "00-Home.md") return -1;
  if (b.relative === "00-Home.md") return 1;
  return a.relative.localeCompare(b.relative);
});

await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, "assets"), { recursive: true });
await writeFile(path.join(outDir, "assets", "styles.css"), `:root {
  --bg: #f8fafc;
  --panel: #ffffff;
  --text: #18212f;
  --muted: #667085;
  --line: #e4e7ec;
  --link: #2563eb;
  --code-bg: #eef2f7;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 300px;
  overflow: auto;
  padding: 24px 14px;
  background: var(--panel);
  border-right: 1px solid var(--line);
}
.brand {
  display: block;
  color: var(--text);
  font-weight: 750;
  font-size: 18px;
  margin: 0 10px 14px;
}
.nav-search-label {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  margin: 0 10px 6px;
}
.nav-search {
  width: calc(100% - 20px);
  margin: 0 10px 14px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text);
  background: #ffffff;
  font: inherit;
  font-size: 14px;
}
.nav-section,
.nav-subsection {
  margin: 4px 0;
}
.nav-section > summary,
.nav-subsection > summary {
  cursor: pointer;
  list-style: none;
  border-radius: 6px;
  color: var(--text);
  font-weight: 700;
  padding: 7px 10px;
}
.nav-section > summary {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: .04em;
  margin-top: 10px;
  text-transform: uppercase;
}
.nav-subsection > summary {
  font-size: 13px;
  margin-left: 10px;
}
.nav-section > summary::before,
.nav-subsection > summary::before {
  content: "›";
  display: inline-block;
  margin-right: 6px;
  transition: transform .15s ease;
}
.nav-section[open] > summary::before,
.nav-subsection[open] > summary::before {
  transform: rotate(90deg);
}
.nav-section > summary:hover,
.nav-subsection > summary:hover {
  background: #f1f5f9;
}
.nav-link {
  display: block;
  color: var(--text);
  border-radius: 6px;
  margin-left: 22px;
  padding: 6px 10px;
  font-size: 14px;
}
.nav-home {
  font-weight: 700;
  margin-left: 0;
}
.nav-active {
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 700;
}
.nav-link:hover { background: #f1f5f9; text-decoration: none; }
.nav-active:hover { background: #dbeafe; }
main {
  max-width: 920px;
  margin-left: 300px;
  padding: 48px 56px 80px;
}
.toc {
  position: fixed;
  inset: 0 0 0 auto;
  width: 250px;
  overflow: auto;
  padding: 32px 24px;
  color: var(--muted);
}
.toc-title {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.toc a, .toc span {
  display: block;
  color: var(--muted);
  font-size: 13px;
  padding: 4px 0;
}
.toc-level-3 { padding-left: 12px !important; }
.doc-meta {
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 24px;
}
h1, h2, h3, h4 { line-height: 1.25; margin: 1.8em 0 .6em; }
h1 { margin-top: 0; font-size: 38px; }
h2 { border-top: 1px solid var(--line); padding-top: 28px; font-size: 26px; }
h3 { font-size: 20px; }
p, ul, ol, table, pre { margin: 0 0 18px; }
ul { padding-left: 24px; }
table {
  width: 100%;
  border-collapse: collapse;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
th, td {
  border: 1px solid var(--line);
  padding: 10px 12px;
  vertical-align: top;
}
th { background: #f1f5f9; text-align: left; }
code {
  background: var(--code-bg);
  border-radius: 4px;
  padding: 2px 5px;
  font-size: .9em;
}
pre {
  overflow: auto;
  background: #111827;
  color: #f9fafb;
  border-radius: 8px;
  padding: 16px;
}
pre code {
  background: transparent;
  color: inherit;
  padding: 0;
}
img { max-width: 100%; height: auto; }
@media (max-width: 1180px) {
  .toc { display: none; }
  main { margin-right: 0; }
}
@media (max-width: 820px) {
  .sidebar {
    position: static;
    width: auto;
    max-height: 320px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  main {
    margin-left: 0;
    padding: 32px 20px 64px;
  }
  h1 { font-size: 30px; }
}
`, "utf8");

for (const page of pages) {
  const rendered = renderMarkdown(page.parsed.body);
  const html = layout({
    title: page.title,
    content: rendered.html,
    nav: buildNav(pages, page.htmlPath),
    toc: buildToc(rendered.headings),
    sourcePath: page.relative,
    htmlPath: page.htmlPath,
  });
  const target = path.join(outDir, page.htmlPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
}

await copyAssets(files);

console.log(`Built ${pages.length} pages in ${path.relative(root, outDir)}/`);

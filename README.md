---
title: Gus Knowledge README
tags: [readme, docs]
status: active
last-updated: 2026-05-31
---

# Gus Knowledge README

Gus Knowledge uses Markdown as the source of truth and generates HTML for easier human reading.

## Read The Knowledge Base

- Start in Markdown: [00-Home.md](./00-Home.md)
- Build the local HTML site: `node tools/build-docs-site.mjs`
- Check generated links: `node tools/check-docs-site.mjs`
- Open the generated site: `site/index.html`
- Use the generated sidebar search and collapsible groups to move across many files.

## Maintain Documents

- Keep one topic per file.
- Keep business rules in `02-Business-Logic/`.
- Keep implementation plans in `03-Implementation/`.
- Use frontmatter with `title`, `tags`, `status`, and `last-updated`.
- Run `node tools/normalize-markdown.mjs` before publishing docs.
- Run `node tools/build-docs-site.mjs` and `node tools/check-docs-site.mjs` before sharing the HTML site.

## Generated HTML

The `site/` directory is generated output and is ignored by Git. Rebuild it whenever Markdown changes.

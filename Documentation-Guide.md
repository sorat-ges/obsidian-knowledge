---
title: Documentation Guide
tags: [meta, guide]
status: active
---

# Documentation Guide

Best practices for maintaining this knowledge base.

## Quick Rules
1. ✅ **Use templates** - Start with `.obsidian/templates/`
2. ✅ **Add frontmatter** - Always include tags and status
3. ✅ **Link liberally** - Use `[[wikilinks]]` for cross-references
4. ✅ **Update dates** - Change `last-updated` when editing
5. ✅ **Be concise** - Scannable > comprehensive

## File Organization

### Folder Structure
```
/
├── .obsidian/templates/  # Reusable templates
├── Biglot/              # Project-specific docs
├── Flutter/             # Technology-specific docs
├── Kube/                # Infrastructure docs
├── Images/              # Diagrams and screenshots
└── Home.md              # Main index
```

### Naming Conventions
- **Files**: Use PascalCase or kebab-case: `BigLot.md` or `rate-limit.md`
- **Folders**: PascalCase for project names: `Biglot/`, `Flutter/`
- **Images**: Descriptive names: `FlowBiglot.png`, `RateLimit.png`

## Frontmatter

Always include at minimum:
```yaml
---
title: Human Readable Title
tags: [category, topic]
status: active|draft|outdated
created: YYYY-MM-DD
last-updated: YYYY-MM-DD
---
```

### Useful Tags
- **Type**: `api`, `guide`, `architecture`, `config`, `reference`
- **Topic**: `kubernetes`, `flutter`, `backend`, `deployment`
- **Status**: `active`, `draft`, `outdated`, `archived`

## Writing Style

### Headers
```markdown
# Main Title (H1) - Only one per doc
## Section (H2)
### Subsection (H3)
```

### Code Blocks
Always specify language:
````markdown
```yaml
key: value
```
````

### Links
- **Internal**: `[[Other-Doc]]` or `[[folder/file|Display Name]]`
- **External**: `[Link Text](https://example.com)`
- **Headers**: `[[Doc#Section]]`

### Images
Preferred: `![Description](../Images/filename.png)`  
Obsidian-style: `![[filename.png]]`

### Tables
Use for quick reference data:
```markdown
| Column 1 | Column 2 |
|----------|----------|
| Value    | Value    |
```

## Document Types

### 1. Architecture Docs
**Template**: `architecture-template.md`  
**Purpose**: System design, flow diagrams  
**Example**: [[Biglot/Biglot]]

**Must include**:
- Overview and context
- Component descriptions
- Flow diagram
- Design decisions

### 2. Guides/Tutorials
**Template**: `guide-template.md`  
**Purpose**: Step-by-step instructions  
**Example**: [[Flutter/Deployment]]

**Must include**:
- Prerequisites
- Numbered steps
- Code examples
- Verification steps

### 3. API Documentation
**Template**: `api-template.md`  
**Purpose**: API endpoints and usage

**Must include**:
- Endpoint list
- Request/response examples
- Authentication requirements
- Error codes

### 4. Configuration Reference
**Template**: `config-template.md`  
**Purpose**: Config parameters and examples  
**Example**: [[Kube/Kong/Ratelimit]]

**Must include**:
- Parameter table
- Full config example
- Common use cases

## Maintenance

### Regular Reviews
- **Monthly**: Check `status: draft` docs - complete or delete
- **Quarterly**: Review `status: active` - verify accuracy
- **Annually**: Archive outdated content

### Updating Existing Docs
1. Update content
2. Change `last-updated` date
3. Update `status` if needed
4. Add note at bottom if major changes

### Deprecation
Don't delete immediately:
1. Set `status: outdated`
2. Add deprecation notice at top
3. Link to replacement doc
4. Archive after 6 months

## Tips

✅ **DO**:
- Link to source code with line numbers: `src/main.py (45-60)`
- Include diagrams for complex flows
- Add "Related" sections for discoverability
- Use callouts for important notes

❌ **DON'T**:
- Write walls of text - break into sections
- Duplicate content - link instead
- Skip frontmatter
- Use absolute paths (use relative: `../Images/`)

## Example Callouts

> **Note**: Additional information

> **Warning**: Be careful here

> **Tip**: Pro tip for efficiency

## Questions?
Update this guide as you develop new patterns!

# Developer Knowledge Base

This is an Obsidian-based knowledge base for developer documentation.

## Quick Start

1. **Open in Obsidian**: Open this folder as a vault in Obsidian
2. **Start here**: Open `Home.md` for the main index
3. **Read the guide**: Check `Documentation-Guide.md` for best practices
4. **Use templates**: Find templates in `.obsidian/templates/`

## Structure

```
/
├── .obsidian/
│   └── templates/          # Document templates
├── Biglot/                 # Project: Big Lot
├── Flutter/                # Flutter development
├── Kube/                   # Kubernetes infrastructure
│   └── Kong/              # Kong API Gateway
├── Images/                 # Diagrams and screenshots
├── Home.md                # Main navigation page
├── Documentation-Guide.md # Best practices guide
└── README.md              # This file
```

## Creating New Docs

1. Use a template from `.obsidian/templates/`
2. Add frontmatter with tags and status
3. Link related documents
4. Update the `Home.md` index

## Obsidian Plugins Recommended

- **Templates**: For using the template files (Core plugin)
- **Dataview**: Query and filter docs by tags/metadata
- **Graph View**: Visualize connections (Core plugin)
- **Excalidraw**: Create diagrams
- **Git**: Version control integration

## Tips

- Use `[[wikilinks]]` to connect documents
- Tag documents by type: `#guide`, `#api`, `#architecture`, `#config`
- Keep diagrams in `Images/` folder
- Update `last-updated` date when editing
- Link back to `Home.md` for easy navigation

## Maintenance

- Review `status: draft` docs monthly
- Update outdated docs quarterly
- Keep the `Home.md` index current

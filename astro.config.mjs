import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { pagefindRanking } from "./src/pagefind-ranking.mjs";

export default defineConfig({
  site: "http://localhost:4321",
  integrations: [
    starlight({
      title: "Gus Knowledge",
      description: "End-to-end business flows for developers",
      locales: {
        root: {
          label: "ไทย",
          lang: "th",
        },
      },
      pagefind: {
        ranking: pagefindRanking,
      },
      customCss: ["./src/styles/custom.css"],
      components: {
        PageTitle: "./src/components/FlowPageTitle.astro",
      },
      sidebar: [
        {
          label: "Business Flows",
          items: [{ autogenerate: { directory: "business-flows" } }],
        },
        {
          label: "Shared Rules",
          items: [{ autogenerate: { directory: "shared-rules" } }],
        },
        {
          label: "System Context",
          items: [{ autogenerate: { directory: "system-context" } }],
        },
        {
          label: "Developer Guides",
          items: [{ autogenerate: { directory: "developer-guides" } }],
        },
      ],
    }),
  ],
});

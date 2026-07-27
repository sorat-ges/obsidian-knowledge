import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

const status = z.enum(["draft", "active", "deprecated"]);

const starlightDocsSchema = docsSchema({
  extend: z.object({
    capability: z.string().min(1).optional(),
    services: z.array(z.string().min(1)).optional(),
    integrations: z.array(z.string().min(1)).optional(),
    aliases: z.array(z.string().min(1)).optional(),
    errorCodes: z.array(z.string().min(1)).optional(),
    status: status.default("active"),
    draft: z.boolean().optional(),
    documentType: z
      .enum(["flow", "shared-rule", "system-context", "developer-guide"])
      .optional(),
  }),
});

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: (context) =>
      starlightDocsSchema(context)
        .superRefine((data, refinement) => {
          const statusIsDraft = data.status === "draft";
          if (data.draft !== undefined && data.draft !== statusIsDraft) {
            refinement.addIssue({
              code: "custom",
              path: ["draft"],
              message: "draft must match status",
            });
          }
        })
        .transform((data) => ({
          ...data,
          draft: data.status === "draft",
        })),
  }),
};

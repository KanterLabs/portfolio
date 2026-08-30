import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      highlight: z.string(),
      impact: z.string(),
      constraint: z.string(),
      role: z.string(),
      scope: z.string(),
      keyOutcome: z.string(),
      kind: z.enum(['project', 'experience']).default('project'),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
      order: z.number(),
      stack: z.array(z.string()),
      status: z.enum(['shipped', 'in-progress', 'archived']),
      date: z.coerce.date(),
      heroImage: image().optional(),
      socialImage: z.string().optional(),
      links: z
        .array(
          z.object({
            label: z.string(),
            href: z.string().url(),
          }),
        )
        .optional(),
      system: z
        .object({
          caption: z.string(),
          tiers: z
            .array(
              z.object({
                nodes: z
                  .array(
                    z.object({
                      label: z.string().optional(),
                      title: z.string(),
                      detail: z.string().optional(),
                      kind: z.enum(['default', 'accent']).default('default'),
                    }),
                  )
                  .min(1)
                  .max(2),
              }),
            )
            .min(2)
            .max(4),
          footer: z
            .array(
              z.object({
                label: z.string(),
                title: z.string(),
              }),
            )
            .max(3)
            .optional(),
        })
        .optional(),
    }),
});

export const collections = { projects };

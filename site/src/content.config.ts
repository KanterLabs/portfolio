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
      featured: z.boolean().default(false),
      order: z.number(),
      stack: z.array(z.string()),
      status: z.enum(['shipped', 'in-progress', 'archived']),
      date: z.coerce.date(),
      heroImage: image().optional(),
      links: z
        .array(
          z.object({
            label: z.string(),
            href: z.string().url(),
          }),
        )
        .optional(),
    }),
});

export const collections = { projects };

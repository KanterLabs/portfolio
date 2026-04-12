import { defineCollection, z } from 'astro:content';

const projects = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
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

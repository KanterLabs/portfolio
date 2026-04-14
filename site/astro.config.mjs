// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';

const siteUrl = 'https://shanekanterman.dev';

export default defineConfig({
  site: siteUrl,
  devToolbar: {
    enabled: process.env.PLAYWRIGHT !== 'true',
  },
  integrations: [
    mdx({
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: 'append',
            properties: {
              className: ['heading-anchor'],
              ariaHidden: 'true',
              tabIndex: -1,
            },
            content: {
              type: 'element',
              tagName: 'span',
              properties: { className: ['heading-anchor-icon'] },
              children: [{ type: 'text', value: '#' }],
            },
          },
        ],
      ],
    }),
    sitemap(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark-dimmed',
      wrap: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});

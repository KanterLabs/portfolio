// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';

const siteUrl = 'https://shanekanterman.dev';

/**
 * Markdown tables pan horizontally on narrow screens. The table itself must
 * stay `display: table` so thead and tbody resolve one set of column widths,
 * so the scroll container is a wrapper around it — and a scrollable region
 * must be keyboard-focusable (WCAG 2.1.1, axe scrollable-region-focusable).
 */
function rehypeFocusableScrollRegions() {
  const wrapTables = (node) => {
    const children = node.children ?? [];
    children.forEach((child, index) => {
      if (child.type !== 'element') return;
      if (child.tagName === 'table') {
        children[index] = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-scroll'], tabIndex: 0 },
          children: [child],
        };
        return;
      }
      wrapTables(child);
    });
  };
  return (tree) => wrapTables(tree);
}

export default defineConfig({
  site: siteUrl,
  redirects: {
    '/projects/self-hosted-dev-server': '/projects/kanterlabs-homelab',
  },
  devToolbar: {
    enabled: process.env.PLAYWRIGHT !== 'true',
  },
  integrations: [
    mdx({
      rehypePlugins: [
        rehypeFocusableScrollRegions,
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: 'append',
            properties: {
              className: ['heading-anchor'],
              ariaLabel: 'Link to this section',
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
      transformers: [
        {
          // The <code> element is the horizontal scroll container
          // (.prose pre code) — same WCAG 2.1.1 requirement as tables.
          code(node) {
            node.properties.tabindex = '0';
          },
        },
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});

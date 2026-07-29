import { expect, type Page } from '@playwright/test';

/**
 * Assert every visible interactive element meets a minimum target size.
 *
 * Exceptions applied automatically:
 * - zero-size / hidden elements (closed menus, dialogs)
 * - the WCAG 2.5.8 inline exception: links inside a text block, where the
 *   target size is constrained by the surrounding line-height (prose
 *   links, heading anchors)
 */
export async function expectMinTargetSizes(
  page: Page,
  minimum: number,
  exceptions: string[] = []
): Promise<void> {
  const offenders = await page.evaluate(
    ([min, excepted]) => {
      const isInlineTextLink = (el: Element) =>
        el.tagName === 'A' &&
        el.closest('p, li, h1, h2, h3, h4, td, th, figcaption') !== null;

      const results: string[] = [];
      document
        .querySelectorAll<HTMLElement>('a[href], button, summary, [role="button"]')
        .forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden') return;
          if ((excepted as string[]).some((selector) => el.matches(selector))) return;
          if (isInlineTextLink(el)) return;

          if (rect.width + 0.5 < (min as number) || rect.height + 0.5 < (min as number)) {
            const classes = [...el.classList].slice(0, 3).join('.');
            const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
            results.push(
              `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''} "${text}" ` +
                `${Math.round(rect.width)}x${Math.round(rect.height)}`
            );
          }
        });
      return results;
    },
    [minimum, exceptions] as const
  );

  expect(
    offenders,
    `interactive targets below ${minimum}x${minimum}px:\n${offenders.join('\n')}`
  ).toEqual([]);
}

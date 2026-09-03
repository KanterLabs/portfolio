import { test, expect, type Locator } from "@playwright/test";
import {
  expectHashLinkToReachSection,
  expectNoHorizontalOverflow,
} from "./helpers/navigation";
import {
  parseColor,
  effectiveBackground,
  getContrastRatio,
} from "./helpers/contrast";

test.describe("homepage", () => {
  test("desktop nav anchors and CTA targets work", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop-only anchor validation");

    await page.goto("/");
    const primaryNav = page.locator('nav[aria-label="Primary"]');

    await expect(page).toHaveTitle(
      "Shane Kanterman | Infrastructure and Platform Projects",
    );
    await expect(
      page.getByRole("heading", {
        name: "I build Linux platforms, from bare metal to CI/CD.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 3,
        name: "KanterLabs Homelab Platform",
      }),
    ).toBeVisible();
    await expect(page.getByText("Featured case study")).toBeVisible();

    await expectHashLinkToReachSection(
      page,
      () => primaryNav.getByRole("link", { name: "Experience" }).click(),
      "about",
    );
    await page.goto("/");
    await expectHashLinkToReachSection(
      page,
      () => primaryNav.getByRole("link", { name: "Architecture" }).click(),
      "architecture",
    );
    await page.goto("/");
    await expectHashLinkToReachSection(
      page,
      () => primaryNav.getByRole("link", { name: "Projects" }).click(),
      "projects",
    );
    await page.goto("/");
    await expectHashLinkToReachSection(
      page,
      () => primaryNav.getByRole("link", { name: "Skills" }).click(),
      "skills",
    );
    await page.goto("/");
    // The panel-to-footer void shrank on purpose (see #contact padding-bottom
    // and .site-footer changes), so the page is shorter and the browser can no
    // longer scroll the last section quite as close to the viewport top.
    await expectHashLinkToReachSection(
      page,
      () => primaryNav.getByRole("link", { name: "Contact" }).click(),
      "contact",
      {
        maxTop: 480,
      },
    );
    await page.goto("/");
    await expectHashLinkToReachSection(
      page,
      () => page.getByRole("link", { name: "View Selected Work" }).click(),
      "projects",
    );

    await expect(page.getByRole("link", { name: "Resume" })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "LinkedIn" }).first(),
    ).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/shane-kanterman-4511a2234",
    );
    await expect(
      page.getByRole("link", { name: "GitHub" }).first(),
    ).toHaveAttribute("href", "https://github.com/ShaneKanterman04");
    await expect(page.getByRole("link", { name: "Email me" })).toHaveAttribute(
      "href",
      "mailto:shanekanterman04@gmail.com",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://shanekanterman.dev/",
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Infrastructure and platform portfolio for Shane Kanterman featuring Linux systems, deployment tooling, ephemeral CI, and hands-on data center operations.",
    );

    await expect(page.getByLabel("Site footer")).toContainText("Build");
    await expect(
      page.getByText(/Build (\d{2}-\d{2}-\d{4}-\d+|unavailable)/),
    ).toBeVisible();
  });

  test("mobile menu works and layout does not overflow", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Mobile-only layout validation");

    await page.goto("/");

    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(page.locator("#mobile-nav")).toBeVisible();
    await expect(
      page.locator('button[aria-controls="mobile-nav"]'),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#mobile-nav")).toContainText("Projects");

    await expectHashLinkToReachSection(
      page,
      () =>
        page
          .locator("#mobile-nav")
          .getByRole("link", { name: "Projects" })
          .click(),
      "projects",
    );
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByText(/Build (\d{2}-\d{2}-\d{4}-\d+|unavailable)/),
    ).toBeVisible();
  });

  test("case studies render as bordered cards, not a flat list", async ({
    page,
  }) => {
    await page.goto("/");

    const entries = page.locator("#projects .project-entry");
    await expect(entries).toHaveCount(4);

    for (let i = 0; i < 4; i += 1) {
      const chrome = await entries.nth(i).evaluate((el) => {
        const style = getComputedStyle(el);
        const alphaOf = (color: string) => {
          const parts = color.match(/rgba?\(([^)]+)\)/)?.[1].split(",");
          if (!parts) return 0;
          return parts[3] === undefined ? 1 : parseFloat(parts[3]);
        };
        return {
          widths: [
            parseFloat(style.borderTopWidth),
            parseFloat(style.borderRightWidth),
            parseFloat(style.borderBottomWidth),
            parseFloat(style.borderLeftWidth),
          ],
          style: style.borderTopStyle,
          borderAlpha: alphaOf(style.borderTopColor),
          radius: parseFloat(style.borderTopLeftRadius),
          bgAlpha: alphaOf(style.backgroundColor),
        };
      });

      for (const width of chrome.widths) {
        expect(width, `entry ${i} border width`).toBeGreaterThanOrEqual(1);
      }
      expect(chrome.style, `entry ${i} border style`).toBe("solid");
      expect(
        chrome.borderAlpha,
        `entry ${i} border visibility`,
      ).toBeGreaterThan(0);
      expect(chrome.radius, `entry ${i} corner radius`).toBeGreaterThanOrEqual(
        12,
      );
      expect(chrome.bgAlpha, `entry ${i} panel background`).toBeGreaterThan(0);
    }
  });

  test("cards respond to hover with a stronger border", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Hover treatment is a pointer affordance");

    await page.goto("/");

    const card = page.locator("#projects .project-card").first();
    await card.scrollIntoViewIfNeeded();
    // Let the .project-entry entrance reveal (editorial-reveal, 340ms)
    // finish settling before taking the "before" measurement, or its own
    // in-flight transform reads as part of the hover delta.
    await page.locator("#projects.observe-animate").evaluate(
      (el) =>
        new Promise<void>((resolve) => {
          if (el.classList.contains("visible")) return resolve();
          const observer = new MutationObserver(() => {
            if (el.classList.contains("visible")) {
              observer.disconnect();
              resolve();
            }
          });
          observer.observe(el, {
            attributes: true,
            attributeFilter: ["class"],
          });
        }),
    );
    await expect(async () => {
      const transform = await card.evaluate(
        (el) => getComputedStyle(el).transform,
      );
      expect(transform).toBe("matrix(1, 0, 0, 1, 0, 0)");
    }).toPass({ timeout: 2000 });

    const before = await card.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    const beforeShadow = await card.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    );
    const beforeBox = await card.boundingBox();
    expect(beforeBox).not.toBeNull();

    await card.hover();
    await expect(async () => {
      const after = await card.evaluate(
        (el) => getComputedStyle(el).borderTopColor,
      );
      expect(after).not.toBe(before);
    }).toPass({ timeout: 2000 });

    const afterShadow = await card.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    );
    expect(afterShadow, "hovered card box-shadow").not.toBe(beforeShadow);

    const afterBox = await card.boundingBox();
    expect(afterBox).not.toBeNull();
    const lift = beforeBox!.y - afterBox!.y;
    expect(
      lift,
      `card should lift 1.5-3px, moved ${lift}px`,
    ).toBeGreaterThanOrEqual(1.5);
    expect(
      lift,
      `card should lift 1.5-3px, moved ${lift}px`,
    ).toBeLessThanOrEqual(3);
  });

  test("hover lift is disabled under prefers-reduced-motion", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Hover treatment is a pointer affordance");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const card = page.locator("#projects .project-card").first();
    await card.scrollIntoViewIfNeeded();
    await card.hover();

    await expect(async () => {
      const transform = await card.evaluate(
        (el) => getComputedStyle(el).transform,
      );
      expect(transform).toBe("none");
    }).toPass({ timeout: 2000 });
  });

  test("supporting card stack rows never open a line with a separator", async ({
    page,
  }) => {
    await page.goto("/");

    const card = page.locator("#projects .project-card").first();
    const stackItems = card.locator(".project-stack > *");
    const count = await stackItems.count();
    expect(count).toBeGreaterThan(1);

    const separatorContent = await stackItems
      .nth(1)
      .evaluate((el) => getComputedStyle(el, "::before").content);
    expect(separatorContent).toBe('"·"');

    // The separator lives entirely in ::before — a screen reader or a
    // copy/paste only ever sees each entry's real text node, so it must
    // carry its own whitespace or adjacent entries read as one run-on
    // word ("ProxmoxVELinuxCaddy…").
    const rawTexts = await stackItems.evaluateAll((els) =>
      els.map((el) => el.textContent ?? ""),
    );
    for (const raw of rawTexts) {
      expect(
        raw,
        `stack entry "${raw}" must carry its own whitespace so entries don't run together`,
      ).toMatch(/^\s.+\s$/);
    }

    await page.setViewportSize({ width: 390, height: 900 });
    const container = card.locator(".project-stack");
    const containerBox = await container.boundingBox();
    expect(containerBox).not.toBeNull();

    const rects = await stackItems.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().left),
    );
    for (const left of rects) {
      expect(
        left,
        "stack entry left edge vs container left edge",
      ).toBeGreaterThanOrEqual(containerBox!.x - 0.5);
    }
  });

  test("#about reads as two panels, not a grid of tiles", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop-only panel geometry");

    // Rest-layout geometry — see the note on the showcase test below.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    const panels = page.locator("#about .glass");
    await expect(panels).toHaveCount(2);

    const first = await panels.nth(0).boundingBox();
    const second = await panels.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const gap = second!.y - (first!.y + first!.height);
    expect(gap, `panel-to-panel gap: ${gap}px`).toBeGreaterThanOrEqual(30);
    expect(gap, `panel-to-panel gap: ${gap}px`).toBeLessThanOrEqual(44);
  });

  test("the experience timeline is a timeline, not a card row", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "viewport-resizing test drives its own widths");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    const timeline = page.locator("#about ol.timeline");
    await expect(timeline).toHaveCount(1);
    const entries = timeline.locator("li.timeline-entry");
    await expect(entries).toHaveCount(3);

    const titleXs = await entries
      .locator(".timeline-title")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x));
    const dateXs = await entries
      .locator(".timeline-date")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x));
    expect(Math.max(...titleXs) - Math.min(...titleXs)).toBeLessThanOrEqual(1);
    expect(Math.max(...dateXs) - Math.min(...dateXs)).toBeLessThanOrEqual(1);

    const chrome = await entries.evaluateAll((els) =>
      els.map((el) => {
        const style = getComputedStyle(el);
        return {
          borderTopWidth: style.borderTopWidth,
          borderTopStyle: style.borderTopStyle,
          borderTopColor: style.borderTopColor,
        };
      }),
    );
    expect(chrome[0].borderTopWidth).toBe("0px");
    for (const entry of [chrome[1], chrome[2]]) {
      expect(entry.borderTopStyle).toBe("solid");
      expect(parseFloat(entry.borderTopWidth)).toBeGreaterThanOrEqual(1);
      const color = parseColor(entry.borderTopColor);
      expect(color, `unparseable color ${entry.borderTopColor}`).not.toBeNull();
      expect(color!.alpha).toBeGreaterThan(0);
    }

    // The entry copy keeps a readable measure instead of running the full
    // panel width — guards the .timeline-copy max-width cap.
    const measures = await entries
      .locator(".timeline-copy")
      .evaluateAll((els) =>
        els.map((el) => ({
          copy: el.getBoundingClientRect().width,
          body: el.closest(".timeline-body")!.getBoundingClientRect().width,
        })),
      );
    expect(measures).toHaveLength(3);
    for (const { copy, body } of measures) {
      expect(copy).toBeLessThanOrEqual(700);
      expect(copy).toBeLessThan(body - 100);
    }

    await page.setViewportSize({ width: 390, height: 900 });
    await page.reload();

    const count = await entries.count();
    for (let i = 0; i < count; i += 1) {
      const entry = entries.nth(i);
      const dateBox = await entry.locator(".timeline-date").boundingBox();
      const orgBox = await entry.locator(".field-label").boundingBox();
      expect(dateBox, `entry ${i} date box`).not.toBeNull();
      expect(orgBox, `entry ${i} org label box`).not.toBeNull();
      expect(
        dateBox!.y + dateBox!.height,
        `entry ${i} date should sit above org label`,
      ).toBeLessThanOrEqual(orgBox!.y + 1);

      const borderLeftWidth = await entry
        .locator(".timeline-body")
        .evaluate((el) => getComputedStyle(el).borderLeftWidth);
      expect(borderLeftWidth, `entry ${i} rail should be gone on mobile`).toBe(
        "0px",
      );
    }
  });

  test("panels split by a hairline instead of ending ragged", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Desktop/tablet breakpoint comparison drives its own widths",
    );

    const selectors = [
      "#about .panel-split",
      "#architecture .panel-split",
      "#contact .panel-split",
    ];

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    for (const selector of selectors) {
      const panel = page.locator(selector).first();
      const children = panel.locator(":scope > *");
      await expect(children).toHaveCount(2);

      const chrome = await children.nth(1).evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          borderLeftStyle: style.borderLeftStyle,
          borderLeftWidth: style.borderLeftWidth,
          borderLeftColor: style.borderLeftColor,
          borderTopWidth: style.borderTopWidth,
        };
      });
      expect(chrome.borderLeftStyle, `${selector} divider style`).toBe("solid");
      expect(
        parseFloat(chrome.borderLeftWidth),
        `${selector} divider width`,
      ).toBeGreaterThanOrEqual(1);
      const color = parseColor(chrome.borderLeftColor);
      expect(
        color,
        `unparseable color ${chrome.borderLeftColor}`,
      ).not.toBeNull();
      expect(color!.alpha, `${selector} divider visibility`).toBeGreaterThan(0);
      expect(
        chrome.borderTopWidth,
        `${selector} divider should not also carry a top border`,
      ).toBe("0px");

      const first = await children.nth(0).boundingBox();
      const second = await children.nth(1).boundingBox();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      const overlap =
        Math.min(first!.y + first!.height, second!.y + second!.height) -
        Math.max(first!.y, second!.y);
      expect(
        overlap,
        `${selector} columns should vertically overlap`,
      ).toBeGreaterThan(0);
      expect(
        second!.x,
        `${selector} second column should sit right of the first`,
      ).toBeGreaterThan(first!.x + first!.width - 1);
    }

    await page.setViewportSize({ width: 940, height: 1400 });
    await page.reload();

    for (const selector of selectors) {
      const panel = page.locator(selector).first();
      const children = panel.locator(":scope > *");
      const chrome = await children.nth(1).evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          borderTopStyle: style.borderTopStyle,
          borderLeftWidth: style.borderLeftWidth,
        };
      });
      expect(chrome.borderTopStyle, `${selector} stacked divider style`).toBe(
        "solid",
      );
      expect(
        chrome.borderLeftWidth,
        `${selector} stacked divider should drop its left border`,
      ).toBe("0px");
    }
  });

  test("the architecture panel ends flush at the floor", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "The two-column architecture layout is desktop-only");

    // Rest-layout geometry — see the note on the showcase test below.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    await expect(page.locator("#architecture .glass")).toHaveCount(1);

    const rows = page.locator("#architecture .proof-inline-row");
    const rowBox = await rows.last().boundingBox();
    const footerBox = await page
      .locator("#architecture .architecture-footer")
      .boundingBox();
    expect(rowBox).not.toBeNull();
    expect(footerBox).not.toBeNull();

    const rowBottom = rowBox!.y + rowBox!.height;
    const footerBottom = footerBox!.y + footerBox!.height;
    expect(
      Math.abs(rowBottom - footerBottom),
      `row bottom ${rowBottom} vs footer bottom ${footerBottom}`,
    ).toBeLessThanOrEqual(12);
  });

  test("the architecture proof rows stay spaced below the panel-split breakpoint", async ({
    page,
  }) => {
    // Below 960px #architecture stacks into one column and .architecture-proof-rows
    // loses the bottom-anchored `margin-top: auto` — it must still keep a real gap
    // between its own rows instead of collapsing flush against its border-adjacent
    // siblings. Covers the base (non-@media) rule, not just the >=960px flush case above.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.goto("/");

    const rows = page.locator("#architecture .proof-inline-row");
    await expect(rows).toHaveCount(3);

    const rowGap = await page
      .locator("#architecture .architecture-proof-rows")
      .evaluate((el) =>
        parseFloat(getComputedStyle(el).rowGap || getComputedStyle(el).gap),
      );
    expect(rowGap).toBeGreaterThan(0);

    const firstBox = await rows.nth(0).boundingBox();
    const secondBox = await rows.nth(1).boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    expect(secondBox!.y).toBeGreaterThan(firstBox!.y + firstBox!.height);
  });

  test("the contact panel closes the page", async ({ page, isMobile }) => {
    test.skip(
      isMobile,
      "Desktop-only panel geometry; contrast/copy checks run separately",
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    await expect(page.locator("#contact .glass")).toHaveCount(1);

    const h2 = page.locator("#contact h2");
    const lineCount1440 = await h2.evaluate(
      (el) =>
        el.getBoundingClientRect().height /
        parseFloat(getComputedStyle(el).lineHeight),
    );
    expect(lineCount1440).toBeLessThanOrEqual(2.2);

    const panelBox = await page.locator("#contact .glass").boundingBox();
    const railBox = await page
      .locator("#contact .contact-link-grid")
      .boundingBox();
    expect(panelBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    const panelCenter = panelBox!.y + panelBox!.height / 2;
    const railCenter = railBox!.y + railBox!.height / 2;
    expect(Math.abs(railCenter - panelCenter)).toBeLessThanOrEqual(6);

    const footerParagraph = page.locator(".site-footer p").first();
    const footerBox1440 = await footerParagraph.boundingBox();
    expect(footerBox1440).not.toBeNull();
    const gap1440 = footerBox1440!.y - (panelBox!.y + panelBox!.height);
    expect(
      gap1440,
      `panel-to-footer gap at 1440: ${gap1440}px`,
    ).toBeGreaterThanOrEqual(88);
    expect(
      gap1440,
      `panel-to-footer gap at 1440: ${gap1440}px`,
    ).toBeLessThanOrEqual(150);

    const emailDetail = page.locator("#contact dd", {
      hasText: "shanekanterman04@gmail.com",
    });
    const emailChrome = await emailDetail.evaluate((el) => {
      const style = getComputedStyle(el);
      return { fontSize: style.fontSize, color: style.color };
    });
    expect(parseFloat(emailChrome.fontSize)).toBeGreaterThanOrEqual(15);
    // Compare against a known --color-text-soft consumer (.timeline-date) and
    // a known --color-text-base consumer (the contact h2, via text-text-base)
    // so the comparison is browser-resolved rgb() vs rgb(), not a raw hex
    // custom-property string vs a resolved color.
    const softReferenceColor = await page
      .locator("#about .timeline-date")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    const baseReferenceColor = await page
      .locator("#contact h2")
      .evaluate((el) => getComputedStyle(el).color);
    expect(emailChrome.color).not.toBe(softReferenceColor);
    expect(emailChrome.color).toBe(baseReferenceColor);

    await page.setViewportSize({ width: 390, height: 900 });
    await page.reload();

    const lineCount390 = await page
      .locator("#contact h2")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().height /
          parseFloat(getComputedStyle(el).lineHeight),
      );
    expect(lineCount390).toBeLessThanOrEqual(4.2);

    const panelBox390 = await page.locator("#contact .glass").boundingBox();
    const footerBox390 = await page
      .locator(".site-footer p")
      .first()
      .boundingBox();
    expect(panelBox390).not.toBeNull();
    expect(footerBox390).not.toBeNull();
    const gap390 = footerBox390!.y - (panelBox390!.y + panelBox390!.height);
    expect(
      gap390,
      `panel-to-footer gap at 390: ${gap390}px`,
    ).toBeGreaterThanOrEqual(64);
    expect(
      gap390,
      `panel-to-footer gap at 390: ${gap390}px`,
    ).toBeLessThanOrEqual(120);

    await expect(page.getByText("Where I am headed")).toHaveCount(0);
    await expect(
      page.getByText(/Looking for junior infrastructure and platform roles/),
    ).toHaveCount(0);

    await expect(page.getByRole("link", { name: "Email me" })).toHaveAttribute(
      "href",
      "mailto:shanekanterman04@gmail.com",
    );
  });

  test("contact email clears contrast in both themes", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Desktop-only contrast check; the copy is unaffected by viewport",
    );

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(() => localStorage.clear());
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      const emailDetail = page.locator("#contact dd", {
        hasText: "shanekanterman04@gmail.com",
      });
      const bg = await effectiveBackground(page, "#contact dd");
      const color = await emailDetail.evaluate(
        (el) => getComputedStyle(el).color,
      );
      const fg = parseColor(color);
      expect(fg, `unparseable color ${color} (${colorScheme})`).not.toBeNull();
      const ratio = getContrastRatio(fg!.rgb, bg);
      expect(
        ratio,
        `${colorScheme} email contrast: ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("section rhythm is one number, not five", async ({ page, isMobile }) => {
    test.skip(isMobile, "viewport-resizing test drives its own widths");

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/");

      // #projects, #about, #architecture, and #skills each open with a real
      // <SectionIntro>; #contact is the page's closing statement and never
      // used the component, so it is deliberately not part of this count.
      const intros = page.locator("[data-section-intro]");
      await expect(intros).toHaveCount(4);
      const margins = await intros.evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).marginBottom),
      );
      const unique = new Set(margins);
      expect(
        unique.size,
        `margin-bottom values at ${width}px: ${margins.join(", ")}`,
      ).toBe(1);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    const skillsGap = await page
      .locator("#skills > .grid")
      .evaluate((el) => getComputedStyle(el).columnGap);
    const projectsGap = await page
      .locator("#projects .project-card-grid")
      .evaluate((el) => getComputedStyle(el).columnGap);
    expect(skillsGap).toBe(projectsGap);
  });

  test("skills cards separate their sentence from their stack list", async ({
    page,
  }) => {
    await page.goto("/");

    const stackLists = page.locator("#skills .stack-list");
    await expect(stackLists).toHaveCount(3);

    for (let i = 0; i < 3; i += 1) {
      const chrome = await stackLists.nth(i).evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          style: style.borderTopStyle,
          width: style.borderTopWidth,
          color: style.borderTopColor,
        };
      });
      expect(chrome.style, `stack list ${i} border style`).toBe("solid");
      expect(
        parseFloat(chrome.width),
        `stack list ${i} border width`,
      ).toBeGreaterThanOrEqual(1);
      const color = parseColor(chrome.color);
      expect(color, `unparseable color ${chrome.color}`).not.toBeNull();
      expect(color!.alpha, `stack list ${i} border visibility`).toBeGreaterThan(
        0,
      );
    }

    await page.goto("/projects/hostlet");
    const caseStudyStackList = page.locator(".stack-list").first();
    const borderTopWidth = await caseStudyStackList.evaluate(
      (el) => getComputedStyle(el).borderTopWidth,
    );
    expect(
      borderTopWidth,
      "case-study stack list must stay unscoped by the #skills rule",
    ).toBe("0px");
  });

  test("case-study titles link to their case studies", async ({ page }) => {
    await page.goto("/");

    const titleLinks = page.locator(".project-title a");
    await expect(titleLinks).toHaveCount(4);
    for (const href of await titleLinks.evaluateAll((links) =>
      links.map((l) => l.getAttribute("href")),
    )) {
      expect(href).toMatch(/^\/projects\/.+/);
    }

    await titleLinks.first().click();
    await expect(page).toHaveURL(/\/projects\/kanterlabs-homelab\/?$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "KanterLabs Homelab Platform",
      }),
    ).toBeVisible();
  });

  test("selected work precedes experience and uses the intended project order", async ({
    page,
  }) => {
    await page.goto("/");

    const sectionOrder = await page
      .locator("main > section")
      .evaluateAll((sections) =>
        sections.map((section) => section.id).filter(Boolean),
      );
    expect(sectionOrder.slice(0, 3)).toEqual(["top", "projects", "about"]);

    const titles = await page
      .locator("#projects .project-title")
      .allTextContents();
    expect(titles.map((title) => title.trim())).toEqual([
      "KanterLabs Homelab Platform",
      "Sandbox Factory",
      "Hostlet Self-Hosted Deployment Panel",
      "Dual-Origin Portfolio Deployment",
    ]);

    await expect(
      page.getByRole("link", { name: "Read experience notes" }),
    ).toHaveAttribute("href", "/projects/data-center-operations");
    await expect(page.getByText("June 2025 – Present")).toBeVisible();
  });

  test("featured case study is a showcase, not just another card", async ({
    page,
    isMobile,
  }) => {
    // This test measures rest-layout geometry. boundingBox() scrolls its
    // target into view, which is exactly what arms the reveal observer — so
    // without this the measurement races a translateY that is still running.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const showcase = page.locator(".project-showcase");
    await expect(showcase).toHaveCount(1);
    await expect(showcase.locator(".project-outcome")).toBeVisible();

    const accent = await showcase.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        width: parseFloat(style.borderLeftWidth),
        style: style.borderLeftStyle,
      };
    });
    expect(accent.width).toBeGreaterThanOrEqual(2);
    expect(accent.style).toBe("solid");

    const featuredTitle = await showcase
      .locator(".project-title")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const supportingTitle = await page
      .locator(".project-card .project-title")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(featuredTitle).toBeGreaterThan(supportingTitle * 1.2);

    const diagram = page.locator(".project-showcase-diagram");
    const cards = page.locator("#projects .project-card");
    const featuredStrip = showcase.locator(".system-diagram-strip");
    const caption = showcase.locator(".project-system-caption");

    await expect(caption).toBeVisible();
    await expect(caption).toContainText(
      "Public traffic enters through Cloudflare",
    );

    if (isMobile) {
      // Below 960px the diagram panel is hidden (same precedent as the
      // hero card and ArchitectureSnapshot) and cards stack vertically;
      // the compact chip strip stands in as the sub-960px artifact.
      await expect(diagram).toBeHidden();
      await expect(featuredStrip).toBeVisible();

      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(Math.abs(first!.x - second!.x)).toBeLessThanOrEqual(2);
      expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
    } else {
      await expect(diagram).toBeVisible();
      await expect(featuredStrip).toBeHidden();
      expect(
        await diagram.locator(".system-node").count(),
      ).toBeGreaterThanOrEqual(5);

      const body = await showcase
        .locator(".project-showcase-body")
        .boundingBox();
      const panel = await diagram.boundingBox();
      expect(body).not.toBeNull();
      expect(panel).not.toBeNull();
      // The diagram panel is a real second column: right of the narrative
      // and vertically overlapping it, not a stacked block.
      expect(panel!.x).toBeGreaterThan(body!.x + body!.width - 1);
      const overlap =
        Math.min(body!.y + body!.height, panel!.y + panel!.height) -
        Math.max(body!.y, panel!.y);
      expect(overlap).toBeGreaterThan(0);
      expect(body!.width).toBeGreaterThan(panel!.width);
      expect(panel!.width).toBeGreaterThan(300);
      expect(panel!.width).toBeLessThan(420);

      // The two columns end flush: the CTA's bottom edge and the plate's
      // bottom edge land on effectively the same line.
      const cta = await showcase.locator(".text-link").boundingBox();
      expect(cta).not.toBeNull();
      expect(
        Math.abs(cta!.y + cta!.height - (panel!.y + panel!.height)),
      ).toBeLessThanOrEqual(10);

      // The 220px void is gone: the footer hairline sits close behind the
      // last piece of narrative copy, not floating in empty space.
      const stack = await showcase.locator(".project-stack").boundingBox();
      const footer = await showcase
        .locator(".project-showcase-footer")
        .boundingBox();
      expect(stack).not.toBeNull();
      expect(footer).not.toBeNull();
      expect(footer!.y - (stack!.y + stack!.height)).toBeLessThan(40);

      const footerChrome = await showcase
        .locator(".project-showcase-footer")
        .evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            style: style.borderTopStyle,
            width: parseFloat(style.borderTopWidth),
            color: style.borderTopColor,
          };
        });
      expect(footerChrome.style).toBe("solid");
      expect(footerChrome.width).toBeGreaterThanOrEqual(1);
      const footerBorder = parseColor(footerChrome.color);
      expect(
        footerBorder,
        `unparseable color ${footerChrome.color}`,
      ).not.toBeNull();
      expect(footerBorder!.alpha).toBeGreaterThan(0);

      // The showcase spans the collection; supporting cards split a row.
      const showcaseBox = await showcase.boundingBox();
      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      expect(showcaseBox).not.toBeNull();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(showcaseBox!.width).toBeGreaterThan(first!.width * 1.7);
      expect(Math.abs(first!.y - second!.y)).toBeLessThanOrEqual(2);
      expect(second!.x).toBeGreaterThan(first!.x + first!.width - 1);
    }
  });

  test("split diagram tiers align their node rows", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "The diagram plate is hidden below 960px");
    // Rest-layout geometry — see the note on the showcase test above.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const splitTiers = page.locator(
      ".project-showcase-diagram .system-diagram-tier-split",
    );
    const count = await splitTiers.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const nodes = splitTiers.nth(i).locator(".system-node");
      await expect(nodes).toHaveCount(2);

      const [titleA, titleB] = await Promise.all([
        nodes.nth(0).locator("strong").boundingBox(),
        nodes.nth(1).locator("strong").boundingBox(),
      ]);
      expect(titleA).not.toBeNull();
      expect(titleB).not.toBeNull();
      expect(Math.abs(titleA!.y - titleB!.y)).toBeLessThanOrEqual(1);

      const [labelA, labelB] = await Promise.all([
        nodes.nth(0).locator(".system-node-label").boundingBox(),
        nodes.nth(1).locator(".system-node-label").boundingBox(),
      ]);
      if (labelA && labelB) {
        expect(Math.abs(labelA.y - labelB.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  test("architecture nodes and summary rule share one measure", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "The two-column architecture layout is desktop-only");
    await page.goto("/");

    const footer = page.locator("#architecture .architecture-footer");
    const footerBox = await footer.boundingBox();
    expect(footerBox).not.toBeNull();

    const nodes = page.locator(
      "#architecture .architecture-snapshot .system-node-primary",
    );
    const nodeCount = await nodes.count();
    expect(nodeCount).toBeGreaterThan(0);

    for (let i = 0; i < nodeCount; i += 1) {
      const nodeBox = await nodes.nth(i).boundingBox();
      expect(nodeBox).not.toBeNull();
      expect(
        Math.abs(nodeBox!.x - footerBox!.x),
        `node ${i} left edge`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          nodeBox!.x + nodeBox!.width - (footerBox!.x + footerBox!.width),
        ),
        `node ${i} right edge`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("supporting cards carry system strips that describe each project", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");

    const expectStripIntegrity = async (strip: Locator, name: string) => {
      await expect(strip, `${name} strip`).toBeVisible();

      const label = await strip.getAttribute("aria-label");
      const labelledBy = await strip.getAttribute("aria-labelledby");
      if (labelledBy) {
        const caption = page.locator(`#${labelledBy}`);
        expect(
          (await caption.textContent())?.trim().length ?? 0,
          `${name} strip caption`,
        ).toBeGreaterThan(20);
      } else {
        expect(
          label?.trim().length ?? 0,
          `${name} strip caption`,
        ).toBeGreaterThan(20);
      }

      const nodeCount = await strip.locator("li.system-strip-node").count();
      expect(nodeCount, `${name} strip nodes`).toBeGreaterThanOrEqual(4);

      const arrows = strip.locator(".system-strip-arrow");
      await expect(arrows, `${name} strip arrows`).toHaveCount(nodeCount - 1);
      for (const hidden of await arrows.evaluateAll((els) =>
        els.map((el) => el.getAttribute("aria-hidden")),
      )) {
        expect(hidden).toBe("true");
      }

      const overflow = await strip.evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      expect(overflow, `${name} strip overflow`).toBeLessThanOrEqual(1);

      // The arrow always leads the chip it points at, inside the same
      // <li>, so a wrapped line can never end on a naked arrow.
      const items = await strip
        .locator("li.system-strip-node")
        .evaluateAll((lis) =>
          lis.map((li) => {
            const arrow = li.querySelector(".system-strip-arrow");
            const chip = li.querySelector(".system-strip-chip");
            const firstIsArrow =
              li.firstElementChild?.classList.contains("system-strip-arrow") ??
              false;
            return {
              firstIsArrow,
              hasArrow: arrow !== null,
              arrowRect: arrow ? arrow.getBoundingClientRect() : null,
              chipRect: chip ? chip.getBoundingClientRect() : null,
            };
          }),
        );

      expect(items[0].hasArrow, `${name} first li has no arrow`).toBe(false);
      for (let j = 1; j < items.length; j += 1) {
        expect(
          items[j].firstIsArrow,
          `${name} li ${j} arrow is first child`,
        ).toBe(true);
      }
      for (const item of items) {
        if (!item.arrowRect || !item.chipRect) continue;
        expect(
          Math.abs(item.arrowRect.top - item.chipRect.top),
        ).toBeLessThanOrEqual(2);
        expect(item.arrowRect.right).toBeLessThanOrEqual(
          item.chipRect.left + 1,
        );
      }
    };

    const cards = page.locator("#projects .project-card");
    await expect(cards).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await expectStripIntegrity(
        cards.nth(i).locator("ol.system-diagram-strip"),
        `card ${i}`,
      );
    }

    // Below 960px the featured card's strip is the diagram-carrying
    // artifact — hold it to the same bar whenever it is the visible variant.
    if (isMobile) {
      await expectStripIntegrity(
        page.locator(".project-showcase ol.system-diagram-strip"),
        "featured",
      );
    }
  });

  test("supporting cards form a matched row", async ({ page, isMobile }) => {
    test.skip(isMobile, "The multi-column layout only exists at >=960px");
    // Rest-layout geometry — see the note on the showcase test above. The
    // three cards' reveals are staggered, so a mid-animation read shows them
    // at three different translateY offsets.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const cards = page.locator("#projects .project-card");
    await expect(cards).toHaveCount(3);

    const ctas = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        cards.nth(index).locator(".text-link").boundingBox(),
      ),
    );
    const boxes = await Promise.all(
      Array.from({ length: 3 }, (_, index) => cards.nth(index).boundingBox()),
    );
    for (const item of [...ctas, ...boxes]) expect(item).not.toBeNull();
    expect(
      Math.max(...ctas.map((item) => item!.y)) -
        Math.min(...ctas.map((item) => item!.y)),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.max(...boxes.map((item) => item!.height)) -
        Math.min(...boxes.map((item) => item!.height)),
    ).toBeLessThanOrEqual(2);
  });

  test("the featured showcase is grouped apart from the supporting row", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "The vertical/horizontal rhythm comparison only applies to the desktop grid",
    );
    await page.goto("/");

    const showcaseBox = await page.locator(".project-showcase").boundingBox();
    const gridBox = await page
      .locator("#projects .project-card-grid")
      .boundingBox();
    const cards = page.locator("#projects .project-card");
    const [card0, card1] = await Promise.all([
      cards.nth(0).boundingBox(),
      cards.nth(1).boundingBox(),
    ]);
    expect(showcaseBox).not.toBeNull();
    expect(gridBox).not.toBeNull();
    expect(card0).not.toBeNull();
    expect(card1).not.toBeNull();

    const verticalGap = gridBox!.y - (showcaseBox!.y + showcaseBox!.height);
    const horizontalGap = card1!.x - (card0!.x + card0!.width);

    expect(verticalGap).toBeGreaterThan(horizontalGap);
    expect(verticalGap).toBeGreaterThan(24);
  });

  // The CTAs are pill buttons, so their *labels* are centred inside the pill
  // on purpose. What must not drift is the pill's own left edge: on mobile
  // the buttons go full-width and any padding mismatch against the body copy
  // reads as a broken column.
  test("CTA buttons share a left edge with the body copy", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      !isMobile,
      "mobile is where the full-width box makes misalignment visible",
    );

    await page.goto("/");

    const heroParagraph = page.locator(".hero-surface p").first();
    const heroParagraphBox = await heroParagraph.boundingBox();
    expect(heroParagraphBox).not.toBeNull();

    const heroCta = page.getByRole("link", { name: "View Selected Work" });
    const heroCtaBox = await heroCta.boundingBox();
    expect(heroCtaBox).not.toBeNull();
    expect(Math.abs(heroCtaBox!.x - heroParagraphBox!.x)).toBeLessThanOrEqual(
      2,
    );

    const contactCta = page.getByRole("link", { name: "Email me" });
    await contactCta.scrollIntoViewIfNeeded();
    const contactParagraph = page.locator("#contact p").first();
    const contactParagraphBox = await contactParagraph.boundingBox();
    const contactCtaBox = await contactCta.boundingBox();
    expect(contactParagraphBox).not.toBeNull();
    expect(contactCtaBox).not.toBeNull();
    expect(
      Math.abs(contactCtaBox!.x - contactParagraphBox!.x),
    ).toBeLessThanOrEqual(2);
  });

  test("theme defaults to system mode and cycles system, light, dark", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop-only theme validation");

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Fresh visit: system mode, resolved to the OS preference.
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(html).toHaveAttribute("data-theme-mode", "system");
    const toggle = page.locator("[data-theme-toggle]");
    await expect(toggle).toHaveAttribute(
      "aria-label",
      "Theme: system. Switch to light theme",
    );

    // System mode tracks OS preference changes live.
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");

    // Explicit light: pinned, no longer follows the OS.
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme-mode", "light");
    await expect(toggle).toHaveAttribute(
      "aria-label",
      "Theme: light. Switch to dark theme",
    );
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-theme", "light");

    // Explicit dark: persists across reloads.
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveAttribute("data-theme-mode", "dark");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveAttribute("data-theme-mode", "dark");

    // Third click returns to system mode: storage cleared, OS wins again.
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme-mode", "system");
    await expect(html).toHaveAttribute("data-theme", "dark");
    expect(
      await page.evaluate(() => localStorage.getItem("portfolio-theme")),
    ).toBeNull();
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");
  });
});

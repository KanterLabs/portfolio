import { test, expect } from "@playwright/test";

test.describe("utility routes", () => {
  test("Greenlit landing page renders its product promise", async ({
    page,
  }) => {
    const response = await page.goto("/greenlit");

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("[data-theme-toggle]")).toHaveCount(0);
    await expect(page).toHaveTitle("Greenlit — Run GitHub Actions locally");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Know your CI is green",
    );
    await expect(
      page.getByRole("heading", { name: "Less waiting. More shipping." }),
    ).toBeVisible();
    await expect(page.locator(".terminal-branch")).toHaveText("⑂ main");
    await expect(page.locator(".terminal-state")).toHaveText("clean");
    await expect(
      page.getByRole("link", { name: "Get early access" }).first(),
    ).toHaveAttribute(
      "href",
      "mailto:shanekanterman04@gmail.com?subject=Greenlit%20launch%20updates",
    );
  });

  test("custom 404 page renders", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle("Page Not Found | Shane Kanterman");
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found." }),
    ).toBeVisible();
  });

  test('removed project routes return 404 and the homepage has no removed links or copy', async ({ page }) => {
    for (const route of ['/projects/hostlet', '/projects/sandbox-factory']) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(404);
      await expect(page).toHaveTitle('Page Not Found | Shane Kanterman');
      await expect(page.locator('main')).not.toContainText(/hostlet|sandbox factory/i);
    }

    await page.goto('/');
    await expect(page.locator('body')).not.toContainText(/hostlet|sandbox factory/i);
    const hrefs = await page.locator('a').evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
    expect(hrefs.filter((href) => /projects\/(?:hostlet|sandbox-factory)/i.test(href))).toEqual([]);
  });

  test("robots.txt responds with sitemap", async ({ page }) => {
    const response = await page.goto("/robots.txt");

    expect(response?.status()).toBe(200);
    const body = await page.locator("body").innerText();
    expect(body).toContain("User-agent: *");
    expect(body).toContain(
      "Sitemap: https://shanekanterman.dev/sitemap-index.xml",
    );
  });

  test("resume pdf is published", async ({ page }) => {
    const response = await page.request.get("/Kanterman_Resume.pdf");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
  });
});

import { test, expect } from "@playwright/test";

test.describe("utility routes", () => {
  test("Greenlit landing page renders its product promise", async ({
    page,
  }) => {
    const response = await page.goto("/greenlit");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("Greenlit — Run GitHub Actions locally");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Know your CI is green",
    );
    await expect(
      page.getByRole("heading", { name: "Less waiting. More shipping." }),
    ).toBeVisible();
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

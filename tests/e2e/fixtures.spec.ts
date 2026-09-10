import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => `file://${path.join(__dirname, "fixtures", name)}`;

test.describe("fixture pages load", () => {
  for (const pageName of ["simple.html", "form-heavy.html", "ecommerce.html", "spa.html"]) {
    test(pageName, async ({ page }) => {
      await page.goto(fixture(pageName));
      await expect(page.locator("body")).toBeVisible();
    });
  }
});

test("ecommerce search interaction", async ({ page }) => {
  await page.goto(fixture("ecommerce.html"));
  await page.fill("#search", "Laptop");
  await page.click("#search-btn");
  await expect(page.getByText("Laptop 16GB")).toBeVisible();
});

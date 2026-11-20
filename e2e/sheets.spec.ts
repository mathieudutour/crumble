import { expect, test } from "@playwright/test";
import { finger, makePlan } from "./helpers";

test("a dish's sheet opens over the shrunk page and closes with a swipe down or Escape", async ({
  page,
}) => {
  await makePlan(page);
  const open = async () => {
    await page.locator(".day .swipe-row .meal-row").first().click();
    await expect(page.locator(".page-indent[data-active]")).toHaveCount(1);
  };
  await open();
  const grabber = (await page.locator(".grabber").boundingBox())!;
  const x = grabber.x + grabber.width / 2;
  await (await finger(page)).drag({ x, y: grabber.y + 2 }, { x, y: grabber.y + 420 }, 12);
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page.locator(".page-indent[data-active]")).toHaveCount(0);

  await open();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sheet")).toHaveCount(0);
});

test("a recipe opens from « Recettes », with its ingredients", async ({ page }) => {
  await makePlan(page);
  await page.goto("/#recettes");
  await page.locator(".pick-open").first().click();
  await expect(page.locator(".sheet ul li").first()).toBeVisible();
  await page.locator(".sheet .x").first().click();
  await expect(page.locator(".sheet")).toHaveCount(0);
});

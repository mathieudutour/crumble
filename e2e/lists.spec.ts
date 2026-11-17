import { expect, test } from "@playwright/test";
import { finger, makePlan } from "./helpers";

test.beforeEach(async ({ page }) => {
  await makePlan(page);
});

test("a planned dish is taken off with a swipe, and « Annuler » puts it back", async ({ page }) => {
  const row = page.locator(".day .swipe-row").first();
  const dish = (await row.locator(".what").innerText()).trim();
  const touch = await finger(page);
  await touch.swipeLeft(row, 120);
  await row.locator(".swipe-action", { hasText: "Retirer" }).click();
  await expect(page.locator(".toast")).toContainText(`Retiré : ${dish}`);
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect(page.locator(".day .what", { hasText: dish }).first()).toBeVisible();
});

test("« Changer » from a swipe opens the dish picker", async ({ page }) => {
  const row = page.locator(".day .swipe-row").first();
  await (await finger(page)).swipeLeft(row, 120);
  await row.locator(".swipe-action", { hasText: "Changer" }).click();
  await expect(page.locator(".sheet")).toHaveCount(1);
  await expect(page.locator(".sheet h2")).toContainText("Que manger");
});

test("a full swipe on a shopping item moves it to « Toujours à la maison », undoably", async ({
  page,
}) => {
  await page.goto("/#courses");
  const first = page.locator(".swipe-row .item").first();
  const name = await first.locator(".nm").innerText();
  await (await finger(page)).swipeLeft(page.locator(".swipe-row").first(), 300);
  await expect(page.locator(".toast")).toContainText(`${name} : toujours à la maison`);
  await expect(page.locator(".pantry-toggle")).toContainText("(1)");
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect(page.locator(".pantry-toggle")).toHaveCount(0);
});

test("ticking a shopping item sinks it", async ({ page }) => {
  await page.goto("/#courses");
  const item = page.locator(".item-check").first();
  const name = await item.locator(".nm").innerText();
  await item.click();
  await expect(page.locator(".item.done .nm", { hasText: name })).toBeVisible();
});

test("a kept dish is set aside with a swipe, and « Annuler » keeps it again", async ({ page }) => {
  await page.goto("/#plats");
  const kept = page.getByRole("heading", { name: /Gardés/ });
  const before = await kept.innerText();
  await (await finger(page)).swipeLeft(page.locator(".swipe-row").first(), 300);
  await expect(page.locator(".toast")).toContainText("Écarté");
  await expect(kept).not.toHaveText(before);
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect(kept).toHaveText(before);
});

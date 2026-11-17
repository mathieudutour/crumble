import { expect, test } from "@playwright/test";
import { finger, makePlan } from "./helpers";

test("a dish is kept by swiping its card right, or with the arrow keys", async ({ page }) => {
  await page.goto("/");
  const undo = page.getByRole("button", { name: "Annuler" });
  await expect(undo).toBeDisabled();
  const card = page.locator(".card").last();
  const box = (await card.boundingBox())!;
  const touch = await finger(page);
  await touch.drag(
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + box.width + 120, y: box.y + box.height / 2 },
  );
  await expect(undo).toBeEnabled();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".card")).not.toHaveCount(0);
});

test("keeping enough dishes makes the week's plan and its shopping list", async ({ page }) => {
  await makePlan(page);
  await expect(page.locator(".day")).toHaveCount(7);
  await page.locator(".cta", { hasText: "Voir la liste de courses" }).click();
  await expect(page).toHaveURL(/#courses$/);
  await expect.poll(() => page.locator(".item").count()).toBeGreaterThan(5);
});

import { expect, type Locator, type Page } from "@playwright/test";

/** Keeps dishes until the plan can be made, makes it, and lands on « Planning ». */
export async function makePlan(page: Page) {
  await page.goto("/");
  const cta = page.locator(".cta", { hasText: /Créer mon planning|Encore/ });
  for (let i = 0; i < 60 && !(await cta.innerText()).includes("Créer"); i++) {
    await page.getByRole("button", { name: "Garder" }).click();
    // The card flies off before the next one can be decided.
    await page.waitForTimeout(80);
  }
  await page.locator(".cta", { hasText: "Créer mon planning" }).click();
  await expect(page).toHaveURL(/#planning$/);
}

/** A finger on the screen, through the DevTools protocol (Chromium). */
export async function finger(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  return {
    /** Puts the finger down at `from`, then moves to `to` in steps and lifts it. */
    async drag(from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) {
      await send("touchStart", from.x, from.y);
      for (let i = 1; i <= steps; i++) {
        await send(
          "touchMove",
          from.x + ((to.x - from.x) * i) / steps,
          from.y + ((to.y - from.y) * i) / steps,
        );
        await page.waitForTimeout(16);
      }
      await send("touchEnd");
    },
    /** Swipes a row left by `distance` from near its right edge (scrolled into view first: touches off screen are lost). */
    async swipeLeft(row: Locator, distance: number) {
      await row.scrollIntoViewIfNeeded();
      const box = (await row.boundingBox())!;
      const y = box.y + box.height / 2;
      const x = box.x + box.width - 30;
      await this.drag({ x, y }, { x: x - distance, y }, 8);
    },
  };
}

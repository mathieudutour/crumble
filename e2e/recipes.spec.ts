import { expect, test } from "@playwright/test";
import { makePlan } from "./helpers";

const group = (page: import("@playwright/test").Page, title: string) =>
  page.locator(".recipe-group").filter({ has: page.getByRole("heading", { name: new RegExp(`^${title}`) }) });

test("« Recettes » lists every recipe by course, and finds them by name or ingredient", async ({ page }) => {
  // Old links to « Plats » land here.
  await page.goto("/#plats");
  await expect(page.getByRole("heading", { name: /^Plats \(\d+\)/ })).toBeVisible();
  for (const title of ["Entrées", "Desserts", "Écartés"])
    await expect(page.getByRole("heading", { name: new RegExp(`^${title}`) })).toBeVisible();

  const all = await group(page, "Plats").locator(".pick").count();
  await page.getByLabel("Chercher une recette").fill("moules frites");
  await expect(group(page, "Plats").locator(".pick")).toHaveCount(1);
  await expect(group(page, "Plats")).toContainText("Moules-frites");
  expect(all).toBeGreaterThan(100);
  await page.getByLabel("Chercher une recette").fill("celeri");
  await expect(group(page, "Plats")).toContainText("Cabillaud au four");
  await page.getByLabel("Chercher une recette").fill("zzz");
  await expect(page.getByText("Aucune recette ne correspond.")).toBeVisible();
});

test("a dessert of the house goes with a meal of the planning, and onto the shopping list", async ({ page }) => {
  await page.goto("/#recettes");
  await group(page, "Desserts").getByRole("button", { name: "+ Ajouter un dessert" }).click();
  // The form opens as a dessert.
  await expect(page.getByRole("radio", { name: "Dessert" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Nom").fill("Mousse au chocolat");
  await page.getByLabel("Ingrédient").first().fill("Chocolat noir");
  await page.locator(".sheet .cta", { hasText: "Ajouter la recette" }).click();
  await expect(group(page, "Desserts")).toContainText("Mousse au chocolat");

  // No plan yet: adding makes one.
  await page.getByRole("button", { name: "Ajouter Mousse au chocolat au planning" }).click();
  await page.locator(".slot-choice:not(:disabled)").last().click();
  await expect(page.locator(".toast")).toContainText("Mousse au chocolat");
  await page.goto("/#planning");
  await expect(page.locator(".slot-extras")).toContainText("Mousse au chocolat");
  await page.goto("/#courses");
  await expect(page.locator(".item-check", { hasText: "Chocolat noir" })).toBeVisible();
});

test("a main dish from « Recettes » takes the meal it's added to", async ({ page }) => {
  await makePlan(page);
  const planned = page.locator(".meal .what", { hasText: "Moules-frites" });
  const before = await planned.count();
  await page.goto("/#recettes");
  await page.getByLabel("Chercher une recette").fill("Moules-frites");
  await page.getByRole("button", { name: "Ajouter Moules-frites au planning" }).click();
  await page.locator(".slot-choice:not(:disabled)").last().click();
  await page.goto("/#planning");
  await expect.poll(() => planned.count()).toBeGreaterThan(before);
  await page.goto("/#courses");
  await expect(page.locator(".item-check", { hasText: "Moules" })).toBeVisible();
});

import { describe, expect, it } from "vitest";
import { makeCatalogue } from "../lib/catalogue";
import { freshHousehold, householdReducer } from "../shared/household";
import type { Action, AppState } from "../store/store";
import { createTools, type Tool } from "./tools";

// Thursday 12 November 2026: "this" week starts on the 9th, "next" on the 16th.
const NOW = new Date(2026, 10, 12, 18, 0);
const NEXT = "2026-11-16";

function setup() {
  let state: AppState = {
    ...freshHousehold(
      makeCatalogue().swipeable.map((m) => m.id),
      NEXT,
    ),
    swipes: [],
  };
  const notices: string[] = [];
  const tools = createTools({
    getState: () => state,
    dispatch: (action: Action) => {
      if (action.type !== "undo") state = { ...householdReducer(state, action), swipes: state.swipes };
    },
    notify: (message) => notices.push(message),
    now: () => NOW,
  });
  const byName = new Map(tools.map((t) => [t.name, t]));
  const call = (name: string, input: Record<string, unknown> = {}) =>
    (byName.get(name) as Tool).execute(input) as Promise<any>;
  return { tools, call, notices, state: () => state };
}

/** Likes dishes until a plan can be drawn. */
async function likeEnough(call: ReturnType<typeof setup>["call"]) {
  for (const type of ["dinner", "lunch"]) {
    const { dishes } = await call("search_dishes", { type, limit: 8 });
    for (const dish of dishes) await call("set_dish_preference", { dish_id: dish.id, preference: "like" });
  }
}

describe("WebMCP tools", () => {
  it("have valid, unique names, a title, a description and an object schema", () => {
    const { tools } = setup();
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      expect(tool.title && tool.description).toBeTruthy();
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }
  });

  it("plan a week from liked dishes", async () => {
    const { call, notices } = setup();
    expect(await call("get_week_plan")).toMatchObject({ plan: null, can_generate: false });
    await expect(call("generate_week_plan")).rejects.toThrow(/Not enough liked dishes/);
    await likeEnough(call);
    const plan = await call("generate_week_plan");
    expect(plan.days).toHaveLength(7);
    expect(plan.days[2].soir).toMatchObject({ status: "cook", dish_id: "pesto", habit: true });
    expect(notices).toContain("🤖 Nouveau planning");
  });

  it("change, move and lock meals, refusing dishes that don't fit", async () => {
    const { call } = setup();
    await likeEnough(call);
    await call("generate_week_plan");
    const changed = await call("set_meal", { day: "lundi", meal: "soir", dish_id: "chili" });
    expect(changed.days[0].soir).toMatchObject({ dish_id: "chili", locked: true });
    await expect(call("set_meal", { day: "lundi", meal: "soir", dish_id: "saladegrecque" })).rejects.toThrow(
      /lunch dish/,
    );
    await expect(call("set_meal", { day: "funday", meal: "soir", dish_id: "chili" })).rejects.toThrow(/Unknown day/);
    const moved = await call("move_meal", { from_day: "lundi", from_meal: "soir", to_day: "jeudi", to_meal: "soir" });
    expect(moved.days[3].soir).toMatchObject({ dish_id: "chili" });
    const unlocked = await call("lock_meal", { day: "jeudi", meal: "soir", locked: false });
    expect(unlocked.days[3].soir.locked).toBe(false);
    const cleared = await call("set_meal", { day: "jeudi", meal: "soir", dish_id: null });
    expect(cleared.days[3].soir.status).toBe("free");
  });

  it("tick shopping items and keep staples at home", async () => {
    const { call } = setup();
    await likeEnough(call);
    await call("generate_week_plan");
    const list = await call("get_shopping_list");
    const first = list.aisles[0].items[0].name;
    expect(await call("check_shopping_items", { items: [first.toUpperCase(), "licorne"] })).toEqual({
      checked: [first],
      not_on_the_list: ["licorne"],
    });
    expect(
      (await call("get_shopping_list")).aisles[0].items.find((i: { name: string }) => i.name === first).checked,
    ).toBe(true);
    await call("set_always_at_home", { ingredient: "oignons", at_home: true });
    expect((await call("get_shopping_list")).always_at_home).toContain("Oignons");
  });

  it("set up the household: diners, habits, diet and allergies", async () => {
    const { call, state } = setup();
    await call("set_diners", { day: "all", meal: "soir", adults: 3 });
    expect(
      state()
        .diners.filter((_, slot) => slot % 2 === 1)
        .every((d) => d.adults === 3),
    ).toBe(true);
    await call("set_habit", { day: "vendredi", meal: "soir", dish_id: "pizza" });
    expect((await call("get_household")).habits).toContainEqual({
      day: "vendredi",
      meal: "soir",
      dish_id: "pizza",
      dish: "Pizza maison jambon-champignons",
    });
    const diet = await call("update_diet", {
      vegetarian: true,
      avoid_add: ["oeufs", "kryptonite"],
      weeknight_dinner_max_minutes: 30,
    });
    expect(diet).toMatchObject({
      avoid: ["Œufs"],
      unknown_ingredients: ["kryptonite"],
      weeknight_dinner_max_minutes: 30,
    });
    const { dishes } = await call("search_dishes", { limit: 120 });
    expect(dishes.every((d: { vegetarian: boolean }) => d.vegetarian)).toBe(true);
  });

  it("add the household's own dish, ready to plan", async () => {
    const { call } = setup();
    const dish = await call("add_own_dish", {
      name: "Gratin de courgettes de mamie",
      type: "dinner",
      minutes: 45,
      ingredients: [
        { name: "Courgettes", quantity: 4 },
        { name: "Emmental râpé", quantity: 100, unit: "g" },
      ],
      steps: ["Coupe {4 courgettes}.", "Enfourne 30 min."],
    });
    expect(dish).toMatchObject({ household: "liked", own_dish: true, time: "45 min" });
    expect((await call("get_recipe", { dish_id: dish.id })).steps).toEqual(["Coupe 4 courgettes.", "Enfourne 30 min."]);
  });

  it("scale a recipe to its meal in the plan", async () => {
    const { call } = setup();
    await likeEnough(call);
    await call("generate_week_plan");
    await call("set_diners", { day: "lundi", meal: "soir", adults: 4, kids: 2 });
    await call("set_meal", { day: "lundi", meal: "soir", dish_id: "cabillaud" });
    const recipe = await call("get_recipe", { dish_id: "cabillaud", day: "lundi", meal: "soir" });
    expect(recipe.servings).toBe("5 portions, leftovers included");
    expect(recipe.ingredients[0]).toEqual({ name: "Dos de cabillaud", quantity: "800 g" });
  });
});

// Tools an AI agent can call to use Crumble, through WebMCP (see ./register.ts). They read the same state and send the
// same actions as the app's buttons, so an agent's changes show up at once and sync to the rest of the household.

import { AISLE_NAMES } from "../data/aisles";
import { fitsDiet, hasFish, hasPork, isVegetarian } from "../data/diet";
import type { Ingredient, Meal, MealType } from "../data/types";
import { avoidedIn, avoidOptions, normalize } from "../lib/avoid";
import { makeCatalogue, recipeSteps, type Catalogue } from "../lib/catalogue";
import { COUNT_UNITS, dinersText, formatQuantity } from "../lib/format";
import { canMove } from "../lib/planEdit";
import { DAYS, fitsSlot, hasLeftovers, isTooLong, scaleQuantity, slotIndex, type CookSlot } from "../lib/planning";
import { seasonLabel } from "../lib/season";
import { shoppingList, splitPantry } from "../lib/shopping";
import { stepText } from "../lib/steps";
import { mealTimeLabel } from "../lib/time";
import { addDays, mondayOf, weekName, weekRange } from "../lib/week";
import { drawPlan } from "../store/plan";
import { counts, isAvailable, isReady, planKey, required } from "../store/selectors";
import type { Action, AppState } from "../store/store";

/** What the tools need from the app. */
export interface CrumbleApi {
  getState: () => AppState;
  dispatch: (action: Action) => void;
  /** Tells the person what the agent just did. */
  notify: (message: string) => void;
  now: () => Date;
}

/** A WebMCP tool (`ModelContextTool` in the spec). */
export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

const DAY_NAMES = DAYS.map((d) => d.toLowerCase());
const MEALS = ["midi", "soir"] as const;
type MealName = (typeof MEALS)[number];

// ---------- Input schemas ----------

const day = { type: "string", enum: DAY_NAMES, description: "Day of the week, in French." };
const meal = { type: "string", enum: MEALS, description: "« midi » for lunch, « soir » for dinner." };
const week = {
  type: "string",
  enum: ["this", "next"],
  description: "This week or next week. Defaults to the week currently being planned in the app.",
};
const dishId = { type: "string", description: "A dish id, as returned by search_dishes." };
const object = (properties: Record<string, object>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

// ---------- Helpers ----------

class ToolError extends Error {}

function slotOf(input: Record<string, unknown>, dayKey = "day", mealKey = "meal"): number {
  const d = DAY_NAMES.indexOf(String(input[dayKey]).toLowerCase());
  const m = MEALS.indexOf(String(input[mealKey]).toLowerCase() as MealName);
  if (d < 0) throw new ToolError(`Unknown day "${input[dayKey]}": use one of ${DAY_NAMES.join(", ")}.`);
  if (m < 0) throw new ToolError(`Unknown meal "${input[mealKey]}": use « midi » or « soir ».`);
  return slotIndex(d, m === 1);
}

const slotLabel = (slot: number) => ({ day: DAY_NAMES[Math.floor(slot / 2)]!, meal: MEALS[slot % 2]! });

const TYPES: Record<Exclude<MealType, "fixed">, string> = {
  dinner: "dinner",
  lunch: "lunch",
  either: "lunch or dinner",
};

function dishSummary(state: AppState, meal: Meal) {
  return {
    id: meal.id,
    name: meal.name,
    type: meal.type === "fixed" ? "habit only" : TYPES[meal.type],
    time: meal.time,
    makes_two_meals: !!meal.batch,
    season: seasonLabel(meal),
    in_season_and_allowed: isAvailable(state, meal),
    vegetarian: isVegetarian(meal),
    pork: hasPork(meal),
    fish: hasFish(meal),
    household: state.liked.includes(meal.id) ? "liked" : state.noped.includes(meal.id) ? "passed" : "not decided",
    rating: state.ratings[meal.id] === 1 ? "love" : state.ratings[meal.id] === -1 ? "meh" : undefined,
    kids_like: !!state.kidsLike[meal.id] || undefined,
    own_dish: !!meal.custom || undefined,
  };
}

function getDish(catalogue: Catalogue, id: unknown): Meal {
  const meal = typeof id === "string" ? catalogue.get(id) : undefined;
  if (!meal) throw new ToolError(`No dish with id "${id}". Use search_dishes to find ids.`);
  return meal;
}

export function createTools(api: CrumbleApi): Tool[] {
  const context = () => {
    const state = api.getState();
    return { state, catalogue: makeCatalogue(state.customMeals) };
  };

  /** The Monday of the requested week; selects it in the app when it's the week being planned. */
  const weekOf = (input: Record<string, unknown>, select: boolean): string => {
    const thisMonday = mondayOf(api.now());
    const requested =
      input.week === "this" ? thisMonday : input.week === "next" ? addDays(thisMonday, 7) : api.getState().week;
    if (select && requested !== api.getState().week) api.dispatch({ type: "setWeek", week: requested });
    return requested;
  };

  const describePlan = (weekStart: string) => {
    const { state, catalogue } = context();
    const plan = state.plans[weekStart];
    const header = { week: weekStart, label: `${weekName(weekStart, api.now())}, ${weekRange(weekStart)}` };
    if (!plan) {
      const have = counts(state, catalogue);
      const need = required(state, catalogue);
      return {
        ...header,
        plan: null,
        can_generate: isReady(state, catalogue),
        liked: have,
        needed: need,
        hint: "Like enough dishes (set_dish_preference), then generate_week_plan.",
      };
    }
    const describeSlot = (slot: number) => {
      const entry = plan.slots[slot]!;
      const diners = dinersText(state.diners[slot]!);
      if (entry.kind === "none") return { status: "nobody home" };
      if (entry.kind === "free") return { status: "free", diners };
      const dish = catalogue.get(entry.mealId);
      if (entry.kind === "leftovers")
        return { status: "leftovers", dish_id: entry.mealId, dish: dish?.name, from: slotLabel(entry.from), diners };
      return {
        status: "cook",
        dish_id: entry.mealId,
        dish: dish?.name,
        time: dish?.time,
        diners,
        portions: entry.portions,
        locked: !!entry.locked,
        habit: !!entry.habit,
        also_cooks_leftovers: hasLeftovers(plan.slots, slot),
        too_long_for_a_weeknight: dish ? isTooLong(dish, slot, state.settings.weeknightMinutes) : false,
        contains_avoided: dish ? avoidedIn(dish, state.settings.avoid) : [],
      };
    };
    return {
      ...header,
      out_of_date: weekStart === state.week && plan.key !== planKey(state, catalogue),
      days: DAYS.map((name, d) => ({
        day: name.toLowerCase(),
        date: addDays(weekStart, d),
        midi: describeSlot(slotIndex(d, false)),
        soir: describeSlot(slotIndex(d, true)),
      })),
    };
  };

  const requirePlan = (weekStart: string) => {
    const plan = api.getState().plans[weekStart];
    if (!plan) throw new ToolError("There is no plan for that week yet: call generate_week_plan first.");
    return plan;
  };

  const tool = (definition: Omit<Tool, "execute"> & { run: (input: Record<string, unknown>) => unknown }): Tool => ({
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: definition.annotations,
    execute: async (input) => definition.run(input ?? {}),
  });

  const read = { readOnlyHint: true };

  return [
    // ---------- Reading ----------
    tool({
      name: "get_week_plan",
      title: "Voir le planning",
      description:
        "Get the week's meal plan: for each day, lunch (midi) and dinner (soir), with the dish to cook, leftovers, or nothing. Also says whether a plan can be generated.",
      inputSchema: object({ week }),
      annotations: read,
      run: (input) => describePlan(weekOf(input, false)),
    }),
    tool({
      name: "get_shopping_list",
      title: "Voir la liste de courses",
      description:
        "Get the shopping list for the week's plan, grouped by aisle, with quantities and which items are already ticked. Ingredients the household always has at home are listed apart.",
      inputSchema: object({ week }),
      annotations: read,
      run: (input) => {
        const weekStart = weekOf(input, false);
        const { state, catalogue } = context();
        const plan = requirePlan(weekStart);
        const { toBuy, atHome } = splitPantry(shoppingList(plan.slots, catalogue.get), state.pantry);
        return {
          week: weekStart,
          aisles: toBuy.map(({ aisle, items }) => ({
            aisle: AISLE_NAMES[aisle],
            items: items.map((i) => ({
              name: i.name,
              quantity: formatQuantity(i.quantity, i.unit),
              checked: !!plan.checked[i.key],
            })),
          })),
          always_at_home: atHome.map((i) => i.name),
        };
      },
    }),
    tool({
      name: "search_dishes",
      title: "Chercher des plats",
      description:
        "Search the household's dishes (built-in and their own) by name or ingredient. By default only dishes in season for the planned week and allowed by the household's diet are returned.",
      inputSchema: object({
        query: {
          type: "string",
          description: "Words to look for in the dish name or its ingredients. Leave empty to list.",
        },
        type: { type: "string", enum: ["lunch", "dinner"], description: "Only dishes that can be served then." },
        household: {
          type: "string",
          enum: ["liked", "passed", "not decided"],
          description: "Filter by the household's choice.",
        },
        include_unavailable: {
          type: "boolean",
          description: "Also return dishes out of season or excluded by the diet.",
        },
        limit: { type: "integer", minimum: 1, maximum: 120, description: "Defaults to 30." },
      }),
      annotations: read,
      run: (input) => {
        const { state, catalogue } = context();
        const words = normalize(String(input.query ?? ""))
          .split(" ")
          .filter(Boolean);
        const matches = catalogue.swipeable
          .filter((m) => input.include_unavailable === true || isAvailable(state, m))
          .filter((m) => !input.type || (input.type === "lunch" ? m.type !== "dinner" : m.type !== "lunch"))
          .filter((m) => {
            if (!words.length) return true;
            const text = normalize([m.name, ...m.ingredients.map(([n]) => n)].join(" "));
            return words.every((w) => text.includes(w));
          })
          .map((m) => dishSummary(state, m))
          .filter((d) => !input.household || d.household === input.household);
        const limit = Math.min(120, Math.max(1, Number(input.limit) || 30));
        return { total: matches.length, dishes: matches.slice(0, limit) };
      },
    }),
    tool({
      name: "get_recipe",
      title: "Voir une recette",
      description:
        "Get a dish's ingredients and steps. Give a day and meal of the plan to get quantities scaled to that meal's portions (leftovers included); otherwise quantities are for the base recipe.",
      inputSchema: object({ dish_id: dishId, day, meal, week }),
      annotations: read,
      run: (input) => {
        const { state, catalogue } = context();
        const dish = getDish(catalogue, input.dish_id);
        let slot: CookSlot | undefined;
        if (input.day || input.meal) {
          const entry = state.plans[weekOf(input, false)]?.slots[slotOf(input)];
          if (entry?.kind === "cook" && entry.mealId === dish.id) slot = entry;
        }
        const factor = slot?.factor ?? 1;
        return {
          ...dishSummary(state, dish),
          servings: slot ? `${slot.portions} portions, leftovers included` : "base recipe",
          ingredients: dish.ingredients.map(([name, quantity, unit]) => ({
            name,
            quantity: formatQuantity(scaleQuantity(quantity, unit, factor), unit),
          })),
          steps: recipeSteps(dish).map((step) => stepText(step, factor)),
          note: "Plus salt, pepper and oil.",
        };
      },
    }),
    tool({
      name: "get_household",
      title: "Voir le foyer",
      description:
        "Get the household settings: who eats at home for each meal, weekly habits, diet, ingredients to avoid, the weekday dinner time limit, and whether the household is shared between phones.",
      inputSchema: object({}),
      annotations: read,
      run: () => {
        const { state, catalogue } = context();
        return {
          diners: DAYS.map((name, d) => ({
            day: name.toLowerCase(),
            midi: state.diners[slotIndex(d, false)],
            soir: state.diners[slotIndex(d, true)],
          })),
          habits: state.settings.habits.map((h) => ({
            ...slotLabel(h.slot),
            dish_id: h.mealId,
            dish: catalogue.get(h.mealId)?.name,
          })),
          diet: state.settings.diet,
          avoid: state.settings.avoid,
          weeknight_dinner_max_minutes: state.settings.weeknightMinutes,
          planning_week: state.week,
        };
      },
    }),

    // ---------- Choosing dishes ----------
    tool({
      name: "set_dish_preference",
      title: "Garder ou écarter un plat",
      description:
        "Like a dish (it can then be planned), pass on it, or reset it to undecided. Same as swiping right or left in the app.",
      inputSchema: object({ dish_id: dishId, preference: { type: "string", enum: ["like", "pass", "undecided"] } }, [
        "dish_id",
        "preference",
      ]),
      run: (input) => {
        const { catalogue } = context();
        const dish = getDish(catalogue, input.dish_id);
        const action: Action =
          input.preference === "like"
            ? { type: "like", id: dish.id }
            : input.preference === "pass"
              ? { type: "unlike", id: dish.id }
              : { type: "unswipe", id: dish.id };
        api.dispatch(action);
        api.notify(
          `🤖 ${dish.name} : ${input.preference === "like" ? "gardé" : input.preference === "pass" ? "écarté" : "à revoir"}`,
        );
        const after = context();
        return {
          dish: dish.name,
          liked: counts(after.state, after.catalogue),
          needed: required(after.state, after.catalogue),
          can_generate_plan: isReady(after.state, after.catalogue),
        };
      },
    }),
    tool({
      name: "rate_dish",
      title: "Noter un plat",
      description:
        "Record how the household liked a dish after eating it. « love » brings it forward in the deck and the plans, « meh » pushes it back. kids_like favours it for meals with children.",
      inputSchema: object(
        { dish_id: dishId, rating: { type: "string", enum: ["love", "meh", "none"] }, kids_like: { type: "boolean" } },
        ["dish_id"],
      ),
      run: (input) => {
        const { catalogue } = context();
        const dish = getDish(catalogue, input.dish_id);
        if (input.rating)
          api.dispatch({
            type: "rate",
            id: dish.id,
            rating: input.rating === "love" ? 1 : input.rating === "meh" ? -1 : null,
          });
        if (typeof input.kids_like === "boolean")
          api.dispatch({ type: "setKidsLike", id: dish.id, value: input.kids_like });
        api.notify(`🤖 Note enregistrée : ${dish.name}`);
        return dishSummary(api.getState(), dish);
      },
    }),
    tool({
      name: "add_own_dish",
      title: "Ajouter un plat de la maison",
      description:
        "Add one of the household's own recipes. It is liked straight away, so it can be planned. Quantities are for about 2.5 portions, or 5 when it makes two meals. In steps, wrap quantities that should follow the portions in braces, like « {3 œufs} » or « {200 g} ».",
      inputSchema: object(
        {
          name: { type: "string" },
          type: { type: "string", enum: ["dinner", "lunch", "either"] },
          minutes: { type: "integer", minimum: 1, description: "Total time." },
          active_minutes: { type: "integer", minimum: 1, description: "Hands-on time, if less than the total." },
          makes_two_meals: { type: "boolean", description: "The plan then books leftovers for the next meal." },
          months: {
            type: "array",
            items: { type: "integer", minimum: 1, maximum: 12 },
            description: "Months in season. Defaults to all year.",
          },
          emoji: { type: "string" },
          ingredients: {
            type: "array",
            items: object(
              {
                name: {
                  type: "string",
                  description: "Prefer names already used by other dishes, so they land in the right aisle.",
                },
                quantity: { type: "number" },
                unit: { type: "string", enum: ["", "g", "cl", ...COUNT_UNITS] },
              },
              ["name"],
            ),
          },
          steps: { type: "array", items: { type: "string" } },
        },
        ["name", "type", "minutes", "ingredients", "steps"],
      ),
      run: (input) => {
        const name = String(input.name ?? "").trim();
        if (!name) throw new ToolError("The dish needs a name.");
        const ingredients = (Array.isArray(input.ingredients) ? input.ingredients : []).flatMap((raw): Ingredient[] => {
          const i = raw as { name?: unknown; quantity?: unknown; unit?: unknown };
          const unit = typeof i.unit === "string" && ["", "g", "cl", ...COUNT_UNITS].includes(i.unit) ? i.unit : "";
          return typeof i.name === "string" && i.name.trim()
            ? [[i.name.trim(), Number(i.quantity) > 0 ? Number(i.quantity) : 1, unit]]
            : [];
        });
        const months = Array.isArray(input.months)
          ? input.months.filter((m): m is number => Number.isInteger(m) && m >= 1 && m <= 12)
          : [];
        const minutes = Math.max(1, Math.round(Number(input.minutes) || 30));
        const active = Math.round(Number(input.active_minutes) || 0);
        const id = `perso-${api.now().getTime().toString(36)}`;
        api.dispatch({
          type: "saveMeal",
          meal: {
            id,
            name,
            emoji: typeof input.emoji === "string" && input.emoji.trim() ? input.emoji.trim() : "🍽",
            type: input.type === "lunch" || input.type === "either" ? input.type : "dinner",
            time: mealTimeLabel(minutes, active || undefined),
            batch: input.makes_two_meals === true || undefined,
            ingredients,
            months: months.length ? months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            steps: (Array.isArray(input.steps) ? input.steps : []).map(String).filter((s) => s.trim()),
            custom: true,
          },
        });
        const dish = context().catalogue.get(id);
        if (!dish) throw new ToolError("The dish could not be saved.");
        api.notify(`🤖 Nouveau plat : ${name}`);
        return dishSummary(api.getState(), dish);
      },
    }),

    // ---------- Planning ----------
    tool({
      name: "select_week",
      title: "Choisir la semaine",
      description:
        "Choose which week the app plans: this week or next week. The deck shows the dishes in season for that week.",
      inputSchema: object({ week }, ["week"]),
      run: (input) => {
        const weekStart = weekOf(input, true);
        api.notify(`🤖 ${weekName(weekStart, api.now())}`);
        return describePlan(weekStart);
      },
    }),
    tool({
      name: "generate_week_plan",
      title: "Tirer le planning",
      description:
        "Draw a new plan for the week from the liked dishes, the household's habits and settings. Meals that are locked are kept; every other meal is replaced.",
      inputSchema: object({ week }),
      annotations: { consequentialHint: true },
      run: (input) => {
        const weekStart = weekOf(input, true);
        const { state, catalogue } = context();
        if (!isReady(state, catalogue)) {
          const need = required(state, catalogue);
          const have = counts(state, catalogue);
          throw new ToolError(
            `Not enough liked dishes: ${have.dinners}/${need.dinners} dinners and ${have.lunches}/${need.lunches} lunches. Like more with set_dish_preference.`,
          );
        }
        api.dispatch(drawPlan(state, catalogue, api.now()));
        api.notify("🤖 Nouveau planning");
        return describePlan(weekStart);
      },
    }),
    tool({
      name: "set_meal",
      title: "Changer un repas",
      description:
        "Put a dish on a meal of the plan, or clear it with dish_id null. The dish is locked, so a new draw keeps it. A dish that makes two meals books its leftovers too.",
      inputSchema: object(
        { day, meal, dish_id: { type: ["string", "null"], description: "A dish id, or null to plan nothing." }, week },
        ["day", "meal", "dish_id"],
      ),
      run: (input) => {
        const weekStart = weekOf(input, false);
        requirePlan(weekStart);
        const slot = slotOf(input);
        const where = `${input.day} ${input.meal}`;
        if (input.dish_id === null) {
          api.dispatch({ type: "clearSlot", week: weekStart, slot });
          api.notify(`🤖 ${where} : rien de prévu`);
        } else {
          const dish = getDish(context().catalogue, input.dish_id);
          if (!fitsSlot(dish, slot))
            throw new ToolError(
              `${dish.name} is a ${TYPES[dish.type as keyof typeof TYPES]} dish; it can't go on ${where}.`,
            );
          api.dispatch({ type: "placeMeal", week: weekStart, slot, mealId: dish.id });
          api.notify(`🤖 ${where} : ${dish.name}`);
        }
        return describePlan(weekStart);
      },
    }),
    tool({
      name: "move_meal",
      title: "Déplacer un repas",
      description:
        "Move a planned dish to another meal of the week. If a dish is already planned there, the two swap. Leftovers follow the dish.",
      inputSchema: object({ from_day: day, from_meal: meal, to_day: day, to_meal: meal, week }, [
        "from_day",
        "from_meal",
        "to_day",
        "to_meal",
      ]),
      run: (input) => {
        const weekStart = weekOf(input, false);
        const plan = requirePlan(weekStart);
        const from = slotOf(input, "from_day", "from_meal");
        const to = slotOf(input, "to_day", "to_meal");
        if (!canMove(plan.slots, from, to, context().catalogue.get)) {
          throw new ToolError(
            "That move isn't possible: the first meal must have a dish to cook, and each dish must fit its new meal (lunch or dinner).",
          );
        }
        api.dispatch({ type: "moveMeal", week: weekStart, from, to });
        api.notify(`🤖 Repas déplacé vers ${input.to_day} ${input.to_meal}`);
        return describePlan(weekStart);
      },
    }),
    tool({
      name: "lock_meal",
      title: "Verrouiller un repas",
      description: "Lock a planned dish so a new draw keeps it, or unlock it.",
      inputSchema: object({ day, meal, locked: { type: "boolean" }, week }, ["day", "meal", "locked"]),
      run: (input) => {
        const weekStart = weekOf(input, false);
        const plan = requirePlan(weekStart);
        const slot = slotOf(input);
        if (plan.slots[slot]?.kind !== "cook") throw new ToolError("Only a meal with a dish to cook can be locked.");
        api.dispatch({ type: "setLock", week: weekStart, slot, locked: input.locked === true });
        api.notify(`🤖 ${input.day} ${input.meal} : ${input.locked ? "verrouillé" : "déverrouillé"}`);
        return describePlan(weekStart);
      },
    }),

    // ---------- Shopping ----------
    tool({
      name: "check_shopping_items",
      title: "Cocher des courses",
      description: "Tick (or untick) items of the week's shopping list, by ingredient name.",
      inputSchema: object(
        {
          items: { type: "array", items: { type: "string" }, minItems: 1 },
          checked: { type: "boolean", description: "Defaults to true." },
          week,
        },
        ["items"],
      ),
      run: (input) => {
        const weekStart = weekOf(input, false);
        const plan = requirePlan(weekStart);
        const list = shoppingList(plan.slots, context().catalogue.get).flatMap((g) => g.items);
        const value = input.checked !== false;
        const done: string[] = [];
        const unknown: string[] = [];
        for (const name of Array.isArray(input.items) ? input.items.map(String) : []) {
          const matches = list.filter((item) => normalize(item.name) === normalize(name));
          if (!matches.length) unknown.push(name);
          for (const item of matches) {
            api.dispatch({ type: "setChecked", week: weekStart, key: item.key, value });
            done.push(item.name);
          }
        }
        if (done.length)
          api.notify(
            `🤖 ${done.length} article${done.length > 1 ? "s" : ""} ${value ? "coché" : "décoché"}${done.length > 1 ? "s" : ""}`,
          );
        return { [value ? "checked" : "unchecked"]: done, not_on_the_list: unknown };
      },
    }),
    tool({
      name: "set_always_at_home",
      title: "Toujours à la maison",
      description:
        "Mark an ingredient as always at home (it leaves the shopping list, this week and the next) or put it back on the list.",
      inputSchema: object({ ingredient: { type: "string" }, at_home: { type: "boolean" } }, ["ingredient", "at_home"]),
      run: (input) => {
        const { catalogue } = context();
        const wanted = normalize(String(input.ingredient));
        const name = catalogue.all.flatMap((m) => m.ingredients.map(([n]) => n)).find((n) => normalize(n) === wanted);
        if (!name) throw new ToolError(`No dish uses "${input.ingredient}".`);
        api.dispatch({ type: "setPantry", name, value: input.at_home === true });
        api.notify(`🤖 ${name} : ${input.at_home ? "toujours à la maison" : "remis dans la liste"}`);
        return { ingredient: name, always_at_home: input.at_home === true };
      },
    }),

    // ---------- Household ----------
    tool({
      name: "set_diners",
      title: "Qui mange quand",
      description:
        "Set how many adults and children eat at home for a meal, or for every day at once (day « all »). 0 adults and 0 children means nobody is home: the meal isn't planned. The current plan adjusts its quantities right away.",
      inputSchema: object(
        {
          day: { type: "string", enum: [...DAY_NAMES, "all"] },
          meal: { type: "string", enum: [...MEALS, "both"] },
          adults: { type: "integer", minimum: 0, maximum: 12 },
          kids: { type: "integer", minimum: 0, maximum: 12 },
        },
        ["day", "meal"],
      ),
      run: (input) => {
        const days = input.day === "all" ? DAY_NAMES : [String(input.day)];
        const meals = input.meal === "both" ? [...MEALS] : [String(input.meal)];
        for (const d of days) {
          for (const m of meals) {
            const slot = slotOf({ day: d, meal: m });
            if (typeof input.adults === "number")
              api.dispatch({ type: "setDiners", slot, field: "adults", value: input.adults });
            if (typeof input.kids === "number")
              api.dispatch({ type: "setDiners", slot, field: "kids", value: input.kids });
          }
        }
        api.notify("🤖 Convives mis à jour");
        return householdSettings(api, "diners");
      },
    }),
    tool({
      name: "set_habit",
      title: "Habitude de la semaine",
      description:
        "Make a dish a weekly habit for a given meal (e.g. pasta every Wednesday evening), or remove the habit with dish_id null.",
      inputSchema: object({ day, meal, dish_id: { type: ["string", "null"] } }, ["day", "meal", "dish_id"]),
      run: (input) => {
        const slot = slotOf(input);
        const { state, catalogue } = context();
        const others = state.settings.habits.filter((h) => h.slot !== slot);
        if (input.dish_id === null) {
          api.dispatch({ type: "setSettings", settings: { habits: others } });
          api.notify(`🤖 Habitude retirée : ${input.day} ${input.meal}`);
        } else {
          const dish = getDish(catalogue, input.dish_id);
          api.dispatch({
            type: "setSettings",
            settings: { habits: [...others, { slot, mealId: dish.id }].sort((a, b) => a.slot - b.slot) },
          });
          api.notify(`🤖 Habitude : ${dish.name}, ${input.day} ${input.meal}`);
        }
        return householdSettings(api, "habits");
      },
    }),
    tool({
      name: "update_diet",
      title: "Régime et ingrédients à éviter",
      description:
        "Change the household's diet (vegetarian, no pork, no fish), ingredients to avoid (dislikes or allergies: dishes containing them are left out), or the longest weekday dinner in minutes (null for no limit). Only the given fields change.",
      inputSchema: object({
        vegetarian: { type: "boolean" },
        no_pork: { type: "boolean" },
        no_fish: { type: "boolean" },
        avoid_add: {
          type: "array",
          items: { type: "string" },
          description: "Ingredient names, e.g. « œufs », « moutarde ».",
        },
        avoid_remove: { type: "array", items: { type: "string" } },
        weeknight_dinner_max_minutes: { type: ["integer", "null"], minimum: 10 },
      }),
      run: (input) => {
        const { state, catalogue } = context();
        const diet = { ...state.settings.diet };
        if (typeof input.vegetarian === "boolean") diet.vegetarian = input.vegetarian;
        if (typeof input.no_pork === "boolean") diet.noPork = input.no_pork;
        if (typeof input.no_fish === "boolean") diet.noFish = input.no_fish;
        const options = avoidOptions(catalogue.all).map((o) => o.name);
        const resolve = (names: unknown) =>
          (Array.isArray(names) ? names.map(String) : []).map((n) => ({
            asked: n,
            name: options.find((o) => normalize(o) === normalize(n)),
          }));
        const added = resolve(input.avoid_add);
        const removed = resolve(input.avoid_remove);
        const avoid = [
          ...state.settings.avoid.filter((a) => !removed.some((r) => r.name === a)),
          ...added.flatMap((a) => (a.name ? [a.name] : [])),
        ];
        api.dispatch({
          type: "setSettings",
          settings: {
            diet,
            avoid: [...new Set(avoid)],
            ...(input.weeknight_dinner_max_minutes !== undefined && {
              weeknightMinutes:
                input.weeknight_dinner_max_minutes === null
                  ? null
                  : Math.max(10, Number(input.weeknight_dinner_max_minutes)),
            }),
          },
        });
        api.notify("🤖 Préférences du foyer mises à jour");
        const after = context();
        return {
          diet: after.state.settings.diet,
          avoid: after.state.settings.avoid,
          unknown_ingredients: [...added, ...removed].filter((a) => !a.name).map((a) => a.asked),
          weeknight_dinner_max_minutes: after.state.settings.weeknightMinutes,
          dishes_left_out: after.catalogue.swipeable.filter(
            (m) => !fitsDiet(m, after.state.settings.diet) || avoidedIn(m, after.state.settings.avoid).length,
          ).length,
          plan_out_of_date:
            !!after.state.plans[after.state.week] &&
            after.state.plans[after.state.week]!.key !== planKey(after.state, after.catalogue),
        };
      },
    }),
  ];
}

/** The part of the household settings a tool just changed. */
function householdSettings(api: CrumbleApi, part: "diners" | "habits") {
  const state = api.getState();
  const catalogue = makeCatalogue(state.customMeals);
  if (part === "diners") {
    return DAYS.map((name, d) => ({ day: name.toLowerCase(), midi: state.diners[slotIndex(d, false)], soir: state.diners[slotIndex(d, true)] }));
  }
  return state.settings.habits.map((h) => ({ ...slotLabel(h.slot), dish_id: h.mealId, dish: catalogue.get(h.mealId)?.name }));
}

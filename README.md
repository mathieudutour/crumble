# Crumble

Pick seasonal meals by swiping, then get a week of lunches and dinners, the leftovers to plan for and a shopping list sorted by aisle.

- **Planning**: plan this week or the next, with dates. Swap any meal, move it to another day, or lock it so a new draw keeps it. Weekday dinners stay under a time limit and longer dishes go to the weekend; meals sharing main ingredients are spread out.
- **Shopping list**: quantities add up across the week; ingredients you always have at home (🏠) drop off the list.
- **Household** (« Foyer »): who eats when, weekly habits (pasta on Wednesday…), diet (vegetarian, no pork, no fish), ingredients to avoid (a dislike or an allergy: dishes containing them are left out, including cupboard seasonings mentioned in the steps) and the weekday time limit.
- **Your own dishes**: add family recipes; they are swiped, planned and shopped like the others.
- **History**: past weeks stay viewable. Rate dishes after eating them: favourites come first, dishes eaten recently are pushed back.
- **Cooking mode**: full screen, one step at a time, screen kept awake, and every duration in a step starts a timer.

- **Shared household**: invite the other adult with a link or QR code (no account). Both phones see the same deck, plans, list and settings, live; each phone keeps working offline and catches up when it reconnects.

Alone, everything stays on the phone (`localStorage`). Shared, a Cloudflare Durable Object per household keeps the state and relays changes. The site is installable as an app and works offline once loaded.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173, with the Worker and Durable Objects running locally
npm test           # planning, plan edits, parsing and data checks
npm run build      # typecheck + static build in dist/
npm run preview    # serve the build locally, Worker included
```

## Deploy

The app and its API are one Cloudflare Worker (`wrangler.jsonc`): the Worker serves the built app as static assets and handles `/api/*`, and each shared household is a SQLite-backed Durable Object.

Pushes to `main` deploy automatically through Cloudflare Workers Builds, with these settings (Worker › Settings › Build):

- Build command: `npm test && npm run build`, so a failing test stops the deploy
- Deploy command: `npx wrangler deploy`
- Node version: from `.node-version`

To deploy by hand instead:

```sh
npx wrangler login   # once
npm run deploy       # typecheck, build, wrangler deploy
```

## How sync works

Shared state lives in `src/shared/`, which runs both on phones and in the Durable Object (`worker/household.ts`), so it stays pure and deterministic: anything random, like a drawn plan, is computed by the phone and carried in the action.

- A phone sends each change as an action with a unique id. The Durable Object applies actions in arrival order, bumps a version and broadcasts them to every phone.
- A phone shows its own actions at once, on top of the last state the server confirmed, and replays them as confirmations arrive (`receive` and `visibleState` in `src/shared/sync.ts`). Offline actions wait in a queue saved on the phone and are resent on reconnect; the server ignores ids it already applied.
- Actions state the value they want (`setChecked … value: true`) rather than toggling, so two people tapping at once never cancel each other. Plan edits are actions the server applies to the current plan, not whole plans.
- Undo stays on each phone: it undoes that phone's own swipes.
- Phones ping every 20 s while on screen to catch connections a lost signal left half-open.
- Whoever has the invitation link (`/#rejoindre=<key>`, 128 random bits) is part of the household. The key stays in the URL fragment, out of server logs. A household nobody opens for 400 days is deleted.
- That key only lives in the phone's storage, which browsers may clear (Safari after about a week without a visit). In a household, the app asks the browser to keep its storage and suggests adding Crumble to the home screen (`src/lib/install.ts`); a wiped phone can rejoin from any other member's link.

## How it's organised

- `src/data/`: the built-in catalogue. `meals.ts` holds dishes and ingredients (units are singular, pluralised on display), `recipes.ts` the steps, `seasons.ts` the months each dish is in season, `aisles.ts` where ingredients sit in the shop, `diet.ts` how dishes are classified from their ingredients. Adding a dish means an entry in `meals.ts` and `recipes.ts`, plus `seasons.ts` if it isn't available all year; `npm test` catches a dish without a recipe. In steps, wrap quantities that should follow the portions in braces (`Bats les {3 œufs}`, `{40 g} de beurre`, `{2 c. à s.} d’huile`); numbers outside braces, like temperatures or per-person amounts, never change. `src/lib/steps.ts` renders them.
- `src/lib/catalogue.ts`: built-in dishes merged with the household's own; look meals up through it.
- `src/lib/planning.ts`: draws a week by scoring every liked meal for each slot (see `makePlan`). `planEdit.ts` holds the hand edits: swap, move, lock, clear.
- `src/lib/shopping.ts`, `time.ts`, `week.ts`: shopping list, parsing of cooking times and step durations, and week dates.
- `src/shared/`: the household state, its actions and reducer, and the sync protocol, shared with the Worker.
- `src/store/`: the phone's store (alone or synced, `store.ts`), persistence and derived values. Plans are stored by week; past weeks are the history.
- `worker/`: the Cloudflare Worker and the household Durable Object.
- `src/views/`: one component per tab. The current tab is in the URL hash (`#planning`, `#courses`, `#foyer`…).
- Dish illustrations: `npm run dishes -- prompts` writes one prompt per dish to `assets/dishes/prompts.md`, all in the app icon's style with a transparent background. Save each generated image as `dish-sources/<id>.png` (not committed), or generate them with `OPENAI_API_KEY=… npm run dishes -- generate`, then `npm run dishes -- import` makes the 640 px WebP files in `src/assets/dishes/` that ship with the app. `npm run dishes -- status` lists what's missing; dishes without a picture show their emoji.
- `assets/`: 1024 px masters of the app icon (`icon-maskable-1024.png` has extra margin for Android's round crop). The sizes in `public/` are generated from them.

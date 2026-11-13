// Dish illustrations: prompts, optional generation, and import into the app.
//
//   npm run dishes -- prompts            writes assets/dishes/prompts.md, one prompt per dish
//   npm run dishes -- generate [ids…]    generates missing images with the OpenAI API (needs OPENAI_API_KEY)
//   npm run dishes -- import             turns dish-sources/<id>.png|jpg|webp into WebP files in src/assets/ (dishes,
//                                        their thumbnails, and empty-state illustrations)
//   npm run dishes -- status             lists dishes with and without an image
//
// Originals go in dish-sources/ (not committed: they're large). Only the small WebP files ship with the app.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXED_MEALS, MEALS } from "../src/data/meals";
import type { Meal } from "../src/data/types";

const ROOT = join(import.meta.dirname, "..");
const SOURCES = join(ROOT, "dish-sources");
const OUTPUT = join(ROOT, "src/assets/dishes");
const THUMBS = join(OUTPUT, "thumbs");
const ILLUSTRATIONS = join(ROOT, "src/assets/illustrations");
const PROMPTS = join(ROOT, "assets/dishes/prompts.md");
/** Pixels of the square WebP shipped with the app: sharp on a phone card, about 50 KB at quality 70. */
const SIZE = 640;
/** Thumbnails for lists (plan, picker, dishes): 44 px on screen, sharp up to 3× screens, about 5 KB. */
const THUMB_SIZE = 128;
/** Scene illustrations for empty states: up to 200 px on screen. */
const SCENE_SIZE = 480;

const DISHES: Meal[] = [...MEALS, ...Object.values(FIXED_MEALS)];

/** Ingredients you wouldn't see on the plate. */
const INVISIBLE = new Set([
  "Lait",
  "Beurre",
  "Farine",
  "Crème fraîche",
  "Bouillon de légumes",
  "Vin blanc",
  "Vin rouge",
  "Bière brune",
  "Bière blonde",
  "Cidre brut",
  "Sauce soja",
  "Pâte brisée",
  "Lait de coco",
  "Chapelure",
  "Farine de sarrasin",
]);

/** Where the dish is served, with its preposition: "in a … bowl", "on a … plate". */
function vessel(meal: Meal): string {
  const name = meal.name.toLowerCase();
  if (/quiche|tarte/.test(name)) return "in a round fluted ceramic tart dish, one slice cut out to show the filling";
  if (/velouté|soupe|gaspacho/.test(name)) return "in a wide ceramic soup bowl";
  if (/tajine/.test(name)) return "in a terracotta tajine dish, its conical lid set beside it";
  if (/salade|bowl|taboulé|niçoise/.test(name)) return "in a shallow ceramic bowl";
  if (
    /gratin|lasagne|tian|crumble|moussaka|hachis|tartiflette|dauphinois|endives au jambon|courgettes farcies|tomates farcies/.test(
      name,
    )
  )
    return "in an oval ceramic baking dish, golden on top";
  if (
    /pot-au-feu|blanquette|bourguignon|carbonade|navarin|chili|dal|curry|choucroute|petit salé|bœuf-carottes|ratatouille|basquaise|moules/.test(
      name,
    )
  )
    return "in a cast-iron casserole";
  if (/wrap|tacos|tartine|croque|burger|pizza|galette|crêpe/.test(name)) return "on a simple wooden board";
  return "on a cream ceramic plate";
}

const STYLE =
  "Style: warm, modern flat illustration with soft shading and a gentle grain, like a cosy cookbook illustration. Rounded, friendly shapes and appetising warm colours; the darkest tone is a warm brown (#2B2420), never pure black. Not photorealistic, not 3D, no glossy plastic look.";
const BACKGROUND = "Background: fully transparent (PNG with alpha). No table, no tablecloth, no text, no border.";

export function promptFor(meal: Meal): string {
  const visible = meal.ingredients.map(([name]) => name).filter((name) => !INVISIBLE.has(name));
  return [
    `An illustration of the French home-cooked dish "${meal.name}", served ${vessel(meal)}.`,
    `Visible ingredients: ${visible.join(", ").toLowerCase()}.`,
    STYLE,
    "Composition: three-quarter top view, the dish centred and filling about 80% of a square 1024×1024 canvas, with a soft contact shadow under it.",
    `${BACKGROUND} No props or cutlery.`,
  ].join("\n");
}

/** Illustrations for empty states and sharing, in the same style as the dishes. */
const SCENES: Record<string, { title: string; subject: string }> = {
  "deck-done": {
    title: "Le deck est fini (« Tu as tout vu ! »)",
    subject:
      "An empty cream ceramic plate with a few golden crumbs on it, a fork and a knife resting neatly across it and a folded linen napkin beside it: a meal happily finished.",
  },
  "empty-plan": {
    title: "Pas encore de planning",
    subject:
      "A small kitchen notebook lying open on a blank page, a pencil across it, with a wooden spoon and a sprig of rosemary beside it: a week of meals still to plan.",
  },
  "empty-list": {
    title: "La liste de courses arrive avec le planning",
    subject: "An empty woven wicker market basket with a folded linen cloth inside, and a single leek lying next to it.",
  },
  household: {
    title: "Partager avec son foyer",
    subject:
      "Two matching cream plates side by side, each with a fork, and a small crumble in a round terracotta dish between them, a heart-shaped crumb on top: meals shared at home.",
  },
};

const scenePrompt = (subject: string) =>
  [
    `An illustration: ${subject}`,
    STYLE,
    "Composition: three-quarter top view, the objects centred and filling about 75% of a square 1024×1024 canvas, with a soft contact shadow under them.",
    BACKGROUND,
  ].join("\n");

/** Everything to illustrate, with where each image goes once imported. */
const ARTWORK = [
  ...DISHES.map((m) => ({ id: m.id, prompt: promptFor(m), output: join(OUTPUT, `${m.id}.webp`), size: SIZE, thumb: true })),
  ...Object.entries(SCENES).map(([id, scene]) => ({
    id,
    prompt: scenePrompt(scene.subject),
    output: join(ILLUSTRATIONS, `${id}.webp`),
    size: SCENE_SIZE,
    thumb: false,
  })),
];

const sourceOf = (id: string) =>
  ["png", "jpg", "jpeg", "webp"].map((ext) => join(SOURCES, `${id}.${ext}`)).find(existsSync);

function prompts() {
  mkdirSync(join(ROOT, "assets/dishes"), { recursive: true });
  const block = (title: string, id: string, prompt: string) =>
    `### ${title}\n\nSave as \`dish-sources/${id}.png\`\n\n\`\`\`\n${prompt}\n\`\`\``;
  const body = [
    "## Illustrations",
    ...Object.entries(SCENES).map(([id, scene]) => block(scene.title, id, scenePrompt(scene.subject))),
    "## Plats",
    ...DISHES.map((m) => block(`${m.emoji} ${m.name}`, m.id, promptFor(m))),
  ].join("\n\n");
  writeFileSync(
    PROMPTS,
    `# Dish illustration prompts\n\nGenerated by \`npm run dishes -- prompts\` from the meal data. Every prompt shares the same style so the deck looks consistent. Save each image under its id in \`dish-sources/\`, then run \`npm run dishes -- import\`.\n\n${body}\n`,
  );
  console.log(`Wrote ${ARTWORK.length} prompts to assets/dishes/prompts.md`);
}

async function generate(only: string[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Set OPENAI_API_KEY to generate images.");
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const quality = process.env.OPENAI_IMAGE_QUALITY ?? "medium";
  mkdirSync(SOURCES, { recursive: true });
  const todo = ARTWORK.filter((art) => (only.length ? only.includes(art.id) : !sourceOf(art.id)));
  console.log(`Generating ${todo.length} images with ${model} (${quality})…`);
  let next = 0;
  const worker = async () => {
    for (let art = todo[next++]; art; art = todo[next++]) {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: art.prompt,
          size: "1024x1024",
          background: "transparent",
          output_format: "png",
          quality,
        }),
      });
      if (!response.ok) {
        console.error(`✗ ${art.id}: ${response.status} ${await response.text()}`);
        continue;
      }
      const { data } = (await response.json()) as { data: { b64_json: string }[] };
      writeFileSync(join(SOURCES, `${art.id}.png`), Buffer.from(data[0]!.b64_json, "base64"));
      console.log(`✓ ${art.id}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

/** Trims the transparent margin, so every subject has the same size, and fits it in a square WebP. */
function toWebp(input: string, output: string, size: number, opaque: boolean, quality: number) {
  execFileSync("magick", [
    input,
    ...(opaque ? [] : ["-trim", "+repage"]),
    "-resize",
    `${size}x${size}`,
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    `${size}x${size}`,
    "-strip",
    "-quality",
    String(quality),
    "-define",
    "webp:method=6",
    "-define",
    "webp:alpha-quality=80",
    output,
  ]);
}

function importImages() {
  if (!existsSync(SOURCES)) throw new Error("Put images in dish-sources/<id>.png first.");
  for (const dir of [OUTPUT, THUMBS, ILLUSTRATIONS]) mkdirSync(dir, { recursive: true });
  const byId = new Map(ARTWORK.map((art) => [art.id, art]));
  for (const file of readdirSync(SOURCES).sort()) {
    const id = file.replace(/\.(png|jpe?g|webp)$/i, "");
    const art = byId.get(id);
    if (id === file) continue;
    if (!art) {
      console.warn(`? ${file}: nothing to illustrate called "${id}"`);
      continue;
    }
    const input = join(SOURCES, file);
    const opaque = execFileSync("magick", [input, "-format", "%[opaque]", "info:"]).toString().trim() === "True";
    toWebp(input, art.output, art.size, opaque, 70);
    if (art.thumb) toWebp(input, join(THUMBS, `${id}.webp`), THUMB_SIZE, opaque, 75);
    console.log(`✓ ${id}${opaque ? "  (no transparent background: it will show as a square)" : ""}`);
  }
}

function status() {
  const missing = ARTWORK.filter((art) => !existsSync(art.output) || (art.thumb && !existsSync(join(THUMBS, `${art.id}.webp`))));
  console.log(`${ARTWORK.length - missing.length}/${ARTWORK.length} illustrations imported.`);
  if (missing.length) console.log(`Missing: ${missing.map((art) => art.id).join(", ")}`);
}

const [command, ...args] = process.argv.slice(2);
const commands: Record<string, () => unknown> = {
  prompts,
  generate: () => generate(args),
  import: importImages,
  status,
};
const run = command && commands[command];
if (!run) {
  console.log("Usage: npm run dishes -- prompts | generate [ids…] | import | status");
  process.exit(1);
}
await run();

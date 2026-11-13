// Illustrations made by `npm run dishes -- import`: dishes (`src/assets/dishes/<id>.webp`), their thumbnails for
// lists, and scenes for empty states (`src/assets/illustrations/<name>.webp`). Anything missing, and the household's
// own dishes, falls back to an emoji.

const byName = (files: Record<string, string>) =>
  new Map(Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".webp".length), url]));

const DISHES = byName(
  import.meta.glob<string>("../assets/dishes/*.webp", { eager: true, query: "?url", import: "default" }),
);
const THUMBS = byName(
  import.meta.glob<string>("../assets/dishes/thumbs/*.webp", { eager: true, query: "?url", import: "default" }),
);
const SCENES = byName(
  import.meta.glob<string>("../assets/illustrations/*.webp", { eager: true, query: "?url", import: "default" }),
);

export const dishImage = (id: string): string | undefined => DISHES.get(id);
export const dishThumb = (id: string): string | undefined => THUMBS.get(id);

export type Scene = "deck-done" | "empty-plan" | "empty-list" | "household";
export const sceneImage = (scene: Scene): string | undefined => SCENES.get(scene);

// Dish illustrations, by meal id: `src/assets/dishes/<id>.webp`, made by `npm run dishes:import`. Meals without one
// (and the household's own dishes) show their emoji instead.

const files = import.meta.glob<string>("../assets/dishes/*.webp", { eager: true, query: "?url", import: "default" });

const BY_ID = new Map(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".webp".length), url]),
);

export const dishImage = (id: string): string | undefined => BY_ID.get(id);

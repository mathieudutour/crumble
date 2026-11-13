import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts so tests don't start the Cloudflare runtime.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

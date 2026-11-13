import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    // Runs the Worker and the household Durable Objects in the dev server, and builds them alongside the app.
    cloudflare(),
    // Offline support is for the app only, not the Worker build.
    ...VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Crumble",
        short_name: "Crumble",
        description:
          "Choisis tes plats de saison d’un swipe, et obtiens le planning de la semaine et la liste de courses.",
        lang: "fr",
        start_url: "/",
        display: "standalone",
        background_color: "#fbf6ef",
        theme_color: "#fbf6ef",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The household API is always live, never served from the offline cache.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts", expiration: { maxEntries: 20 } },
          },
        ],
      },
    }).map((plugin) => ({ ...plugin, applyToEnvironment: (environment: { name: string }) => environment.name === "client" })),
  ],
});

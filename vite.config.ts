import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const BASE = "/corte-2026/";

export default defineConfig({
  base: BASE,
  build: { target: "es2022" },
  // o plugin so faz sentido no build e no dev; dentro do vitest fica fora
  plugins: process.env.VITEST
    ? []
    : [
        VitePWA({
          registerType: "autoUpdate",
          includeAssets: ["icons/favicon.svg", "icons/apple-touch-icon.png"],
          manifest: {
            name: "Corte 2026",
            short_name: "Corte",
            description: "Acompanhamento do protocolo de corte, 24/08 a 31/12 de 2026.",
            lang: "pt-BR",
            start_url: BASE,
            scope: BASE,
            display: "standalone",
            orientation: "portrait",
            background_color: "#0B0B0D",
            theme_color: "#0B0B0D",
            icons: [
              { src: "icons/icone-192.png", sizes: "192x192", type: "image/png" },
              { src: "icons/icone-512.png", sizes: "512x512", type: "image/png" },
              { src: "icons/icone-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            ],
          },
          workbox: {
            // plano.json entra no bundle JS, entao ja esta coberto por este glob
            globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: "StaleWhileRevalidate",
                options: {
                  cacheName: "fontes-css",
                  expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: "CacheFirst",
                options: {
                  cacheName: "fontes-arquivos",
                  expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
            ],
          },
        }),
      ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts", "src/sync/**/*.ts"],
      // supabase.ts e adaptador fino: quem testa e o servico real, nao o vitest
      exclude: ["**/*.test.ts", "src/sync/supabase.ts"],
      thresholds: {
        "src/core/**": { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/sync/**": { lines: 85, functions: 85, branches: 85, statements: 85 },
      },
    },
  },
});

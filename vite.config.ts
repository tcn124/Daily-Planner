import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Two builds out of one source.
 *
 * The default is the desktop one: a relative base, so Tauri can load the
 * assets off disk and `dist/index.html` still opens straight from Finder.
 *
 * `--mode pwa` is the phone one. A service worker's scope and a manifest's
 * `start_url` are absolute by nature, so it needs `base: '/'` — which
 * deliberately gives up the open-from-disk property, and is why it writes to
 * its own directory rather than over the committed `dist/`.
 */
export default defineConfig(({ mode }) => {
  const pwa = mode === 'pwa';

  return {
    plugins: [
      react(),
      ...(pwa
        ? [
            VitePWA({
              // We register it ourselves, gated on the desktop shell — see
              // `src/lib/pwa.ts`.
              injectRegister: null,
              registerType: 'autoUpdate',
              // `public/manifest.webmanifest` is the source of truth; it is
              // linked from index.html so the desktop build resolves it too.
              manifest: false,
              workbox: {
                // The fonts are the reason this app can open on a plane. The
                // launch mark is here so a cold start has it before it needs it.
                globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
                navigateFallback: '/index.html',
                cleanupOutdatedCaches: true,
              },
            }),
          ]
        : []),
    ],
    base: pwa ? '/' : './',
    build: pwa ? { outDir: 'dist-pwa' } : {},
    server: { port: 5173 },
  };
});

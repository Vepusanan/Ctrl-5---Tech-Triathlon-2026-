import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiProxy = { '/api': 'http://localhost:3000' };

export default defineConfig({
  plugins: [
    react(),
    // SYSTEM_DESIGN §8.1: the service worker precaches the app shell only, so the app reloads with
    // no signal. API responses are never cached here; Dexie is the only offline data source.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    conditions: ['@waypoint/source', ...defaultClientConditions],
  },
  server: { port: 5173, strictPort: true, proxy: apiProxy },
  preview: { port: 4173, strictPort: true, proxy: apiProxy },
});

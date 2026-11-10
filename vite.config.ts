import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const sha = process.env.GITHUB_SHA?.slice(0, 7);

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(sha ? `${pkg.version} (${sha})` : pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Mi Tono',
        short_name: 'Mi Tono',
        description: 'Prueba tus canciones en distintos tonos, sin conexión.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#101114',
        theme_color: '#101114',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,webmanifest,wasm,txt}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      // Sin esto el chunk diferido de SoundTouch se llama ".dist-*.js" y Workbox (dot:false) no lo precachea.
      output: { chunkFileNames: 'assets/chunk-[name]-[hash].js' },
    },
  },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

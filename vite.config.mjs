import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/auth': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'client',
      filename: 'service-worker.js',
      injectRegister: null,
      manifest: {
        name: 'Nodecal',
        short_name: 'Nodecal',
        description: 'Self-hosted mobile-first CalDAV calendar',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#2563eb',
        theme_color: '#2563eb',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        // The plugin adds its manifest and declared icons; Workbox discovers
        // Vite's HTML and hashed bundles here without duplicating those files.
        globPatterns: ['**/*.{js,css,html}'],
      },
    }),
  ],
});

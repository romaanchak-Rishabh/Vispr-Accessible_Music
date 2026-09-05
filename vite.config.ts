import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Vispr',
        short_name: 'Vispr',
        description: 'Your personal offline music library — Liquid Glass PWA',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#000000',
        theme_color: '#000000',
        categories: ['music', 'entertainment'],
        file_handlers: [
          {
            action: '/',
            accept: {
              'application/json': ['.json', '.vispr.json', '.vpr']
            }
          }
        ],
        share_target: {
          action: '/?share-target',
          method: 'GET',
          enctype: 'multipart/form-data',
          params: {
            files: [
              { name: 'files', accept: ['application/json', 'audio/*', '.json', '.vispr.json', '.vpr', '.m4a', '.mp3', '.mp4', '.aac', '.ogg', '.opus', '.flac'] }
            ]
          }
        },
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  define: {
    __GEMINI_API_KEY__: JSON.stringify(env.GEMINI_LLM_API_KEY || ''),
  },
  build: {
    target: 'es2020',
    sourcemap: false
  }
}; });

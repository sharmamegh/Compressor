import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.COMPRESSIT_DISABLE_PWA
      ? []
      : [
          VitePWA({
            registerType: 'prompt',
            includeAssets: ['favicon.svg'],
            manifest: {
              name: 'CompressIt',
              short_name: 'CompressIt',
              description: 'Compress videos privately in your browser.',
              theme_color: '#f4f3ef',
              background_color: '#f4f3ef',
              display: 'standalone',
              start_url: '/',
              icons: [
                {
                  src: '/app-icon.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                  purpose: 'any maskable',
                },
              ],
            },
            workbox: {
              globIgnores: ['**/ffmpeg/**'],
              navigateFallbackDenylist: [/^\/ffmpeg\//],
              runtimeCaching: [
                {
                  urlPattern: ({ url }) => url.pathname.startsWith('/ffmpeg/'),
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'compressit-engine-v1',
                    expiration: {
                      maxEntries: 6,
                      maxAgeSeconds: 60 * 60 * 24 * 30,
                    },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
          }),
        ]),
  ],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
})

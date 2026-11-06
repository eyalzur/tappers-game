import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/tappers-game/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tappers',
        short_name: 'Tappers',
        description: 'Tap the shapes before they vanish.',
        theme_color: '#0f1020',
        background_color: '#0f1020',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/tappers-game/',
        scope: '/tappers-game/',
        icons: [
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
})

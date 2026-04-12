import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',           // Show "update available" toast
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'vite.svg'],
      manifest: {
        name: "Chema NOC",
        short_name: "Chema NOC",
        description: "Vodafone service status and network operations center monitor",
        start_url: "/vodafone-cm/?pwa=1",  // ← ensures PWA mode is always detected
        scope: "/vodafone-cm/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#e60000",
        background_color: "#0f172a",
        icons: [
          {
            src: "/vodafone-cm/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
          },
          {
            src: "/vodafone-cm/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/vodafone-cm/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/vodafone-cm/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Never cache API calls — always go to network
            urlPattern: /^https:\/\/api\.chemafmp\.dev\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  base: '/vodafone-cm/',
})

import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // Use relative paths for GitHub Pages
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'QuestForge',
        short_name: 'QuestForge',
        description: 'Solo RPG Quest Tracker',
        theme_color: '#0f0f1a',
        background_color: '#0f0f1a',
        display: 'standalone',
        start_url: './index.html', // Point to index.html for relative path deployment
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ]
});

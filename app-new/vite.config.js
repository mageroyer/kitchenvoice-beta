import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: 'KitchenCommand',
        short_name: 'KitchenCommand',
        description: 'AI-powered kitchen management - recipes, inventory, and invoice processing',
        theme_color: '#2c3e50',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icons/maskable-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Cache strategies for different resource types
        runtimeCaching: [
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Cache font files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Cache images
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ],
        // Don't cache API calls - they need fresh data
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          // Don't cache Firebase/API routes
          /^\/api/,
          /cloudfunctions\.net/,
          /firestore\.googleapis\.com/,
          /firebase/
        ],
        // Clean old caches on update
        cleanupOutdatedCaches: true,
        // Skip waiting - activate new SW immediately
        skipWaiting: true,
        clientsClaim: true
      },
      devOptions: {
        // Enable PWA in dev mode for testing
        enabled: false, // Set to true to test PWA in dev
        type: 'module'
      }
    })
  ],
  server: {
    host: '0.0.0.0',  // Expose to network (tablet access)
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - split large dependencies
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-dexie': ['dexie'],
          // PDF.js in its own chunk - only loaded when needed
          'vendor-pdfjs': ['pdfjs-dist'],
        },
      },
    },
    // Increase chunk size warning limit since we're intentionally chunking
    chunkSizeWarningLimit: 600,
  },
})

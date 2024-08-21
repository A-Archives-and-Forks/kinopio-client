import { defineConfig } from 'vite'
import createVuePlugin from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import sitemap from 'vite-plugin-sitemap'
import path from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'

const outputDir = './dist'
const isDevelopment = process.env.NODE_ENV === 'development'
let apiHost = 'https://api.kinopio.club'
if (isDevelopment) {
  apiHost = 'https://kinopio.local:3000'
  // console.log('disabling vite TLS in dev mode only…')
  // process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
}

const updateExploreSpaceUrls = async () => {
  try {
    if (isDevelopment) { return }
    const response = await fetch(`${apiHost}/space/explore-spaces`)
    const data = await response.json()
    const paths = data.map(space => space.url)
    console.log('🌺', isDevelopment, paths)
    return data
  } catch (error) {
    console.error('🚒 exploreSpaceUrls', error)
  }
}

// sitemap index
const date = new Date().toISOString()
const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
   <sitemap>
      <loc>https://kinopio.club/static-sitemap.xml</loc>
      <lastmod>${date}</lastmod>
   </sitemap>
   <sitemap>
      <loc>https://kinopio.club/dynamic-sitemap.xml</loc>
      <lastmod>${date}</lastmod>
   </sitemap>
</sitemapindex>`

// exploreSpaceUrls()

const yearTime = 60 * 60 * 24 * 365 // 365 days

export default defineConfig(async ({ command, mode }) => {
  const exploreSpaceUrls = await updateExploreSpaceUrls()
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }
  if (!isDevelopment) {
    writeFileSync(`${outputDir}/sitemap.xml`, sitemapIndex)
  }
  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    plugins: [
      createVuePlugin(), // .vue support
      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'generateSW',
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,gif,woff2,ico,jpg,jpeg,webp}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/cdn\.kinopio\.club\/(?!.*?\.mp(3|4)\b).*$/i, // match all except mp3/mp4
              handler: 'CacheFirst',
              options: {
                cacheName: 'cdn-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: yearTime
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/bk\.kinopio\.club\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'bk-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: yearTime
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/images\.are\.na\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'are-na-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: yearTime
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/d2w9rnfcy7mm78\.cloudfront\.net\/.*/i, // are.na cdn
              handler: 'CacheFirst',
              options: {
                cacheName: 'are-na-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: yearTime
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        }
      })
      // sitemap({
      // })
    ],
    server: {
      port: 8080,
      fs: {
        // Allow serving files from one level up to the project root
        allow: ['..']
      },
      https: {
        key: readFileSync('./.cert/key.pem'),
        cert: readFileSync('./.cert/cert.pem')
      }
    }
  }
})

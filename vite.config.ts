/* Vite config for building the frontend react app: https://vite.dev/config/ */
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
// @ts-expect-error - uidPlugin is a custom plugin
import uidPlugin from './vite-plugin-react-uid'

// One identifier for the HTML, update manifest and offline worker in each release.
function appVersion() {
  const hash = createHash('sha256')
  const add = (file: string) => {
    if (fs.statSync(file).isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) add(path.join(file, name))
    } else {
      hash.update(file).update(fs.readFileSync(file))
    }
  }
  for (const file of ['src', 'public/sw.js', 'public/atualizar.html', 'index.html', 'vite.config.ts', 'package-lock.json']) add(file)
  return hash.digest('hex').slice(0, 20)
}
const version = appVersion()

function releaseManifest(): Plugin {
  let outDir: string
  return {
    name: 'medreview-release-manifest',
    apply: 'build' as const,
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir) },
    closeBundle() {
      fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ version }))
      const assets = fs.readdirSync(path.join(outDir, 'assets')).filter((file) => /\.(js|css)$/.test(file)).sort().map((file) => `/assets/${file}`)
      const worker = fs.readFileSync('public/sw.js', 'utf8')
        .replace('__MEDREVIEW_RELEASE__', version)
        .replace('/* __MEDREVIEW_ASSETS__ */ []', JSON.stringify(assets))
      fs.writeFileSync(path.join(outDir, 'sw.js'), worker)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '::',
    port: 8080,
  },
  build: {
    outDir: mode === 'development' ? 'dev-dist' : 'dist',
    minify: mode !== 'development',
    // lightningcss in every mode so dev/QA catches the same CSS errors as prod
    cssMinify: 'lightningcss',
    sourcemap: mode === 'development',
    rolldownOptions: {
      output: {
        codeSplitting: true,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('lucide-react')) return 'icons'
            if (id.includes('react') || id.includes('react-dom')) return 'react-vendor'
          }
        },
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
          return
        }
        warn(warning)
      },
    },
  },
  plugins: [mode === 'development' ? uidPlugin() : undefined, react(), releaseManifest()].filter(Boolean),
  define: {
    __APP_VERSION__: JSON.stringify(version),
    'process.env.NODE_ENV': JSON.stringify(mode ?? process.env.NODE_ENV ?? 'production'),
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /zod\/v4\/core/,
        replacement: path.resolve(__dirname, 'node_modules', 'zod', 'v4', 'core'),
      }
    ],
  },
}))

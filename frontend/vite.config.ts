import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveAppVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION
  if (process.env.npm_package_version) return process.env.npm_package_version

  // 1. Coba baca package.json lokal di direktori frontend (tersedia saat docker build)
  try {
    const pkgPath = path.resolve(__dirname, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      if (pkg.version) return pkg.version
    }
  } catch {}

  // 2. Coba baca Cargo.toml di direktori induk (lingkungan monorepo lokal)
  try {
    const cargoPath = path.resolve(__dirname, '../Cargo.toml')
    if (fs.existsSync(cargoPath)) {
      const cargoToml = fs.readFileSync(cargoPath, 'utf-8')
      const match = cargoToml.match(/^\s*version\s*=\s*"([^"]+)"/m)
      if (match) return match[1]
    }
  } catch {}

  return '0.4.1'
}

const appVersion = resolveAppVersion()

const config = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    alias: {
      'lucide-react': path.resolve(__dirname, 'src/lib/iconsax-adapter.tsx'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@ui-sdk/react/alert-dialog',
      '@ui-sdk/react/button',
      '@ui-sdk/react/dialog',
      '@ui-sdk/react/field',
      '@ui-sdk/react/input',
      '@ui-sdk/react/pagination',
      '@ui-sdk/react/password-input',
      '@ui-sdk/react/select',
      '@ui-sdk/react/switch',
      '@ui-sdk/react/tabs',
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.SERVER_URL || 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Backend gateway unavailable', details: err.message }))
              }
            } else if (res && 'destroy' in res && typeof res.destroy === 'function') {
              res.destroy()
            }
          })
        },
      },
      '/s3': {
        target: process.env.S3_URL || 'http://localhost:9001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/s3/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'S3 gateway unavailable', details: err.message }))
              }
            } else if (res && 'destroy' in res && typeof res.destroy === 'function') {
              res.destroy()
            }
          })
        },
      },
    },
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
    nitro({ preset: 'bun' }),
  ],
})

export default config

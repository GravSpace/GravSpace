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

let appVersion = '0.1.0'
try {
  const cargoPath = path.resolve(__dirname, '../Cargo.toml')
  if (fs.existsSync(cargoPath)) {
    const cargoToml = fs.readFileSync(cargoPath, 'utf-8')
    const match = cargoToml.match(/^\s*version\s*=\s*"([^"]+)"/m)
    if (match) {
      appVersion = match[1]
    }
  }
} catch {
  // fallback
}

const config = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      '/api': {
        target: process.env.SERVER_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/s3': {
        target: process.env.S3_URL || 'http://localhost:9001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/s3/, ''),
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

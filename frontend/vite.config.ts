import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
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

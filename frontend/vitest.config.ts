import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      'lucide-react': path.resolve(__dirname, 'src/lib/iconsax-adapter.tsx'),
    },
  },
  plugins: [tailwindcss(), viteReact()],
  test: {
    environment: 'jsdom',
    css: false,
  },
})

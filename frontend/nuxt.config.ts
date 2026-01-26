export default defineNuxtConfig({
  compatibilityDate: '2026-01-26',
  ssr: false,
  css: ['~/assets/css/tailwind.css'],
  modules: ['@nuxtjs/tailwindcss', 'shadcn-nuxt'],
  shadcn: {
    /**
     * Prefix for all the imported component.
     * @default "Ui"
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * Will respect the Nuxt aliases.
     * @link https://nuxt.com/docs/api/nuxt-config#alias
     * @default "@/components/ui"
     */
    componentDir: '@/components/ui'
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api'
    }
  },
  routeRules: {
    '/api/admin/**': { proxy: `${process.env.BACKEND_URL || 'http://localhost:8080'}/admin/**` },
    '/api/login': { proxy: `${process.env.BACKEND_URL || 'http://localhost:8080'}/login` }
  },
  devtools: { enabled: false },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8080',
    },
  },
})
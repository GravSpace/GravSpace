import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    SERVER_URL: z.string().url().optional().default('http://localhost:8080'),
  },

  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: 'VITE_',

  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),
    VITE_API_BASE: z.string().default('/api'),
    VITE_WS_BASE: z.string().default('ws://localhost:8080'),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: import.meta.env,

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   */
  emptyStringAsUndefined: true,
})

export const API_BASE =
  typeof window !== 'undefined'
    ? (import.meta.env.VITE_API_BASE ?? '/api')
    : '/api'

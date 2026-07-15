import { createFileRoute } from '@tanstack/react-router'
import '@tanstack/react-start'

const BACKEND_URL =
  process.env['SERVER_URL'] || process.env['NUXT_BACKEND_URL'] || 'http://localhost:8080'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => proxyToBackend(request),
      POST: ({ request }) => proxyToBackend(request),
      PUT: ({ request }) => proxyToBackend(request),
      DELETE: ({ request }) => proxyToBackend(request),
      PATCH: ({ request }) => proxyToBackend(request),
      HEAD: ({ request }) => proxyToBackend(request),
      OPTIONS: ({ request }) => proxyToBackend(request),
    },
  },
})

async function proxyToBackend(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Strip /api prefix, forward the rest to backend
  // e.g. /api/login → /login, /api/admin/users → /admin/users
  const targetPath = url.pathname.replace(/^\/api/, '')
  const targetUrl = `${BACKEND_URL}${targetPath}${url.search}`

  const headers = new Headers(request.headers)
  // Remove host header so it won't conflict
  headers.delete('host')

  const init: RequestInit = {
    method: request.method,
    headers,
    // Only send body for methods that support it
    ...(request.method !== 'GET' && request.method !== 'HEAD'
      ? { body: request.body, duplex: 'half' }
      : {}),
  }

  try {
    const response = await fetch(targetUrl, init as RequestInit)

    // Stream response back to client
    const responseHeaders = new Headers(response.headers)
    // Remove encoding headers that may conflict
    responseHeaders.delete('transfer-encoding')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (err) {
    console.error(`[Proxy] Error forwarding to ${targetUrl}:`, err)
    return new Response(
      JSON.stringify({ error: 'Backend unreachable', details: String(err) }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

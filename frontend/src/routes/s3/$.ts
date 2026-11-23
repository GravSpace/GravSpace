import { createFileRoute } from '@tanstack/react-router'
import '@tanstack/react-start'

const S3_URL = (
  process.env['S3_URL'] || process.env['NUXT_S3_URL'] || 'http://127.0.0.1:9001'
).replace('//localhost:', '//127.0.0.1:')

export const Route = createFileRoute('/s3/$')({
  server: {
    handlers: {
      GET: ({ request }) => proxyToS3(request),
      POST: ({ request }) => proxyToS3(request),
      PUT: ({ request }) => proxyToS3(request),
      DELETE: ({ request }) => proxyToS3(request),
      PATCH: ({ request }) => proxyToS3(request),
      HEAD: ({ request }) => proxyToS3(request),
      OPTIONS: ({ request }) => proxyToS3(request),
    },
  },
})

async function proxyToS3(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Strip /s3 prefix and forward to S3 backend
  // e.g. /s3/my-bucket/obj.txt → http://127.0.0.1:9001/my-bucket/obj.txt
  const targetPath = url.pathname.replace(/^\/s3/, '')
  const targetUrl = `${S3_URL}${targetPath || '/'}${url.search}`

  const headers = new Headers(request.headers)
  // Preserve client original host for SigV4 candidate host matching
  const originalHost = request.headers.get('host') || url.host
  if (!headers.has('x-forwarded-host')) {
    headers.set('x-forwarded-host', originalHost)
  }

  // Remove hop-by-hop headers that can conflict with fetch
  headers.delete('connection')
  headers.delete('keep-alive')
  headers.delete('expect')

  const init: RequestInit = {
    method: request.method,
    headers,
    ...(request.method !== 'GET' && request.method !== 'HEAD'
      ? { body: request.body, duplex: 'half' as any }
      : {}),
  }

  try {
    const response = await fetch(targetUrl, init)

    // Stream response back to client with exposed S3 headers
    const responseHeaders = new Headers(response.headers)
    responseHeaders.delete('transfer-encoding')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error(`[S3 Proxy] Error forwarding to ${targetUrl}:`, err)
    return new Response(
      JSON.stringify({
        error: 'S3 Backend unreachable',
        details: String(err),
        targetUrl,
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

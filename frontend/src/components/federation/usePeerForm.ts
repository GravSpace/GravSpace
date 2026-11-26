import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import type { RemoteServer } from './federationTypes'
import type { PeerTestResult } from './PeerTestStatusBanner'

interface UsePeerFormOptions {
  open: boolean
  peer?: RemoteServer | null
  onClose: () => void
  onSuccess: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function usePeerForm({
  open,
  peer,
  onClose,
  onSuccess,
  authFetch,
  apiBase,
}: UsePeerFormOptions) {
  const isEdit = Boolean(peer && typeof peer.id === 'number')
  const [name, setName] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<PeerTestResult | null>(null)

  useEffect(() => {
    if (!open) return
    setName(peer?.name ?? '')
    setEndpoint(peer?.endpoint ?? '')
    setS3Endpoint(peer?.s3_endpoint ?? '')
    setAccessKey(peer?.access_key ?? '')
    setSecretKey('')
    setTestResult(null)
  }, [open, peer])

  function handleEndpointChange(val: string) {
    setEndpoint(val)
    setTestResult(null)
    if (!isEdit && (!s3Endpoint || s3Endpoint.includes(':9001') || s3Endpoint.includes(':9000'))) {
      if (val.includes(':8080')) {
        setS3Endpoint(val.replace(':8080', ':9001'))
      } else if (val.startsWith('http://') || val.startsWith('https://')) {
        try {
          const u = new URL(val)
          setS3Endpoint(`${u.protocol}//${u.hostname}:9001`)
        } catch {
          // ignore partial URL while typing
        }
      }
    }
  }

  async function handleTestConnection() {
    if (!endpoint.trim()) {
      toast.error('Please enter the Admin API Endpoint first.')
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
      const cleanedUrl = endpoint.trim().replace(/\/+$/, '')
      const res = await authFetch(`${apiBase}/admin/federation/test-endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peer_id: peer?.id,
          endpoint: cleanedUrl,
          s3_endpoint: s3Endpoint.trim() ? s3Endpoint.trim().replace(/\/+$/, '') : undefined,
          access_key_id: accessKey.trim() || undefined,
          secret_access_key: secretKey.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          latency: data.latency_ms,
          msg: data.message || `Online (${data.latency_ms}ms)`,
          admin: data.admin,
          s3: data.s3,
        })
        toast.success(`Server verified: ${data.message || `${data.latency_ms}ms`}`)
      } else {
        setTestResult({
          success: false,
          latency: data.latency_ms,
          msg: data.message || 'Node unreachable from this server.',
          admin: data.admin,
          s3: data.s3,
        })
        toast.warning(data.message || 'Connection test finished with notice.')
      }
    } catch (e: any) {
      setTestResult({ success: false, msg: `Test ping error: ${e.message || 'Request failed'}` })
    } finally {
      setTesting(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !endpoint.trim() || (!isEdit && !secretKey.trim())) {
      toast.error('Please fill in required fields.')
      return
    }

    setSaving(true)
    try {
      const url = isEdit
        ? `${apiBase}/admin/federation/peers/${peer!.id}`
        : `${apiBase}/admin/federation/peers`
      const method = isEdit ? 'PUT' : 'POST'
      const bodyPayload: Record<string, unknown> = {
        name: name.trim(),
        endpoint: endpoint.trim().replace(/\/+$/, ''),
        s3_endpoint: s3Endpoint.trim() ? s3Endpoint.trim().replace(/\/+$/, '') : null,
        access_key: accessKey.trim() || 'admin',
      }
      if (!isEdit || secretKey.trim()) {
        bodyPayload.secret_key = secretKey.trim()
      }

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })
      if (res.ok) {
        toast.success(
          isEdit
            ? `Remote peer "${name.trim()}" updated.`
            : `Remote peer "${name.trim()}" connected successfully.`,
        )
        onSuccess()
        onClose()
      } else {
        const msg = await res.text()
        toast.error(`${isEdit ? 'Update' : 'Connection'} failed: ${msg}`)
      }
    } catch (err: any) {
      toast.error(`Network error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return {
    isEdit,
    name,
    setName,
    endpoint,
    handleEndpointChange,
    s3Endpoint,
    setS3Endpoint,
    accessKey,
    setAccessKey,
    secretKey,
    setSecretKey,
    saving,
    testing,
    testResult,
    handleTestConnection,
    handleSubmit,
  }
}

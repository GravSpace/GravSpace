import { useEffect, useState } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Check, Copy, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { copyText } from './federationTypes'

interface StoredSecretRowProps {
  peerId: number
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
}

export function StoredSecretRow({ peerId, apiBase, authFetch }: StoredSecretRowProps) {
  const [reveal, setReveal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [secretValue, setSecretValue] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setReveal(false)
    setSecretValue(null)
    setCopied(false)
  }, [peerId])

  async function fetchSecretOnDemand(): Promise<string | null> {
    if (secretValue !== null) return secretValue
    setLoading(true)
    try {
      const res = await authFetch(`${apiBase}/admin/federation/peers/${peerId}/secret`)
      if (!res.ok) {
        toast.error('Failed to fetch stored secret')
        return null
      }
      const data = await res.json()
      const fetched = typeof data?.secret_key === 'string' ? data.secret_key : ''
      setSecretValue(fetched)
      return fetched
    } catch {
      toast.error('Failed to fetch stored secret')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleReveal() {
    if (reveal) {
      setReveal(false)
      return
    }
    const sec = await fetchSecretOnDemand()
    if (sec !== null) setReveal(true)
  }

  async function handleCopy() {
    const sec = await fetchSecretOnDemand()
    if (!sec) return
    copyText(sec, 'Secret Key')
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div
      data-agent-secret
      className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-muted/35 border border-border/60"
    >
      <div className="min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
          Stored Secret Key
        </span>
        <code className="text-[11px] font-mono text-foreground truncate block mt-0.5 select-all">
          {reveal && secretValue !== null ? secretValue : '••••••••••••••••••••••••'}
        </code>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          disabled={loading}
          aria-label={reveal ? 'Hide stored secret key' : 'Show stored secret key'}
          onClick={handleToggleReveal}
          className="h-7 px-2 rounded-md border border-border/70 bg-background/90 hover:bg-muted text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
          ) : reveal ? (
            <EyeOff className="w-3 h-3" aria-hidden="true" />
          ) : (
            <Eye className="w-3 h-3" aria-hidden="true" />
          )}
          <span>{reveal ? 'Hide' : 'Show'}</span>
        </Button>

        <Button
          type="button"
          disabled={loading}
          aria-label="Copy stored secret key"
          onClick={handleCopy}
          className="h-7 px-2 rounded-md border border-border/70 bg-background/90 hover:bg-muted text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" aria-hidden="true" />
          ) : (
            <Copy className="w-3 h-3" aria-hidden="true" />
          )}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
    </div>
  )
}

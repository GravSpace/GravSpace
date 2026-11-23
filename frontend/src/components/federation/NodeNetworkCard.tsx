import { useState, useEffect } from 'react'
import { Server, Copy, Check, Network, Radio, ShieldCheck, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useAuth } from '../../hooks/useAuth'
import { toast } from 'sonner'

export interface NetworkInfo {
  hostname: string
  local_ip: string
  configured_host: string
  primary_host: string
  admin_port: number
  s3_port: number
  admin_endpoint: string
  s3_endpoint: string
  s3_proxy_path: string
}

interface Props {
  apiBase?: string
}

export function NodeNetworkCard({ apiBase = '/api' }: Props) {
  const { authFetch } = useAuth()
  const [network, setNetwork] = useState<NetworkInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchNetwork = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${apiBase}/admin/system/network`)
      if (res.ok) {
        const data = await res.json()
        setNetwork(data)
      }
    } catch (e: any) {
      console.error('Failed to fetch node network info', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNetwork()
  }, [])

  const handleCopyPeerConfig = () => {
    if (!network) return
    const configText = `Server: ${network.hostname} (${network.local_ip})\nAdmin Endpoint: ${network.admin_endpoint}\nS3 Endpoint: ${network.s3_endpoint}`
    navigator.clipboard.writeText(configText)
    setCopied(true)
    toast.success('Node connection config copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!network && !loading) return null

  return (
    <div className="rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight text-foreground">
                This Node Network Identity
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono font-medium text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                Active Node
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Identitas IP lokal &amp; port server ini untuk koneksi antar-server di 1 jaringan switch / rak.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNetwork}
            disabled={loading}
            className="h-7 px-2 text-xs gap-1 cursor-pointer"
            title="Refresh network identity"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyPeerConfig}
            className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer font-medium"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Node Config'}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
            Rack / LAN IP
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-semibold text-foreground text-xs">
              {network?.local_ip || '127.0.0.1'}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
            Admin Endpoint
          </span>
          <span className="font-mono font-medium text-primary text-xs truncate block" title={network?.admin_endpoint}>
            {network?.admin_endpoint || 'http://127.0.0.1:8080'}
          </span>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
            S3 Storage Endpoint
          </span>
          <span className="font-mono font-medium text-foreground text-xs truncate block" title={network?.s3_endpoint}>
            {network?.s3_endpoint || 'http://127.0.0.1:9001'}
          </span>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
            Node Hostname
          </span>
          <span className="font-mono text-muted-foreground text-xs truncate block">
            {network?.hostname || 'gravspace-node'}
          </span>
        </div>
      </div>
    </div>
  )
}

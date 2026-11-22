import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Activity,
  Copy,
  FolderSync,
  Globe,
  Radio,
  Server,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  copyText,
  formatTimeAgo,
  getLatencyBadge,
  type CrossServerShare,
  type RemoteServer,
} from './federationTypes'

interface PeersTableProps {
  peers: RemoteServer[]
  shares?: CrossServerShare[]
  searchQuery: string
  pingingId: number | null
  onPing: (id: number) => void
  onDelete: (id: number, name: string) => void
  onConnectNew?: () => void
}

export function PeersTable({
  peers,
  shares = [],
  searchQuery,
  pingingId,
  onPing,
  onDelete,
  onConnectNew,
}: PeersTableProps) {
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return peers
    return peers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.endpoint.toLowerCase().includes(q) ||
        (p.s3_endpoint && p.s3_endpoint.toLowerCase().includes(q)) ||
        p.status.toLowerCase().includes(q),
    )
  }, [peers, searchQuery])

  if (peers.length === 0) {
    return (
      <div className="text-center py-14 rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs text-muted-foreground">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-2">
          <Server className="w-5 h-5" />
        </div>
        <p className="font-semibold text-xs text-foreground">No remote peers registered</p>
        <p className="text-[11px] mt-0.5 max-w-sm mx-auto text-muted-foreground">
          Register secondary GravSpace servers to mirror buckets, enable disaster recovery, or distribute datasets across regions.
        </p>
        {onConnectNew && (
          <Button size="sm" onClick={onConnectNew} className="mt-3 h-8 text-xs">
            Connect First Server
          </Button>
        )}
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 rounded-xl border bg-card/80 text-muted-foreground">
        <XCircle className="w-6 h-6 mx-auto text-muted-foreground/40 mb-1" />
        <p className="font-medium text-xs">No peers match "{searchQuery}"</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
      {filtered.map((peer) => {
        const latency = getLatencyBadge(peer.status, peer.latency_ms)
        const boundSharesCount = shares.filter((s) => s.remote_server_id === peer.id).length

        return (
          <div
            key={peer.id}
            className="p-4 rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs hover:border-primary/40 transition-all space-y-3.5 flex flex-col justify-between"
          >
            {/* Header info */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                      <span>{peer.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono font-normal">#{peer.id}</span>
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[200px]">
                        {peer.endpoint}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(peer.endpoint, 'Endpoint')}
                        className="text-muted-foreground/70 hover:text-foreground transition-colors p-0.5"
                        title="Copy endpoint"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={`text-[10px] font-medium border px-2 py-0.5 flex items-center gap-1.5 shrink-0 ${latency.color}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${latency.dot}`} />
                  <span>{latency.label}</span>
                </Badge>
              </div>

              {/* Node Metadata Matrix */}
              <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] font-mono p-2.5 rounded-lg bg-muted/30 border border-border/40">
                <div>
                  <span className="text-muted-foreground font-sans text-[10px] uppercase font-semibold flex items-center gap-1">
                    <Globe className="w-3 h-3" /> S3 Endpoint:
                  </span>
                  <span className="truncate block mt-0.5 text-foreground">{peer.s3_endpoint || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-sans text-[10px] uppercase font-semibold flex items-center gap-1">
                    <Radio className="w-3 h-3" /> Heartbeat:
                  </span>
                  <span className="truncate block mt-0.5 text-foreground">{formatTimeAgo(peer.last_heartbeat)}</span>
                </div>
              </div>

              {/* Linked rules info */}
              <div className="mt-2.5 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <FolderSync className="w-3 h-3 text-primary" />
                  <span>Active Share Rules:</span>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                  {boundSharesCount} rules
                </Badge>
              </div>
            </div>

            {/* Card Action Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={() => onPing(peer.id)}
                disabled={pingingId === peer.id}
              >
                <Activity className={`w-3.5 h-3.5 mr-1.5 ${pingingId === peer.id ? 'animate-spin text-primary' : ''}`} />
                <span>{pingingId === peer.id ? 'Pinging...' : 'Ping Test'}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 px-2"
                onClick={() => onDelete(peer.id, peer.name)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                <span>Remove</span>
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

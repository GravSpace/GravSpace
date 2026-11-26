import { useMemo } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Badge } from '@/components/ui/badge'
import {
  Activity,
  Copy,
  Edit2,
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
  onEdit: (peer: RemoteServer) => void
  onDelete: (id: number, name: string) => void
  onConnectNew?: () => void
}

export function PeersTable({
  peers,
  shares = [],
  searchQuery,
  pingingId,
  onPing,
  onEdit,
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
      <div className="text-center py-12 rounded-xl border border-border/70 bg-card/80 backdrop-blur-xs shadow-xs text-muted-foreground">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary mx-auto mb-2">
          <Server className="w-4 h-4" />
        </div>
        <p className="font-semibold text-xs text-foreground">No remote peers registered</p>
        <p className="text-[11px] mt-0.5 max-w-sm mx-auto text-muted-foreground">
          Register secondary GravSpace servers to mirror buckets, enable disaster recovery, or distribute datasets across regions.
        </p>
        {onConnectNew && (
          <Button
            onClick={onConnectNew}
            className="mt-3 h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold cursor-pointer"
          >
            Connect First Server
          </Button>
        )}
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-10 rounded-xl border border-border/70 bg-card/80 text-muted-foreground">
        <XCircle className="w-5 h-5 mx-auto text-muted-foreground/40 mb-1" />
        <p className="font-medium text-xs">No peers match &quot;{searchQuery}&quot;</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {filtered.map((peer) => {
        const latency = getLatencyBadge(peer.status, peer.latency_ms)
        const boundSharesCount = shares.filter((s) => s.remote_server_id === peer.id).length

        return (
          <div
            key={peer.id}
            className="p-3.5 rounded-xl border border-border/70 bg-card/80 backdrop-blur-xs shadow-xs hover:border-primary/40 transition-colors space-y-3 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Server className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5 truncate">
                      <span className="truncate">{peer.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono tabular-nums font-normal">
                        #{peer.id}
                      </span>
                    </h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[210px]">
                        {peer.endpoint}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(peer.endpoint, 'Endpoint')}
                        aria-label={`Copy endpoint for ${peer.name}`}
                        className="text-muted-foreground/70 hover:text-foreground transition-colors p-0.5 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={`text-[10px] font-medium border px-2 py-0.5 flex items-center gap-1.5 shrink-0 tabular-nums ${latency.color}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${latency.dot}`} />
                  <span>{latency.label}</span>
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2.5 text-[11px] font-mono p-2 rounded-lg bg-muted/30 border border-border/40">
                <div className="min-w-0">
                  <span className="text-muted-foreground font-sans text-[10px] uppercase font-semibold flex items-center gap-1">
                    <Globe className="w-3 h-3" /> S3 Endpoint
                  </span>
                  <span className="truncate block mt-0.5 text-foreground">{peer.s3_endpoint || '—'}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-muted-foreground font-sans text-[10px] uppercase font-semibold flex items-center gap-1">
                    <Radio className="w-3 h-3" /> Heartbeat
                  </span>
                  <span className="truncate block mt-0.5 text-foreground">
                    {formatTimeAgo(peer.last_heartbeat)}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <FolderSync className="w-3 h-3 text-primary" />
                  <span>Active Share Rules</span>
                </div>
                <Badge variant="outline" className="font-mono tabular-nums text-[10px] px-1.5 py-0">
                  {boundSharesCount} rules
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
              <Button
                aria-label={`Ping ${peer.name}`}
                onClick={() => onPing(peer.id)}
                disabled={pingingId === peer.id}
                pendingAnnouncement={`Pinging ${peer.name}`}
                className="h-7 px-2.5 rounded-md border border-border/70 bg-background/90 hover:bg-primary/10 hover:text-primary text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Activity
                  className={`w-3 h-3 ${pingingId === peer.id ? 'animate-spin text-primary' : ''}`}
                  aria-hidden="true"
                />
                <span>{pingingId === peer.id ? 'Pinging...' : 'Ping Test'}</span>
              </Button>

              <div className="flex items-center gap-1">
                <Button
                  aria-label={`Edit ${peer.name}`}
                  onClick={() => onEdit(peer)}
                  className="h-7 px-2.5 rounded-md border border-border/60 bg-background/80 hover:bg-muted text-foreground text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                  <span>Edit</span>
                </Button>

                <Button
                  aria-label={`Remove ${peer.name}`}
                  onClick={() => onDelete(peer.id, peer.name)}
                  className="h-7 px-2 rounded-md text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                  <span>Remove</span>
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

import { AlertTriangle, CheckCircle2, Clock, FolderSync, Server } from 'lucide-react'

interface FederationMetricsBannerProps {
  activeTab: 'shares' | 'peers' | 'queue'
  onSelectTab: (tab: 'shares' | 'peers' | 'queue') => void
  peersCount: number
  onlinePeersCount: number
  sharesCount: number
  pendingQueueCount: number
  failedQueueCount: number
}

export function FederationMetricsBanner({
  activeTab,
  onSelectTab,
  peersCount,
  onlinePeersCount,
  sharesCount,
  pendingQueueCount,
  failedQueueCount,
}: FederationMetricsBannerProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      <div
        onClick={() => onSelectTab('peers')}
        className={`p-3 rounded-xl border border-border/70 bg-card/80 backdrop-blur-xs shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-[1px] hover:border-primary/40 ${
          activeTab === 'peers' ? 'ring-1 ring-primary/35 border-primary/50' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Remote Peers
          </span>
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
            <Server className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mt-1.5 tabular-nums">
          <span className="text-lg font-bold font-mono text-foreground">{peersCount}</span>
          <span className="text-[11px] text-emerald-500 font-medium">{onlinePeersCount} online</span>
        </div>
      </div>

      <div
        onClick={() => onSelectTab('shares')}
        className={`p-3 rounded-xl border border-border/70 bg-card/80 backdrop-blur-xs shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-[1px] hover:border-primary/40 ${
          activeTab === 'shares' ? 'ring-1 ring-primary/35 border-primary/50' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Active Shares
          </span>
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500">
            <FolderSync className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mt-1.5 tabular-nums">
          <span className="text-lg font-bold font-mono text-foreground">{sharesCount}</span>
          <span className="text-[11px] text-muted-foreground">replication rules</span>
        </div>
      </div>

      <div
        onClick={() => onSelectTab('queue')}
        className={`p-3 rounded-xl border border-border/70 bg-card/80 backdrop-blur-xs shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-[1px] hover:border-primary/40 ${
          activeTab === 'queue' ? 'ring-1 ring-primary/35 border-primary/50' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Outbox Queue
          </span>
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mt-1.5 tabular-nums">
          <span className="text-lg font-bold font-mono text-foreground">{pendingQueueCount}</span>
          <span className="text-[11px] text-muted-foreground">active tasks</span>
        </div>
      </div>

      <div
        onClick={() => onSelectTab('queue')}
        className={`p-3 rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-[1px] hover:border-primary/40 ${
          failedQueueCount > 0 ? 'border-rose-500/35' : 'border-border/70'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            RTO / Failover
          </span>
          <div
            className={`p-1.5 rounded-lg ${
              failedQueueCount > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'
            }`}
          >
            {failedQueueCount > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
          </div>
        </div>
        <div className="flex items-baseline gap-2 mt-1.5 tabular-nums">
          <span
            className={`text-xs font-bold ${failedQueueCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}
          >
            {failedQueueCount > 0 ? `${failedQueueCount} Retrying / Failed` : 'Mesh Synchronized'}
          </span>
        </div>
      </div>
    </div>
  )
}

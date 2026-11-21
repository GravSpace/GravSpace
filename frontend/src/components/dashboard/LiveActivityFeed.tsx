import { Activity } from 'lucide-react'
import { Badge } from '../ui/badge'

interface Props {
  liveLogs: any[]
}

export function LiveActivityFeed({ liveLogs }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
      <div className="px-4 pt-3 pb-1.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
          <span className="text-xs font-bold tracking-tight">Live System Activity Feed</span>
        </div>
        <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border">
          Real-time
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y font-mono text-[10px] bg-slate-950/20">
        {liveLogs.length > 0 ? (
          liveLogs.map((log, idx) => {
            const action = log.Action || log.action || ''
            const status = log.Status || log.status || ''
            const user = log.User || log.user || 'system'
            const resource = log.Resource || log.resource || '—'
            const timestamp = log.Timestamp || log.timestamp || ''

            const formattedTime = timestamp
              ? new Date(timestamp).toLocaleTimeString()
              : new Date().toLocaleTimeString()

            const isSuccess = status === 'success' || status === 'allowed'

            return (
              <div key={idx} className="p-2.5 px-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-slate-500 shrink-0 select-none">{formattedTime}</span>
                  <Badge
                    variant="outline"
                    className={`text-[8px] font-bold px-1.5 h-4.5 uppercase tracking-wide shrink-0 ${
                      action.includes('Put')
                        ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5'
                        : action.includes('Delete')
                          ? 'border-rose-500/20 text-rose-500 bg-rose-500/5'
                          : 'border-blue-500/20 text-blue-500 bg-blue-500/5'
                    }`}
                  >
                    {action.replace('s3:', '')}
                  </Badge>
                  <span className="text-slate-700 dark:text-slate-300 font-bold shrink-0 truncate max-w-28" title={user}>
                    @{user}
                  </span>
                  <span className="text-muted-foreground truncate" title={resource}>
                    {resource}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                      isSuccess ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'
                    }`}
                  >
                    {isSuccess ? 'Allowed' : 'Denied'}
                  </span>
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-center py-8 text-muted-foreground italic">
            Waiting for incoming system activities...
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { FileText, Code2, Trash2, ChevronDown, CheckCircle2, XCircle, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { Policy } from './policyTypes'

interface Props {
  policy: Policy
  onView: (policy: Policy) => void
  onDelete: (name: string) => void
}

export function PolicyCard({ policy, onView, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)

  const actions = [...new Set(policy.statement?.flatMap((s) => s.action || []))].slice(0, 5)
  const totalActions = policy.statement?.flatMap((s) => s.action || []).length ?? 0
  const effects = [...new Set(policy.statement?.map((s) => s.effect) || [])]
  const stmtCount = policy.statement?.length ?? 0

  return (
    <div className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-300">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500/15 to-violet-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0 group-hover:from-indigo-500/25 group-hover:to-violet-500/25 transition-colors duration-300">
            <FileText className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold truncate tracking-tight">{policy.name}</span>
              <Badge variant="outline" className="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest font-extrabold border-slate-300 dark:border-slate-700 text-muted-foreground shrink-0">
                Global
              </Badge>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider opacity-50">
              {stmtCount} {stmtCount === 1 ? 'statement' : 'statements'} · {effects.join(' + ')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-[40%] px-4">
          {actions.length === 0 && <span className="text-[10px] text-muted-foreground italic opacity-40">No actions</span>}
          {actions.map((a) => (
            <div key={a} className="flex items-center h-5 px-1.5 rounded bg-amber-500/8 border border-amber-500/15">
              <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-400 font-mono">{a}</span>
            </div>
          ))}
          {totalActions > 5 && <span className="text-[9px] text-muted-foreground opacity-50">+{totalActions - 5} more</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-indigo-500 hover:bg-indigo-500/10"
            onClick={() => onView(policy)}
            title="View JSON"
          >
            <Code2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDelete(policy.name)}
            title="Delete Policy"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/40 ml-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800/80 px-5 py-4 space-y-2.5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Policy Statements</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[9px] px-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(policy, null, 2))
                toast.success('Policy JSON copied.')
              }}
            >
              <Copy className="w-2.5 h-2.5 mr-1" /> Copy JSON
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {policy.statement?.map((stmt, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 space-y-2 ${
                  stmt.effect === 'Allow' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  {stmt.effect === 'Allow' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  )}
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${stmt.effect === 'Allow' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {stmt.effect}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono truncate ml-auto opacity-60">
                    {Array.isArray(stmt.resource) ? stmt.resource[0] : stmt.resource}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {stmt.action?.map((act) => (
                    <span key={act} className="inline-block text-[8px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                      {act}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

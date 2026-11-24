import { useState } from 'react'
import { Copy, Check, Shield, CheckCircle2, XCircle, FileCode } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { Policy } from './policyTypes'

interface Props {
  policy: Policy | null
  onClose: () => void
}

export function PolicyViewDialog({ policy, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  if (!policy) return null

  const jsonStr = JSON.stringify(policy, null, 2)

  function handleCopy() {
    navigator.clipboard.writeText(jsonStr)
    setCopied(true)
    toast.success('Policy document copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const statements = Array.isArray(policy.statement) ? policy.statement : []

  return (
    <Dialog open={!!policy} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl bg-card">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border/50 shrink-0 bg-muted/20 flex flex-row items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base font-semibold tracking-tight truncate font-mono">
                {policy.name}
              </DialogTitle>
              <Badge variant="outline" className="text-[10px] font-mono h-5 shrink-0 px-1.5">
                IAM {policy.version || '2012-10-17'}
              </Badge>
              <Badge variant="secondary" className="text-[10px] h-5 shrink-0 px-1.5">
                {statements.length} {statements.length === 1 ? 'Statement' : 'Statements'}
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              IAM Security Policy Document representation and permission rules.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Visual Statement Breakdown */}
          {statements.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Statements Overview
              </span>
              <div className="space-y-2">
                {statements.map((stmt, idx) => {
                  const isAllow = stmt.effect === 'Allow'
                  const actions = Array.isArray(stmt.action) ? stmt.action : [stmt.action].filter(Boolean)
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-border/60 bg-muted/30 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {isAllow ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Allow
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] font-bold gap-1">
                              <XCircle className="w-3 h-3" /> Deny
                            </Badge>
                          )}
                          <span className="text-[11px] font-mono font-medium text-foreground">
                            Statement #{idx + 1}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[240px]">
                          Resource: <code className="text-primary font-bold">{stmt.resource || '*'}</code>
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {actions.map((act) => (
                          <span
                            key={act}
                            className="px-1.5 py-0.5 rounded-md bg-background border border-border/60 font-mono text-[10px] text-foreground"
                          >
                            {act}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Raw JSON Code Block */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <FileCode className="w-3 h-3" /> JSON Policy Document
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] gap-1 px-2"
                onClick={handleCopy}
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy JSON'}
              </Button>
            </div>
            <pre className="p-3.5 rounded-xl border border-border/60 bg-muted/40 font-mono text-[11px] leading-relaxed text-foreground overflow-x-auto max-h-72 select-text">
              {jsonStr}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t border-border/50 shrink-0 bg-muted/10 flex items-center justify-between sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleCopy}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied to Clipboard' : 'Copy JSON Document'}
          </Button>
          <Button size="sm" onClick={onClose} className="h-8 text-xs px-4">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

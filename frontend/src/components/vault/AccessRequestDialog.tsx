import { useState } from 'react'
import { ShieldAlert, Clock, Send, Lock } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { toast } from 'sonner'
import { type Environment, type VaultSecret, getEnvTheme } from './vaultTypes'

interface Props {
  open: boolean
  onClose: () => void
  secret?: VaultSecret | null
  environment: Environment
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  onRequestCreated: () => void
}

const DURATION_OPTIONS = [
  { label: '15 Mins', value: 15 },
  { label: '30 Mins', value: 30 },
  { label: '1 Hour', value: 60 },
  { label: '4 Hours', value: 240 },
  { label: '24 Hours', value: 1440 },
]

export function AccessRequestDialog({
  open,
  onClose,
  secret,
  environment,
  apiBase,
  authFetch,
  onRequestCreated,
}: Props) {
  const [justification, setJustification] = useState('')
  const [duration, setDuration] = useState(60)
  const [submitting, setSubmitting] = useState(false)

  const targetEnv = secret?.environment || (environment === 'all' ? 'development' : environment)
  const envTheme = getEnvTheme(targetEnv)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!justification.trim()) {
      toast.error('Please provide a justification or ticket reference.')
      return
    }

    setSubmitting(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/access-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret_id: secret?.id || null,
          environment: targetEnv,
          justification: justification.trim(),
          requested_duration_minutes: duration,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to submit PAM request')
      }

      toast.success('Access request submitted for review.')
      setJustification('')
      setDuration(60)
      onRequestCreated()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Error submitting access request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-0 overflow-hidden shadow-xl">
        <DialogHeader className="px-6 py-4 border-b border-border/50 bg-muted/20 flex flex-row items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold tracking-tight">
              Request Just-In-Time Access (PAM)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Privileged elevation request with automated expiration.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-muted/30 border border-border/40 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-muted-foreground block">Target Resource</span>
              <span className="font-mono font-semibold text-foreground text-xs flex items-center gap-1.5 mt-0.5">
                <Lock className="w-3.5 h-3.5 text-primary" />
                {secret ? secret.name : `All ${targetEnv} Secrets`}
              </span>
            </div>
            <Badge variant="outline" className={`text-[10px] ${envTheme.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${envTheme.dot} mr-1 inline-block`} />
              {targetEnv}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              Requested Duration
            </Label>
            <div className="grid grid-cols-5 gap-1.5">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuration(opt.value)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border text-center transition-all ${
                    duration === opt.value
                      ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                      : 'bg-background hover:bg-muted text-muted-foreground border-border/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Business Justification / Ticket # <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="e.g. Incident #1042: Debugging live payment gateway timeout in production."
              className="min-h-[85px] text-xs resize-none"
              required
            />
            <p className="text-[10px] text-muted-foreground">
              Requests are logged in the immutable PAM audit trail and reviewed by security admins.
            </p>
          </div>

          <DialogFooter className="pt-2 flex items-center justify-end gap-2 border-t border-border/50">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
              <Send className="w-3.5 h-3.5" />
              {submitting ? 'Submitting...' : 'Submit Access Request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

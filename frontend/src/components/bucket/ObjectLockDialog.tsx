import { useState, useEffect } from 'react'
import { Lock, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import type { S3Object } from '../../routes/admin/buckets/$bucket'

interface Props {
  object: S3Object
  bucketName: string
  onClose: () => void
  onSaved: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function ObjectLockDialog({ object, bucketName, onClose, onSaved, authFetch, apiBase }: Props) {
  const [mode, setMode] = useState(object.LockMode || '')
  const [untilDate, setUntilDate] = useState(() => {
    if (object.LockUntil) {
      return new Date(object.LockUntil).toISOString().slice(0, 16)
    }
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 16)
  })
  const [saving, setSaving] = useState(false)

  const name = object.Key.split('/').pop() || object.Key

  async function saveLock() {
    setSaving(true)
    try {
      const res = await authFetch(
        `${apiBase}/admin/buckets/${bucketName}/objects/${encodeURIComponent(object.Key)}/lock`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: mode || null,
            retain_until_date: mode ? new Date(untilDate).toISOString() : null,
          }),
        },
      )
      if (!res.ok) {
        const err = await res.text()
        toast.error(`Failed to set lock: ${err}`)
        return
      }
      toast.success('Object lock updated.')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-500" />
            <DialogTitle>Object Lock</DialogTitle>
          </div>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Retention Mode
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(['', 'GOVERNANCE', 'COMPLIANCE'] as const).map((m) => (
                <button
                  key={m || 'none'}
                  onClick={() => setMode(m)}
                  className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                    mode === m
                      ? m === 'COMPLIANCE'
                        ? 'border-red-500 bg-red-500/10 text-red-600'
                        : m === 'GOVERNANCE'
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600'
                          : 'border-slate-500 bg-slate-500/10 text-slate-600'
                      : 'border-slate-200 dark:border-slate-800 text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  {m === '' ? 'None' : m}
                </button>
              ))}
            </div>
          </div>

          {mode && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Retain Until
              </Label>
              <Input
                type="datetime-local"
                value={untilDate}
                onChange={(e) => setUntilDate(e.target.value)}
                className="h-10"
              />
            </div>
          )}

          {mode === 'COMPLIANCE' && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-600 leading-relaxed">
                <strong>Compliance Mode:</strong> No user, including root, can delete or overwrite this object until the retain-until date passes.
              </p>
            </div>
          )}

          {mode === 'GOVERNANCE' && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 leading-relaxed">
                <strong>Governance Mode:</strong> Users with bypass permissions can override this lock.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
            <Button size="sm" onClick={saveLock} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
              Save Lock
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

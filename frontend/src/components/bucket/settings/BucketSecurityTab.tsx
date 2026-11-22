import { useState } from 'react'
import { ShieldAlert, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Label } from '../../ui/label'
import { Switch } from '../../ui/switch'
import { Input } from '../../ui/input'
import { Button } from '../../ui/button'
import type { BucketInfo } from '../../../routes/admin/buckets/$bucket'

interface Props {
  bucketName: string
  info: BucketInfo | null
  onInfoUpdated: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function BucketSecurityTab({ bucketName, info, onInfoUpdated, authFetch, apiBase }: Props) {
  const [retentionMode, setRetentionMode] = useState(info?.DefaultRetentionMode || '')
  const [retentionPeriodDays, setRetentionPeriodDays] = useState(info?.DefaultRetentionDays || 0)
  const [updating, setUpdating] = useState<Record<string, boolean>>({})

  const setUpd = (key: string, val: boolean) => setUpdating((p) => ({ ...p, [key]: val }))

  async function toggleLock(enabled: boolean) {
    setUpd('objectLock', true)
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/object-lock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Failed')
      onInfoUpdated()
    } catch {
      toast.error('Update failed')
    } finally {
      setUpd('objectLock', false)
    }
  }

  async function saveDefaultRetention() {
    setUpd('defaultRetention', true)
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/retention/default`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: retentionMode,
          days: retentionPeriodDays,
        }),
      })
      if (res.ok) {
        toast.success('Default retention updated')
        onInfoUpdated()
      } else {
        toast.error('Failed to update default retention')
      }
    } catch {
      toast.error('Failed to update default retention')
    } finally {
      setUpd('defaultRetention', false)
    }
  }

  return (
    <div className="space-y-6 py-2 px-1">
      <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
        <div className="space-y-0.5">
          <Label className="text-sm font-bold">Object Lock</Label>
          <p className="text-xs text-muted-foreground">Prevent objects from being deleted or overwritten.</p>
        </div>
        <Switch
          checked={!!info?.ObjectLockEnabled}
          disabled={updating['objectLock']}
          onCheckedChange={toggleLock}
        />
      </div>

      {info?.ObjectLockEnabled && (
        <div className="mt-4 space-y-4 pt-4 border-t animate-in fade-in duration-200">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Default Retention</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase">Retention Mode</Label>
              <select
                value={retentionMode}
                onChange={(e) => setRetentionMode(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">None</option>
                <option value="GOVERNANCE">Governance</option>
                <option value="COMPLIANCE">Compliance</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase">Retention Period (Days)</Label>
              <Input
                type="number"
                value={retentionPeriodDays}
                onChange={(e) => setRetentionPeriodDays(Number(e.target.value))}
                className="h-10"
              />
            </div>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-700 leading-relaxed">
              <strong>Compliance Mode:</strong> No user including root can delete objects during retention.{' '}
              <strong>Governance Mode:</strong> Only privileged users can bypass.
            </p>
          </div>
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              onClick={saveDefaultRetention}
              disabled={updating['defaultRetention']}
              className="h-9"
            >
              {updating['defaultRetention'] && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />} Save Default Retention
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

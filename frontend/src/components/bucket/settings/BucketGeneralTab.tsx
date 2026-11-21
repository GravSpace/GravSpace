import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
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

export function BucketGeneralTab({ bucketName, info, onInfoUpdated, authFetch, apiBase }: Props) {
  const [retentionDays, setRetentionDays] = useState(info?.SoftDeleteRetention || 30)
  const [quotaInput, setQuotaInput] = useState('0')
  const [quotaUnit, setQuotaUnit] = useState(1073741824)
  const [updating, setUpdating] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (info?.QuotaBytes) {
      const gb = info.QuotaBytes / 1073741824
      if (Number.isInteger(gb)) {
        setQuotaInput(String(gb))
        setQuotaUnit(1073741824)
      } else {
        setQuotaInput(String(Math.round(info.QuotaBytes / 1048576)))
        setQuotaUnit(1048576)
      }
    }
    setRetentionDays(info?.SoftDeleteRetention || 30)
  }, [info])

  const setUpd = (key: string, val: boolean) => setUpdating((p) => ({ ...p, [key]: val }))

  async function toggle(key: string, endpoint: string, enabled: boolean) {
    setUpd(key, true)
    try {
      const payload = endpoint === 'soft-delete' ? { enabled, retention_days: retentionDays } : { enabled }
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed')
      onInfoUpdated()
    } catch {
      toast.error('Update failed')
    } finally {
      setUpd(key, false)
    }
  }

  async function saveSoftDeleteRetention() {
    setUpd('softDeleteRetention', true)
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/soft-delete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: info?.SoftDeleteEnabled ?? true,
          retention_days: retentionDays,
        }),
      })
      if (res.ok) {
        toast.success('Soft delete retention updated')
        onInfoUpdated()
      } else {
        toast.error('Failed to update soft delete retention')
      }
    } catch {
      toast.error('Failed to update soft delete retention')
    } finally {
      setUpd('softDeleteRetention', false)
    }
  }

  async function saveQuota() {
    setUpd('quota', true)
    const bytes = parseFloat(quotaInput) * quotaUnit
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/quota`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quota: bytes }),
    })
    if (res.ok) {
      toast.success('Quota updated')
      onInfoUpdated()
    } else {
      toast.error('Failed to save quota')
    }
    setUpd('quota', false)
  }

  return (
    <div className="space-y-6 py-2 px-1">
      <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
        <div className="space-y-0.5">
          <Label className="text-sm font-bold">Bucket Versioning</Label>
          <p className="text-xs text-muted-foreground">Keep multiple versions of an object.</p>
        </div>
        <Switch
          checked={!!info?.VersioningEnabled}
          disabled={updating['versioning']}
          onCheckedChange={(v) => toggle('versioning', 'versioning', v)}
        />
      </div>

      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-bold">Soft Delete (Recycle Bin)</Label>
            <p className="text-xs text-muted-foreground">Keep deleted objects for recovery.</p>
          </div>
          <Switch
            checked={!!info?.SoftDeleteEnabled}
            disabled={updating['softDelete']}
            onCheckedChange={(v) => toggle('softDelete', 'soft-delete', v)}
          />
        </div>
        {info?.SoftDeleteEnabled && (
          <div className="flex gap-2 items-center animate-in fade-in duration-200">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground shrink-0">Retention (Days)</Label>
            <Input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="h-9 w-24"
            />
            <Button
              size="sm"
              onClick={saveSoftDeleteRetention}
              disabled={updating['softDeleteRetention']}
              className="h-9"
            >
              {updating['softDeleteRetention'] && <Loader2 className="w-3 h-3 mr-2 animate-spin" />} Save
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4 pt-4 border-t">
        <div className="space-y-0.5">
          <Label className="text-sm font-bold">Bucket Quota</Label>
          <p className="text-xs text-muted-foreground">Limit total storage capacity. Set 0 for unlimited.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Input type="number" value={quotaInput} onChange={(e) => setQuotaInput(e.target.value)} className="h-9 w-24" />
          <select
            value={quotaUnit}
            onChange={(e) => setQuotaUnit(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value={1048576}>MB</option>
            <option value={1073741824}>GB</option>
            <option value={1099511627776}>TB</option>
          </select>
          <Button size="sm" onClick={saveQuota} disabled={updating['quota']} className="h-9">
            {updating['quota'] && <Loader2 className="w-3 h-3 mr-2 animate-spin" />} Save
          </Button>
        </div>
      </div>
    </div>
  )
}

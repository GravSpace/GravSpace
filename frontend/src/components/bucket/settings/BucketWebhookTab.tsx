import { useState } from 'react'
import { Plus, Trash2, BellOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Badge } from '../../ui/badge'
import type { WebhookConfig, DLQRecord } from './settingsTypes'

interface Props {
  bucketName: string
  webhooks: WebhookConfig[]
  dlqRecords: DLQRecord[]
  onRefreshWebhooks: () => void
  onRefreshDLQ: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

const WEBHOOK_EVENTS = ['s3:PutObject', 's3:DeleteObject', 's3:GetObject', 's3:CopyObject', 's3:RestoreObject']

export function BucketWebhookTab({
  bucketName,
  webhooks,
  dlqRecords,
  onRefreshWebhooks,
  onRefreshDLQ,
  authFetch,
  apiBase,
}: Props) {
  const [showAddWebhook, setShowAddWebhook] = useState(false)
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['s3:PutObject'])

  async function addWebhook() {
    if (!newWebhookUrl) return
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: newWebhookUrl, events: newWebhookEvents }),
    })
    if (res.ok) {
      toast.success('Webhook added')
      setShowAddWebhook(false)
      setNewWebhookUrl('')
      onRefreshWebhooks()
    } else {
      toast.error('Failed to add webhook')
    }
  }

  async function deleteWebhook(id: string) {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/webhooks/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Webhook removed')
      onRefreshWebhooks()
    }
  }

  return (
    <div className="space-y-4 py-2 px-1">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notification Endpoints</h4>
        <Button size="sm" onClick={() => setShowAddWebhook(true)}>
          <Plus className="w-3 h-3 mr-1" /> Add Webhook
        </Button>
      </div>

      {showAddWebhook && (
        <div className="p-3 rounded-lg border bg-muted/20 space-y-3 animate-in fade-in duration-200">
          <Input
            placeholder="https://your-endpoint.com/webhook"
            value={newWebhookUrl}
            onChange={(e) => setNewWebhookUrl(e.target.value)}
            className="h-9"
          />
          <div className="flex flex-wrap gap-2">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={newWebhookEvents.includes(ev)}
                  onChange={(e) => {
                    if (e.target.checked) setNewWebhookEvents((p) => [...p, ev])
                    else setNewWebhookEvents((p) => p.filter((x) => x !== ev))
                  }}
                  className="rounded"
                />
                {ev}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addWebhook} disabled={!newWebhookUrl}>Add</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddWebhook(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
        {webhooks.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed rounded-xl opacity-40">
            <BellOff className="w-8 h-8 mx-auto mb-2" />
            <p className="text-xs">No webhooks configured</p>
          </div>
        )}
        {webhooks.map((hook) => (
          <div key={hook.ID} className="p-3 rounded-lg border bg-card group hover:border-primary/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium truncate max-w-[240px]">{hook.URL}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100"
                onClick={() => deleteWebhook(hook.ID)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {JSON.parse(hook.Events || '[]').map((ev: string) => (
                <Badge key={ev} variant="secondary" className="text-[8px] h-4">{ev}</Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-4 border-t">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Dead-Letter Queue</h4>
            {dlqRecords.length > 0 && <Badge variant="destructive" className="text-[9px]">{dlqRecords.length} failed</Badge>}
          </div>
          <Button size="sm" variant="outline" onClick={onRefreshDLQ} className="h-7 text-[10px]">Refresh</Button>
        </div>
        <div className="border rounded-lg overflow-hidden bg-card/50 max-h-[200px] overflow-y-auto">
          {dlqRecords.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">No failed webhook deliveries</p>
          ) : (
            dlqRecords.map((r) => (
              <div key={r.id} className="p-3 text-xs border-b last:border-0 hover:bg-muted/20">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[8px] border-rose-500/20 text-rose-500">{r.event_name}</Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">{r.url}</span>
                </div>
                <p className="text-rose-400 text-[10px] mt-1 font-mono">{r.error_message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

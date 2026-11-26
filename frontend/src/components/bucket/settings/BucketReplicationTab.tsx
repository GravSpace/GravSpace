import { useState } from 'react'
import { Database, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Badge } from '../../ui/badge'
import type { ReplicationRule } from './settingsTypes'

interface Props {
  bucketName: string
  rules: ReplicationRule[]
  bucketsList: string[]
  onRefreshRules: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function BucketReplicationTab({
  bucketName,
  rules,
  bucketsList,
  onRefreshRules,
  authFetch,
  apiBase,
}: Props) {
  const [newReplication, setNewReplication] = useState({ destinationBucket: '', prefix: '' })

  async function addReplicationRule() {
    if (!newReplication.destinationBucket) return
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/replication`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReplication),
    })
    if (res.ok) {
      toast.success('Replication rule added')
      onRefreshRules()
      setNewReplication({ destinationBucket: '', prefix: '' })
    } else {
      toast.error('Failed to add replication rule')
    }
  }

  async function deleteReplicationRule(id: string) {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/replication/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Replication rule removed')
      onRefreshRules()
    }
  }

  return (
    <div className="space-y-4 py-2 px-1">
      <div className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider">Create Replication Rule</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Destination Bucket</Label>
            <select
              value={newReplication.destinationBucket}
              onChange={(e) => setNewReplication((p) => ({ ...p, destinationBucket: e.target.value }))}
              className="w-full text-xs h-9 bg-background border border-input rounded-md px-3"
            >
              <option value="" disabled>Select target bucket...</option>
              {bucketsList.filter((b) => b !== bucketName).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Prefix Filter (Optional)</Label>
            <Input
              value={newReplication.prefix}
              onChange={(e) => setNewReplication((p) => ({ ...p, prefix: e.target.value }))}
              placeholder="e.g. logs/"
              className="h-9 text-xs"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={addReplicationRule} disabled={!newReplication.destinationBucket} className="text-xs h-9">
            Add Rule
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Rules</h3>
        {rules.length === 0 ? (
          <div className="flex flex-col items-center p-8 border border-dashed rounded-lg text-muted-foreground gap-2">
            <Database className="w-8 h-8 text-slate-300" />
            <span className="text-xs font-semibold">No active replication rules</span>
          </div>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <p className="text-sm font-mono font-bold">{rule.destination_bucket}</p>
                <p className="text-[10px] text-muted-foreground">Prefix: {rule.prefix || '*'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="text-[9px] bg-emerald-500/10 text-emerald-500 border-0">Active</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-rose-500 hover:bg-rose-500/10"
                  onClick={() => deleteReplicationRule(rule.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

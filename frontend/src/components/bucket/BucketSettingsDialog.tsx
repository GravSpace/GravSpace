import { useState, useEffect } from 'react'
import { Settings, Loader2, Plus, Trash2, BellOff, Globe, Shield, Database, Webhook, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { Badge } from '../ui/badge'
import type { BucketInfo } from '../../routes/admin/buckets/$bucket'

interface Props {
  open: boolean
  onClose: () => void
  bucketName: string
  bucketInfo: BucketInfo | null
  onInfoUpdated: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

interface WebhookConfig {
  ID: string
  URL: string
  Events: string
}

interface DLQRecord {
  id: string
  event_name: string
  url: string
  error_message: string
  payload: string
  failed_at: string
}

interface CorsRule {
  allowed_origins: string[]
  allowed_methods: string[]
  allowed_headers: string[]
  expose_headers: string[]
  max_age_seconds: number
  originsInput: string
  headersInput: string
  exposeHeadersInput: string
}

interface ReplicationRule {
  id: string
  destination_bucket: string
  prefix: string
}

export function BucketSettingsDialog({
  open,
  onClose,
  bucketName,
  bucketInfo: initialInfo,
  onInfoUpdated,
  authFetch,
  apiBase,
}: Props) {
  const [activeTab, setActiveTab] = useState('general')
  const [info, setInfo] = useState<BucketInfo | null>(initialInfo)

  // Webhook
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [dlqRecords, setDlqRecords] = useState<DLQRecord[]>([])
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['s3:PutObject'])
  const [showAddWebhook, setShowAddWebhook] = useState(false)

  // CORS
  const [corsRules, setCorsRules] = useState<CorsRule[]>([])
  const [savingCors, setSavingCors] = useState(false)

  // Website
  const [websiteConfig, setWebsiteConfig] = useState({ enabled: false, indexDocument: 'index.html', errorDocument: 'error.html' })

  // Replication
  const [replicationRules, setReplicationRules] = useState<ReplicationRule[]>([])
  const [bucketsList, setBucketsList] = useState<string[]>([])
  const [newReplication, setNewReplication] = useState({ destinationBucket: '', prefix: '' })

  // Quota
  const [quotaInput, setQuotaInput] = useState('0')
  const [quotaUnit, setQuotaUnit] = useState(1073741824)

  // Soft Delete Retention Days
  const [retentionDays, setRetentionDays] = useState(30)

  const [updating, setUpdating] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (open) {
      setInfo(initialInfo)
      fetchWebhooks()
      fetchDLQ()
      fetchCors()
      fetchWebsite()
      fetchReplication()
      fetchBuckets()
      if (initialInfo?.QuotaBytes) {
        const gb = initialInfo.QuotaBytes / 1073741824
        if (Number.isInteger(gb)) { setQuotaInput(String(gb)); setQuotaUnit(1073741824) }
        else { setQuotaInput(String(Math.round(initialInfo.QuotaBytes / 1048576))); setQuotaUnit(1048576) }
      }
      setRetentionDays(initialInfo?.SoftDeleteRetention || 30)
    }
  }, [open, initialInfo])

  const setUpd = (key: string, val: boolean) => setUpdating(p => ({ ...p, [key]: val }))

  async function fetchWebhooks() {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/webhooks`)
    if (res.ok) setWebhooks(await res.json().then(d => d || []))
  }
  async function fetchDLQ() {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/webhooks/dlq`)
    if (res.ok) setDlqRecords(await res.json().then(d => d || []))
  }
  async function fetchCors() {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/cors`)
    if (res.ok) {
      const data = await res.json()
      const rules = (data || []).map((r: any) => ({
        ...r,
        originsInput: (r.allowed_origins || []).join(', '),
        headersInput: (r.allowed_headers || []).join(', '),
        exposeHeadersInput: (r.expose_headers || []).join(', '),
      }))
      setCorsRules(rules)
    }
  }
  async function fetchWebsite() {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/website`)
    if (res.ok) {
      const d = await res.json()
      if (d) {
        setWebsiteConfig({
          enabled: true,
          indexDocument: d.index_document?.suffix || 'index.html',
          errorDocument: d.error_document?.key || '',
        })
      }
    }
  }
  async function fetchReplication() {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/replication`)
    if (res.ok) setReplicationRules(await res.json().then(d => d || []))
  }
  async function fetchBuckets() {
    const res = await authFetch(`${apiBase}/admin/buckets`)
    if (res.ok) setBucketsList(await res.json())
  }

  async function toggle(key: string, endpoint: string, enabled: boolean) {
    setUpd(key, true)
    try {
      const payload = endpoint === 'soft-delete'
        ? { enabled, retention_days: retentionDays }
        : { enabled }
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed')
      setInfo(p => p ? { ...p, ...fromEndpoint(endpoint, enabled) } : p)
      onInfoUpdated()
    } catch { toast.error('Update failed') }
    finally { setUpd(key, false) }
  }

  async function saveSoftDeleteRetention() {
    setUpd('softDeleteRetention', true)
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/soft-delete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: info?.SoftDeleteEnabled ?? true,
          retention_days: retentionDays
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

  async function saveDefaultRetention() {
    setUpd('defaultRetention', true)
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/retention/default`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: info?.DefaultRetentionMode || '',
          days: info?.DefaultRetentionDays || 0
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

  function fromEndpoint(endpoint: string, enabled: boolean): Partial<BucketInfo> {
    if (endpoint === 'versioning') return { VersioningEnabled: enabled }
    if (endpoint === 'soft-delete') return { SoftDeleteEnabled: enabled }
    if (endpoint === 'object-lock') return { ObjectLockEnabled: enabled }
    return {}
  }

  async function saveQuota() {
    setUpd('quota', true)
    const bytes = parseFloat(quotaInput) * quotaUnit
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/quota`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quota: bytes }),
    })
    if (res.ok) { toast.success('Quota updated'); onInfoUpdated() }
    else toast.error('Failed to save quota')
    setUpd('quota', false)
  }

  async function addWebhook() {
    if (!newWebhookUrl) return
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: newWebhookUrl, events: newWebhookEvents }),
    })
    if (res.ok) { toast.success('Webhook added'); setShowAddWebhook(false); setNewWebhookUrl(''); fetchWebhooks() }
    else toast.error('Failed to add webhook')
  }

  async function deleteWebhook(id: string) {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/webhooks/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Webhook removed'); fetchWebhooks() }
  }

  async function saveCors() {
    setSavingCors(true)
    const rules = corsRules.map(r => ({
      allowed_origins: r.originsInput.split(',').map(s => s.trim()).filter(Boolean),
      allowed_methods: r.allowed_methods,
      allowed_headers: r.headersInput.split(',').map(s => s.trim()).filter(Boolean),
      expose_headers: r.exposeHeadersInput ? r.exposeHeadersInput.split(',').map(s => s.trim()).filter(Boolean) : [],
      max_age_seconds: r.max_age_seconds,
    }))
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/cors`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rules),
    })
    if (res.ok) toast.success('CORS configuration saved')
    else toast.error('Failed to save CORS')
    setSavingCors(false)
  }

  async function handleWebsiteToggle(enabled: boolean) {
    if (!enabled) {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/website`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Website hosting disabled')
        setWebsiteConfig({ enabled: false, indexDocument: 'index.html', errorDocument: '' })
        onInfoUpdated()
      } else {
        toast.error('Failed to disable website hosting')
      }
    } else {
      setWebsiteConfig(p => ({ ...p, enabled: true }))
    }
  }

  async function saveWebsite() {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/website`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        index_document: { suffix: websiteConfig.indexDocument },
        error_document: websiteConfig.errorDocument ? { key: websiteConfig.errorDocument } : null,
      }),
    })
    if (res.ok) {
      toast.success('Website configuration saved successfully')
      onInfoUpdated()
    } else {
      toast.error('Failed to update website config')
    }
  }

  async function addReplicationRule() {
    if (!newReplication.destinationBucket) return
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/replication`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReplication),
    })
    if (res.ok) { toast.success('Replication rule added'); fetchReplication(); setNewReplication({ destinationBucket: '', prefix: '' }) }
    else toast.error('Failed to add replication rule')
  }

  async function deleteReplicationRule(id: string) {
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/replication/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Replication rule removed'); fetchReplication() }
  }

  const WEBHOOK_EVENTS = ['s3:PutObject', 's3:DeleteObject', 's3:GetObject', 's3:CopyObject', 's3:RestoreObject']

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <DialogTitle>Bucket Settings: <span className="text-primary italic">{bucketName}</span></DialogTitle>
          </div>
          <DialogDescription>Configure advanced features and notifications for this bucket.</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col mt-4">
          <TabsList className="grid w-full grid-cols-6 shrink-0">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="website">Website</TabsTrigger>
            <TabsTrigger value="cors">CORS</TabsTrigger>
            <TabsTrigger value="replication">Replication</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            {/* ===== GENERAL ===== */}
            <TabsContent value="general" className="space-y-6 py-2 px-1">
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
            </TabsContent>

            {/* ===== WEBHOOKS ===== */}
            <TabsContent value="webhooks" className="space-y-4 py-2 px-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notification Endpoints</h4>
                <Button size="sm" onClick={() => setShowAddWebhook(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Add Webhook
                </Button>
              </div>

              {showAddWebhook && (
                <div className="p-3 rounded-lg border bg-muted/20 space-y-3 animate-in fade-in duration-200">
                  <Input placeholder="https://your-endpoint.com/webhook" value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} className="h-9" />
                  <div className="flex flex-wrap gap-2">
                    {WEBHOOK_EVENTS.map(ev => (
                      <label key={ev} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={newWebhookEvents.includes(ev)} onChange={(e) => {
                          if (e.target.checked) setNewWebhookEvents(p => [...p, ev])
                          else setNewWebhookEvents(p => p.filter(x => x !== ev))
                        }} className="rounded" />
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
                {webhooks.map(hook => (
                  <div key={hook.ID} className="p-3 rounded-lg border bg-card group hover:border-primary/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate max-w-[240px]">{hook.URL}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100" onClick={() => deleteWebhook(hook.ID)}>
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

              {/* DLQ */}
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Dead-Letter Queue</h4>
                    {dlqRecords.length > 0 && <Badge variant="destructive" className="text-[9px]">{dlqRecords.length} failed</Badge>}
                  </div>
                  <Button size="sm" variant="outline" onClick={fetchDLQ} className="h-7 text-[10px]">Refresh</Button>
                </div>
                <div className="border rounded-lg overflow-hidden bg-card/50 max-h-[200px] overflow-y-auto">
                  {dlqRecords.length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">No failed webhook deliveries</p>
                  ) : dlqRecords.map(r => (
                    <div key={r.id} className="p-3 text-xs border-b last:border-0 hover:bg-muted/20">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[8px] border-rose-500/20 text-rose-500">{r.event_name}</Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">{r.url}</span>
                      </div>
                      <p className="text-rose-400 text-[10px] mt-1 font-mono">{r.error_message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ===== SECURITY ===== */}
            <TabsContent value="security" className="space-y-6 py-2 px-1">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold">Object Lock</Label>
                  <p className="text-xs text-muted-foreground">Prevent objects from being deleted or overwritten.</p>
                </div>
                <Switch
                  checked={!!info?.ObjectLockEnabled}
                  disabled={updating['objectLock']}
                  onCheckedChange={(v) => toggle('objectLock', 'object-lock', v)}
                />
              </div>

              {info?.ObjectLockEnabled && (
                <div className="mt-4 space-y-4 pt-4 border-t animate-in fade-in duration-200">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Default Retention</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase">Retention Mode</Label>
                      <select
                        value={info.DefaultRetentionMode || ''}
                        onChange={(e) => setInfo(p => p ? { ...p, DefaultRetentionMode: e.target.value } : p)}
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
                        value={info.DefaultRetentionDays || 0}
                        onChange={(e) => setInfo(p => p ? { ...p, DefaultRetentionDays: Number(e.target.value) } : p)}
                        className="h-10"
                      />
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 leading-relaxed">
                      <strong>Compliance Mode:</strong> No user including root can delete objects during retention. <strong>Governance Mode:</strong> Only privileged users can bypass.
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
            </TabsContent>

            {/* ===== WEBSITE ===== */}
            <TabsContent value="website" className="space-y-6 py-2 px-1">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold">Static Website Hosting</Label>
                  <p className="text-xs text-muted-foreground">Host a static website directly from this bucket.</p>
                </div>
                <Switch
                  checked={websiteConfig.enabled}
                  onCheckedChange={handleWebsiteToggle}
                />
              </div>

              {websiteConfig.enabled && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase">Index Document</Label>
                    <Input value={websiteConfig.indexDocument} onChange={(e) => setWebsiteConfig(p => ({ ...p, indexDocument: e.target.value }))} placeholder="index.html" className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase">Error Document (Optional)</Label>
                    <Input value={websiteConfig.errorDocument} onChange={(e) => setWebsiteConfig(p => ({ ...p, errorDocument: e.target.value }))} placeholder="error.html" className="h-10" />
                  </div>
                  <Button onClick={saveWebsite} className="w-full">Save Website Configuration</Button>

                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-4">
                    <div className="flex items-start gap-3">
                      <Globe className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-blue-700 mb-1">Website Endpoint</p>
                        <code className="text-[10px] text-blue-600 break-all">
                          {`${typeof window !== 'undefined' ? window.location.protocol : 'http:'}//${typeof window !== 'undefined' ? window.location.host : 'localhost'}/website/${bucketName}/`}
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ===== CORS ===== */}
            <TabsContent value="cors" className="space-y-4 py-2 px-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">Cross-Origin Resource Sharing</h3>
                  <p className="text-xs text-muted-foreground">Configure access from other domains.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  setCorsRules(p => [...p, { allowed_origins: [], allowed_methods: ['GET'], allowed_headers: [], expose_headers: [], max_age_seconds: 3000, originsInput: '', headersInput: '', exposeHeadersInput: '' }])
                }}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Rule
                </Button>
              </div>

              {corsRules.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed rounded-xl text-muted-foreground opacity-50">
                  <Globe className="w-8 h-8 mx-auto mb-2 text-indigo-500" />
                  <p className="text-xs">No CORS rules configured</p>
                </div>
              )}

              {corsRules.map((rule, i) => (
                <div key={i} className="p-4 rounded-xl border bg-card/50 space-y-4 relative">
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Rule #{i + 1}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setCorsRules(p => p.filter((_, j) => j !== i))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Allowed Origins</Label>
                      <Input value={rule.originsInput} onChange={(e) => setCorsRules(p => p.map((r, j) => j === i ? { ...r, originsInput: e.target.value } : r))} placeholder="*, https://example.com" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Allowed Headers</Label>
                      <Input value={rule.headersInput} onChange={(e) => setCorsRules(p => p.map((r, j) => j === i ? { ...r, headersInput: e.target.value } : r))} placeholder="*, Authorization" className="h-9" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Allowed Methods</Label>
                    <div className="flex flex-wrap gap-4">
                      {['GET', 'PUT', 'POST', 'DELETE', 'HEAD'].map(m => (
                        <label key={m} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={rule.allowed_methods.includes(m)} onChange={(e) => {
                            const methods = e.target.checked ? [...rule.allowed_methods, m] : rule.allowed_methods.filter(x => x !== m)
                            setCorsRules(p => p.map((r, j) => j === i ? { ...r, allowed_methods: methods } : r))
                          }} className="rounded" />
                          <span className="font-bold">{m}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Max Age (s)</Label>
                      <Input type="number" value={rule.max_age_seconds} onChange={(e) => setCorsRules(p => p.map((r, j) => j === i ? { ...r, max_age_seconds: Number(e.target.value) } : r))} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Expose Headers</Label>
                      <Input value={rule.exposeHeadersInput} onChange={(e) => setCorsRules(p => p.map((r, j) => j === i ? { ...r, exposeHeadersInput: e.target.value } : r))} placeholder="ETag, x-amz-request-id" className="h-9" />
                    </div>
                  </div>
                </div>
              ))}

              {corsRules.length > 0 && (
                <div className="flex justify-end pt-2">
                  <Button onClick={saveCors} disabled={savingCors}>
                    {savingCors && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save CORS Configuration
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ===== REPLICATION ===== */}
            <TabsContent value="replication" className="space-y-4 py-2 px-1">
              <div className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider">Create Replication Rule</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Destination Bucket</Label>
                    <select
                      value={newReplication.destinationBucket}
                      onChange={(e) => setNewReplication(p => ({ ...p, destinationBucket: e.target.value }))}
                      className="w-full text-xs h-9 bg-background border border-input rounded-md px-3"
                    >
                      <option value="" disabled>Select target bucket...</option>
                      {bucketsList.filter(b => b !== bucketName).map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Prefix Filter (Optional)</Label>
                    <Input value={newReplication.prefix} onChange={(e) => setNewReplication(p => ({ ...p, prefix: e.target.value }))} placeholder="e.g. logs/" className="h-9 text-xs" />
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
                {replicationRules.length === 0 ? (
                  <div className="flex flex-col items-center p-8 border border-dashed rounded-lg text-muted-foreground gap-2">
                    <Database className="w-8 h-8 text-slate-300" />
                    <span className="text-xs font-semibold">No active replication rules</span>
                  </div>
                ) : (
                  replicationRules.map(rule => (
                    <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div>
                        <p className="text-sm font-mono font-bold">{rule.destination_bucket}</p>
                        <p className="text-[10px] text-muted-foreground">Prefix: {rule.prefix || '*'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="text-[9px] bg-emerald-500/10 text-emerald-500 border-0">Active</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:bg-rose-500/10" onClick={() => deleteReplicationRule(rule.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

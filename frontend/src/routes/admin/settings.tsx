import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { Settings, RefreshCw, Loader2, Save, Server, Slack as SlackIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { useAuth } from '../../hooks/useAuth'

export const Route = createFileRoute('/admin/settings')({
  component: SettingsPage,
  head: () => ({ meta: [{ title: 'Settings | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export function SettingsPage() {
  const { authFetch } = useAuth()
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/settings`)
      if (res.ok) setSettings(await res.json())
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { fetchSettings() }, [])

  async function saveSettings() {
    setSaving(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) toast.success('Settings saved.')
      else toast.error('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  function set(key: string, value: any) {
    setSettings(p => ({ ...p, [key]: value }))
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">System Settings</h1>
          <p className="text-xs text-muted-foreground">Configure global server and storage parameters.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchSettings} disabled={loading} className="h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={saveSettings} disabled={saving} className="h-8">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
            Save Settings
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 max-w-3xl">
        <Tabs defaultValue="general">
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Server className="w-3.5 h-3.5" /> Server Configuration
              </h3>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Region</Label>
                <Input value={settings.region || ''} onChange={(e) => set('region', e.target.value)} placeholder="us-east-1" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Max Upload Size (MB)</Label>
                <Input type="number" value={settings.max_upload_mb || ''} onChange={(e) => set('max_upload_mb', Number(e.target.value))} placeholder="1024" className="h-10" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="storage" className="space-y-6">
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Deduplication &amp; Compression</h3>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold">Enable Deduplication</Label>
                  <p className="text-xs text-muted-foreground">Store unique data blocks only once.</p>
                </div>
                <Switch checked={!!settings.dedup_enabled} onCheckedChange={(v) => set('dedup_enabled', v)} />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold">Enable Compression</Label>
                  <p className="text-xs text-muted-foreground">Gzip-compress stored objects to reduce disk usage.</p>
                </div>
                <Switch checked={!!settings.compression_enabled} onCheckedChange={(v) => set('compression_enabled', v)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Authentication</h3>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Token Expiry (Hours)</Label>
                <Input type="number" value={settings.token_expiry_hours || ''} onChange={(e) => set('token_expiry_hours', Number(e.target.value))} placeholder="24" className="h-10" />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold">Force HTTPS</Label>
                  <p className="text-xs text-muted-foreground">Reject non-TLS connections.</p>
                </div>
                <Switch checked={!!settings.force_https} onCheckedChange={(v) => set('force_https', v)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <SlackIcon className="w-3.5 h-3.5" /> Slack Notifications
              </h3>
              <p className="text-xs text-muted-foreground">
                Receive alerts for critical system events like Lifecycle Failures and Mass Deletions.
              </p>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  value={settings.slack_webhook_url || ''}
                  onChange={(e) => set('slack_webhook_url', e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="h-10 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Get your webhook URL from Slack's Incoming Webhooks integration.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

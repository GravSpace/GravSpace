import { useState } from 'react'
import {
  Activity,
  Globe,
  Key,
  Link2,
  Loader2,
  Server,
  Shield,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function ConnectPeerDialog({ open, onClose, onSuccess, authFetch, apiBase }: Props) {
  const [name, setName] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; latency?: number; msg: string } | null>(null)

  function resetForm() {
    setName('')
    setEndpoint('')
    setS3Endpoint('')
    setAccessKey('')
    setSecretKey('')
    setTestResult(null)
  }

  async function handleTestConnection() {
    if (!endpoint.trim()) {
      toast.error('Please enter the Admin API Endpoint first.')
      return
    }

    setTesting(true)
    setTestResult(null)
    const start = Date.now()

    try {
      const cleanedUrl = endpoint.trim().replace(/\/+$/, '')
      const testUrl = `${cleanedUrl}/health`

      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 4000)

      const res = await fetch(testUrl, { method: 'GET', signal: ctrl.signal }).catch(() => null)
      clearTimeout(t)
      const elapsed = Date.now() - start

      if (res && (res.ok || res.status < 500)) {
        setTestResult({
          success: true,
          latency: elapsed,
          msg: `Online (${elapsed}ms latency) - Ready to connect`,
        })
        toast.success(`Node reachable: ${elapsed}ms`)
      } else {
        setTestResult({
          success: false,
          msg: 'Node responded or behind proxy. Credentials will be verified on ping.',
        })
        toast.warning('Node check completed with notice.')
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        msg: `Pre-flight timeout: ${e.message || 'Connection refused'}. You can still register the peer for retry monitoring.`,
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !endpoint.trim() || !secretKey.trim()) {
      toast.error('Please fill in required fields (Name, Endpoint, Secret/Token)')
      return
    }

    setSaving(true)
    try {
      const res = await authFetch(`${apiBase}/admin/federation/peers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          endpoint: endpoint.trim().replace(/\/+$/, ''),
          s3_endpoint: s3Endpoint.trim() ? s3Endpoint.trim().replace(/\/+$/, '') : null,
          access_key: accessKey.trim() || 'admin',
          secret_key: secretKey.trim(),
        }),
      })

      if (res.ok) {
        toast.success(`Remote peer "${name}" connected successfully.`)
        resetForm()
        onSuccess()
        onClose()
      } else {
        const msg = await res.text()
        toast.error(`Connection failed: ${msg}`)
      }
    } catch (err: any) {
      toast.error(`Network error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForm(); onClose() } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
              <Server className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm font-bold tracking-tight text-foreground">
                Connect Remote GravSpace Server
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Register a peer GravSpace instance for cross-server replication & disaster recovery.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleConnect} className="space-y-3.5 py-1 text-xs">
          {/* Peer Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Peer Server Identifier</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Singapore DR Cluster"
              className="h-9 text-xs"
              required
            />
          </div>

          {/* Admin API Endpoint with inline Test Ping */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Admin API Endpoint (HTTP/HTTPS)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={endpoint}
                  onChange={(e) => {
                    setEndpoint(e.target.value)
                    setTestResult(null)
                  }}
                  placeholder="http://192.168.1.50:8080"
                  className="h-9 text-xs pl-8.5 font-mono"
                  required
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testing || !endpoint.trim()}
                className="h-9 px-3 text-xs shrink-0 font-medium"
              >
                {testing ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Activity className="w-3.5 h-3.5 mr-1.5 text-primary" />
                )}
                <span>Test Ping</span>
              </Button>
            </div>

            {testResult && (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border ${
                  testResult.success
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${testResult.success ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span>{testResult.msg}</span>
              </div>
            )}
          </div>

          {/* S3 Storage Endpoint */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">S3 Storage Endpoint</Label>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Optional</span>
            </div>
            <div className="relative">
              <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={s3Endpoint}
                onChange={(e) => setS3Endpoint(e.target.value)}
                placeholder="http://192.168.1.50:9001"
                className="h-9 text-xs pl-8.5 font-mono"
              />
            </div>
          </div>

          {/* Credentials */}
          <div className="grid grid-cols-2 gap-3 pt-0.5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Access Key ID</Label>
              <div className="relative">
                <Key className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="admin"
                  className="h-9 text-xs pl-8.5 font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Secret Key / Token</Label>
              <div className="relative">
                <Shield className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Secret or JWT"
                  className="h-9 text-xs pl-8.5 font-mono"
                  required
                />
              </div>
            </div>
          </div>

          {/* Dialog Action Buttons */}
          <DialogFooter className="pt-3 border-t border-border/40 gap-2 flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { resetForm(); onClose() }}
              disabled={saving}
              className="h-9 text-xs font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="h-9 text-xs px-4 font-semibold shadow-xs"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Server className="w-3.5 h-3.5 mr-1.5" />
              )}
              Connect Server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

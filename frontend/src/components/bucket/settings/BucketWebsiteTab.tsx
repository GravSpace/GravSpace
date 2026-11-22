import { useState } from 'react'
import { Globe } from 'lucide-react'
import { toast } from 'sonner'
import { Label } from '../../ui/label'
import { Switch } from '../../ui/switch'
import { Input } from '../../ui/input'
import { Button } from '../../ui/button'

interface Props {
  bucketName: string
  initialConfig: { enabled: boolean; indexDocument: string; errorDocument: string }
  onInfoUpdated: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function BucketWebsiteTab({ bucketName, initialConfig, onInfoUpdated, authFetch, apiBase }: Props) {
  const [websiteConfig, setWebsiteConfig] = useState(initialConfig)

  async function handleWebsiteToggle(enabled: boolean) {
    if (!enabled) {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/website`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Website hosting disabled')
        setWebsiteConfig({ enabled: false, indexDocument: 'index.html', errorDocument: '' })
        onInfoUpdated()
      } else {
        toast.error('Failed to disable website hosting')
      }
    } else {
      setWebsiteConfig((p) => ({ ...p, enabled: true }))
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

  return (
    <div className="space-y-6 py-2 px-1">
      <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
        <div className="space-y-0.5">
          <Label className="text-sm font-bold">Static Website Hosting</Label>
          <p className="text-xs text-muted-foreground">Host a static website directly from this bucket.</p>
        </div>
        <Switch checked={websiteConfig.enabled} onCheckedChange={handleWebsiteToggle} />
      </div>

      {websiteConfig.enabled && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase">Index Document</Label>
            <Input
              value={websiteConfig.indexDocument}
              onChange={(e) => setWebsiteConfig((p) => ({ ...p, indexDocument: e.target.value }))}
              placeholder="index.html"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase">Error Document (Optional)</Label>
            <Input
              value={websiteConfig.errorDocument}
              onChange={(e) => setWebsiteConfig((p) => ({ ...p, errorDocument: e.target.value }))}
              placeholder="error.html"
              className="h-10"
            />
          </div>
          <Button onClick={saveWebsite} className="w-full">Save Website Configuration</Button>

          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-4">
            <div className="flex items-start gap-3">
              <Globe className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[10px] font-bold text-blue-700 mb-1">Website Endpoint</p>
                <code className="text-[10px] text-blue-600 break-all">
                  {`${typeof window !== 'undefined' ? window.location.protocol : 'http:'}//${
                    typeof window !== 'undefined' ? window.location.host : 'localhost'
                  }/website/${bucketName}/`}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

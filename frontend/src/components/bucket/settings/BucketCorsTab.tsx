import { useState } from 'react'
import { Globe, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Label } from '../../ui/label'
import { Input } from '../../ui/input'
import { Button } from '../../ui/button'
import type { CorsRule } from './settingsTypes'

interface Props {
  bucketName: string
  rules: CorsRule[]
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function BucketCorsTab({ bucketName, rules: initialRules, authFetch, apiBase }: Props) {
  const [corsRules, setCorsRules] = useState<CorsRule[]>(initialRules)
  const [savingCors, setSavingCors] = useState(false)

  async function saveCors() {
    setSavingCors(true)
    const payload = corsRules.map((r) => ({
      allowed_origins: r.originsInput.split(',').map((s) => s.trim()).filter(Boolean),
      allowed_methods: r.allowed_methods,
      allowed_headers: r.headersInput.split(',').map((s) => s.trim()).filter(Boolean),
      expose_headers: r.exposeHeadersInput ? r.exposeHeadersInput.split(',').map((s) => s.trim()).filter(Boolean) : [],
      max_age_seconds: r.max_age_seconds,
    }))
    const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/cors`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) toast.success('CORS configuration saved')
    else toast.error('Failed to save CORS')
    setSavingCors(false)
  }

  return (
    <div className="space-y-4 py-2 px-1">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">Cross-Origin Resource Sharing</h3>
          <p className="text-xs text-muted-foreground">Configure access from other domains.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setCorsRules((p) => [
              ...p,
              {
                allowed_origins: [],
                allowed_methods: ['GET'],
                allowed_headers: [],
                expose_headers: [],
                max_age_seconds: 3000,
                originsInput: '',
                headersInput: '',
                exposeHeadersInput: '',
              },
            ])
          }
        >
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setCorsRules((p) => p.filter((_, j) => j !== i))}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Allowed Origins</Label>
              <Input
                value={rule.originsInput}
                onChange={(e) => setCorsRules((p) => p.map((r, j) => (j === i ? { ...r, originsInput: e.target.value } : r)))}
                placeholder="*, https://example.com"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Allowed Headers</Label>
              <Input
                value={rule.headersInput}
                onChange={(e) => setCorsRules((p) => p.map((r, j) => (j === i ? { ...r, headersInput: e.target.value } : r)))}
                placeholder="*, Authorization"
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Allowed Methods</Label>
            <div className="flex flex-wrap gap-4">
              {['GET', 'PUT', 'POST', 'DELETE', 'HEAD'].map((m) => (
                <label key={m} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rule.allowed_methods.includes(m)}
                    onChange={(e) => {
                      const methods = e.target.checked
                        ? [...rule.allowed_methods, m]
                        : rule.allowed_methods.filter((x) => x !== m)
                      setCorsRules((p) => p.map((r, j) => (j === i ? { ...r, allowed_methods: methods } : r)))
                    }}
                    className="rounded"
                  />
                  <span className="font-bold">{m}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Max Age (s)</Label>
              <Input
                type="number"
                value={rule.max_age_seconds}
                onChange={(e) => setCorsRules((p) => p.map((r, j) => (j === i ? { ...r, max_age_seconds: Number(e.target.value) } : r)))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Expose Headers</Label>
              <Input
                value={rule.exposeHeadersInput}
                onChange={(e) => setCorsRules((p) => p.map((r, j) => (j === i ? { ...r, exposeHeadersInput: e.target.value } : r)))}
                placeholder="ETag, x-amz-request-id"
                className="h-9"
              />
            </div>
          </div>
        </div>
      ))}

      {corsRules.length > 0 && (
        <div className="flex justify-end pt-2">
          <Button onClick={saveCors} disabled={savingCors}>
            {savingCors && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save CORS Configuration
          </Button>
        </div>
      )}
    </div>
  )
}

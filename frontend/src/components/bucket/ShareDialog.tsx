import { useState } from 'react'
import { Copy, Loader2, Share2, CheckCircle } from 'lucide-react'
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
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

const EXPIRY_OPTIONS = [
  { label: '15 minutes', value: 900 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '24 hours', value: 86400 },
  { label: '7 days', value: 604800 },
]

export function ShareDialog({ object, bucketName, onClose, authFetch, apiBase }: Props) {
  const [expiresIn, setExpiresIn] = useState(3600)
  const [loading, setLoading] = useState(false)
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const name = object.Key.split('/').pop() || object.Key

  async function generatePresignedUrl() {
    setLoading(true)
    setPresignedUrl(null)
    try {
      const res = await authFetch(
        `${apiBase}/admin/buckets/${bucketName}/objects/share`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: object.Key,
            expirySeconds: expiresIn,
          }),
        },
      )
      if (!res.ok) {
        const err = await res.text()
        toast.error(`Failed to generate URL: ${err}`)
        return
      }
      const data = await res.json()
      setPresignedUrl(data.url || data.URL)
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard() {
    if (!presignedUrl) return
    navigator.clipboard.writeText(presignedUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('URL copied to clipboard')
    })
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            <DialogTitle>Share Object</DialogTitle>
          </div>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Expiry Duration
            </Label>
            <div className="flex flex-wrap gap-2">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExpiresIn(opt.value)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    expiresIn === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-slate-200 dark:border-slate-800 text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button className="w-full h-10" onClick={generatePresignedUrl} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
            {loading ? 'Generating...' : 'Generate Presigned URL'}
          </Button>

          {presignedUrl && (
            <div className="space-y-2 animate-in fade-in duration-200">
              <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Presigned URL
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={presignedUrl}
                  className="h-10 font-mono text-[10px] bg-muted"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button variant="outline" size="icon" onClick={copyToClipboard} className="h-10 w-10 shrink-0">
                  {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                This URL grants temporary public access to the file. It expires after the selected duration.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Shield, RefreshCw, Copy, CheckCircle, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { useAuth } from '../../hooks/useAuth'

export const Route = createFileRoute('/admin/presigns')({
  component: PresignsPage,
  head: () => ({ meta: [{ title: 'Presigned Links | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

interface PresignEntry {
  id: string
  key: string
  bucket: string
  expires_at: string
  url: string
  method: string
  created_at: string
}

const EXPIRY_OPTIONS = [
  { label: '15 min', value: 900 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '24 hours', value: 86400 },
  { label: '7 days', value: 604800 },
]

function isExpired(date: string) {
  return new Date(date) < new Date()
}

export function PresignsPage() {
  const { authFetch } = useAuth()
  const [links, setLinks] = useState<PresignEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newBucket, setNewBucket] = useState('')
  const [newKey, setNewKey] = useState('')
  const [expiresIn, setExpiresIn] = useState(3600)
  const [method, setMethod] = useState('GET')
  const [creating, setCreating] = useState(false)
  const [buckets, setBuckets] = useState<string[]>([])

  const fetchLinks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/presigns`)
      if (res.ok) setLinks(await res.json().then(d => d || []))
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => {
    fetchLinks()
    authFetch(`${API_BASE}/admin/buckets`).then(r => r.ok ? r.json() : []).then(setBuckets)
  }, [])

  function copyUrl(entry: PresignEntry) {
    navigator.clipboard.writeText(entry.url).then(() => {
      setCopiedId(entry.id)
      setTimeout(() => setCopiedId(null), 2000)
      toast.success('URL copied')
    })
  }

  async function revokeLink(id: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/presigns/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to revoke')
        await fetchLinks()
      },
      { loading: 'Revoking...', success: 'Link revoked.', error: 'Failed to revoke link.' },
    )
  }

  async function createLink() {
    if (!newBucket || !newKey) return
    setCreating(true)
    try {
      const res = await authFetch(
        `${API_BASE}/admin/buckets/${newBucket}/objects/share`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: newKey,
            expirySeconds: expiresIn,
          }),
        },
      )
      if (res.ok) {
        toast.success('Presigned link created')
        setShowCreate(false)
        fetchLinks()
      } else {
        toast.error('Failed to create link')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Presigned Links</h1>
          <p className="text-xs text-muted-foreground">Manage temporary signed object URLs.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchLinks} disabled={loading} className="h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="h-8">
            <Plus className="w-3.5 h-3.5 mr-2" /> Create Link
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {links.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground opacity-40">
            <Shield className="w-14 h-14 mb-3" />
            <p className="text-sm font-medium">No presigned links</p>
          </div>
        )}

        <div className="space-y-3">
          {links.map((link) => {
            const expired = isExpired(link.expires_at)
            return (
              <div key={link.id} className={`rounded-xl border bg-card p-4 transition-all ${expired ? 'opacity-50' : 'hover:border-primary/20'}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[9px] font-mono font-bold">
                        {link.method || 'GET'}
                      </Badge>
                      <span className="text-sm font-mono font-semibold truncate">
                        {link.bucket}/{link.key}
                      </span>
                      {expired && <Badge variant="destructive" className="text-[9px]">Expired</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate opacity-70">{link.url}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Expires: {new Date(link.expires_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyUrl(link)}>
                      {copiedId === link.id ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => revokeLink(link.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Presigned Link</DialogTitle>
            <DialogDescription>Generate a temporary signed URL for an object.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Bucket</Label>
              <select
                value={newBucket}
                onChange={(e) => setNewBucket(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>Select bucket...</option>
                {buckets.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Object Key</Label>
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="path/to/object.ext" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <div className="flex gap-2">
                {['GET', 'PUT'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`px-4 py-2 rounded-lg border text-xs font-bold transition-all ${method === m ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 dark:border-slate-800 text-muted-foreground'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Expiry</Label>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setExpiresIn(opt.value)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${expiresIn === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 dark:border-slate-800 text-muted-foreground'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createLink} disabled={!newBucket || !newKey || creating}>
                {creating ? 'Generating...' : 'Create Link'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

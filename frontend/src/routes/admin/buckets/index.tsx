import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  RefreshCw,
  Plus,
  Database,
  Lock,
  MoreHorizontal,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Settings,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Switch } from '../../../components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import { useAuth } from '../../../hooks/useAuth'

export const Route = createFileRoute('/admin/buckets/')({
  component: BucketsPage,
  head: () => ({ meta: [{ title: 'Buckets | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

interface BucketInfo {
  VersioningEnabled?: boolean
  ObjectLockEnabled?: boolean
  CurrentSize?: number
  QuotaBytes?: number
  SoftDeleteEnabled?: boolean
}

function BucketsPage() {
  const { authFetch } = useAuth()
  const navigate = useNavigate()
  const [buckets, setBuckets] = useState<string[]>([])
  const [users, setUsers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [bucketInfoCache, setBucketInfoCache] = useState<Record<string, BucketInfo>>({})
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newBucketName, setNewBucketName] = useState('')
  const [creating, setCreating] = useState(false)

  const filteredBuckets = useMemo(() => {
    if (!searchQuery.trim()) return buckets
    const q = searchQuery.toLowerCase()
    return buckets.filter((b) => b.toLowerCase().includes(q))
  }, [buckets, searchQuery])

  const fetchBuckets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/buckets`)
      if (res.ok) {
        const list: string[] = await res.json()
        setBuckets(list)
        // Fetch bucket info in parallel
        const infos = await Promise.allSettled(
          list.map(async (name) => {
            const r = await authFetch(`${API_BASE}/admin/buckets/${name}/info`)
            if (r.ok) return { name, info: await r.json() }
            return null
          }),
        )
        const cache: Record<string, BucketInfo> = {}
        infos.forEach((r) => {
          if (r.status === 'fulfilled' && r.value) {
            cache[r.value.name] = r.value.info
          }
        })
        setBucketInfoCache(cache)
      } else {
        toast.error('Sync failed: Could not synchronize buckets.')
      }
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/admin/users`)
      if (res.ok) setUsers(await res.json())
    } catch {}
  }, [authFetch])

  useEffect(() => {
    fetchBuckets()
    fetchUsers()
  }, [])

  function isPublic(bucket: string): boolean {
    const anon = users['anonymous']
    if (!anon?.policies) return false
    const resource = `arn:aws:s3:::${bucket}/*`
    return anon.policies.some((p: any) =>
      p.statement.some((s: any) => {
        if (s.effect !== 'Allow' || !s.action.includes('s3:GetObject')) return false
        return s.resource.some(
          (r: string) =>
            r === '*' || r === resource || (r.endsWith('*') && resource.startsWith(r.slice(0, -1))),
        )
      }),
    )
  }

  async function togglePublic(bucket: string) {
    const currentlyPublic = isPublic(bucket)
    const resource = `arn:aws:s3:::${bucket}/*`
    const pName = `PublicAccess-${bucket}-Root`
    try {
      if (currentlyPublic) {
        await authFetch(`${API_BASE}/admin/users/anonymous/policies/${pName}`, { method: 'DELETE' })
        toast.success(`Public access removed from "${bucket}".`)
      } else {
        await authFetch(`${API_BASE}/admin/users/anonymous/policies`, {
          method: 'POST',
          body: JSON.stringify({
            name: pName,
            version: '2012-10-17',
            statement: [{ effect: 'Allow', action: ['s3:GetObject', 's3:ListBucket'], resource: [resource] }],
          }),
        })
        toast.success(`"${bucket}" is now publicly accessible.`)
      }
      await fetchUsers()
    } catch {
      toast.error('Policy update failed.')
    }
  }

  async function createBucket() {
    const name = newBucketName.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/buckets/${name}`, { method: 'PUT' })
      if (res.ok) {
        toast.success(`Bucket "${name}" provisioned successfully.`)
        setShowCreateDialog(false)
        setNewBucketName('')
        await fetchBuckets()
      } else {
        const err = await res.text()
        toast.error(`Provision failed: ${err || 'Unknown error'}`)
      }
    } finally {
      setCreating(false)
    }
  }

  async function deleteBucket(name: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/buckets/${name}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to delete bucket')
        await fetchBuckets()
      },
      {
        loading: `Deleting bucket "${name}"...`,
        success: `Bucket "${name}" has been decommissioned.`,
        error: (err: Error) => `Failed to delete: ${err.message}`,
      },
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      {/* Header */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Buckets</h1>
          <p className="text-xs text-muted-foreground">Manage your cloud storage infrastructure.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text"
              placeholder="Filter buckets..."
              className="h-8 w-44 pl-8 pr-3 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchBuckets} disabled={loading} className="h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} className="h-8">
            <Plus className="w-3.5 h-3.5 mr-2" /> New Bucket
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {/* Loading Skeleton */}
        {loading && buckets.length === 0 && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-[72px] rounded-xl animate-pulse bg-muted/40 border border-slate-200/50 dark:border-slate-800/50" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredBuckets.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <Database className="w-12 h-12 opacity-20 mb-3" />
            <p className="text-sm font-medium">No buckets found</p>
            <p className="text-xs opacity-60 mt-1">
              {searchQuery ? 'Try a different search term' : 'Create your first bucket to get started'}
            </p>
          </div>
        )}

        {/* Bucket List */}
        {filteredBuckets.length > 0 && (
          <div className="space-y-2.5">
            {filteredBuckets.map((bucket) => {
              const info = bucketInfoCache[bucket]
              const pub = isPublic(bucket)
              const quotaPct =
                info?.QuotaBytes && info.QuotaBytes > 0
                  ? Math.min(100, Math.round((info.CurrentSize! / info.QuotaBytes) * 100))
                  : 0

              return (
                <div
                  key={bucket}
                  className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-300 cursor-pointer"
                  onClick={() => navigate({ to: '/admin/buckets/$bucket', params: { bucket } })}
                >
                  <div className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/10 to-indigo-500/10 border border-primary/15 flex items-center justify-center shrink-0 group-hover:from-primary/20 group-hover:to-indigo-500/20 transition-colors duration-300">
                        <Database className="w-4.5 h-4.5 text-primary group-hover:scale-110 transition-transform duration-300" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-sm truncate tracking-tight" title={bucket}>
                            {bucket}
                          </span>
                          <Badge
                            variant={pub ? 'default' : 'outline'}
                            className={`text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest font-extrabold shrink-0 ${
                              pub
                                ? 'bg-emerald-500 hover:bg-emerald-500 text-white'
                                : 'border-slate-300 dark:border-slate-700 text-muted-foreground'
                            }`}
                          >
                            {pub ? 'Public' : 'Private'}
                          </Badge>
                          {info?.VersioningEnabled && (
                            <Badge variant="outline" className="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest font-extrabold border-violet-500/30 text-violet-500 shrink-0">
                              Versioned
                            </Badge>
                          )}
                          {info?.ObjectLockEnabled && (
                            <Badge variant="outline" className="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest font-extrabold border-amber-500/30 text-amber-500 shrink-0">
                              <Lock className="w-2.5 h-2.5 mr-0.5" /> Locked
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider opacity-50">
                            Standard Storage
                          </span>
                          {info?.CurrentSize !== undefined && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatSize(info.CurrentSize)}
                            </span>
                          )}
                        </div>
                        {/* Quota bar */}
                        {!!(info?.QuotaBytes && info.QuotaBytes > 0) && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="w-24 h-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${quotaPct >= 90 ? 'bg-rose-500' : quotaPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${quotaPct}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {quotaPct}% of {formatSize(info.QuotaBytes)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => navigate({ to: '/admin/buckets/$bucket', params: { bucket } })}>
                            <Database className="w-4 h-4 mr-2" /> Browse Objects
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => togglePublic(bucket)}>
                            {pub ? <ShieldOff className="w-4 h-4 mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                            {pub ? 'Make Private' : 'Make Public'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => deleteBucket(bucket)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete Bucket
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Create Bucket Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Provision New Bucket</DialogTitle>
            <DialogDescription>
              Create a new S3-compatible object storage container.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bucket-name">Bucket Name</Label>
              <Input
                id="bucket-name"
                value={newBucketName}
                onChange={(e) => setNewBucketName(e.target.value)}
                placeholder="e.g. my-storage-bucket"
                onKeyDown={(e) => e.key === 'Enter' && createBucket()}
                autoFocus
                className="h-10"
              />
              <p className="text-[10px] text-muted-foreground">
                Lowercase letters, numbers, and hyphens only. 3–63 characters.
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createBucket} disabled={!newBucketName.trim() || creating}>
                {creating ? 'Provisioning...' : 'Create Bucket'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

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
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
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
import { BucketFederationBadge } from '../../../components/bucket/FederationBadge'
import { useBucketFederation } from '../../../components/bucket/useBucketFederation'

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
  const { shares, inboundShares, refreshFederation, dismissInbound } = useBucketFederation(API_BASE, authFetch)
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
      const [res] = await Promise.all([
        authFetch(`${API_BASE}/admin/buckets`),
        refreshFederation(),
      ])
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
    if (!anon?.policies || !Array.isArray(anon.policies)) return false
    const resource = `arn:aws:s3:::${bucket}/*`
    return anon.policies.some((p: any) => {
      let statements: any[] = []
      if (Array.isArray(p?.statement)) statements = p.statement
      else if (Array.isArray(p?.Statement)) statements = p.Statement
      else if (typeof p?.data === 'string') {
        try {
          const parsed = JSON.parse(p.data)
          statements = parsed.Statement || parsed.statement || []
        } catch {}
      }

      return Array.isArray(statements) && statements.some((s: any) => {
        if (!s) return false
        const effect = s.effect || s.Effect || ''
        if (effect !== 'Allow') return false
        const rawAction = s.action || s.Action || []
        const actions = Array.isArray(rawAction) ? rawAction : [rawAction]
        const hasGet = actions.some(
          (a: any) => typeof a === 'string' && (a === '*' || a === 's3:*' || a.includes('s3:GetObject')),
        )
        if (!hasGet) return false
        const rawRes = s.resource || s.Resource || []
        const resources = Array.isArray(rawRes) ? rawRes : [rawRes]
        return resources.some(
          (r: any) =>
            typeof r === 'string' &&
            (r === '*' || r === resource || (r.endsWith('*') && resource.startsWith(r.slice(0, -1)))),
        )
      })
    })
  }

  async function togglePublic(bucket: string) {
    const currentlyPublic = isPublic(bucket)
    const resource = `arn:aws:s3:::${bucket}/*`
    let policyToDelete = `PublicAccess-${bucket}-Root`

    const anon = users['anonymous']
    if (anon?.policies && Array.isArray(anon.policies)) {
      const match = anon.policies.find((p: any) => {
        let stmts = p.statement || p.Statement || []
        if (typeof p.data === 'string' && !stmts.length) {
          try { stmts = JSON.parse(p.data).Statement || [] } catch {}
        }
        return Array.isArray(stmts) && stmts.some((s: any) => {
          const raw = s.resource || s.Resource || []
          const list = Array.isArray(raw) ? raw : [raw]
          return list.some((r: any) => r === '*' || r === resource)
        })
      })
      if (match?.name) policyToDelete = match.name
    }

    try {
      if (currentlyPublic) {
        const res = await authFetch(`${API_BASE}/admin/users/anonymous/policies/${encodeURIComponent(policyToDelete)}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to remove public policy')
        toast.success(`Public access removed from "${bucket}".`)
      } else {
        const res = await authFetch(`${API_BASE}/admin/users/anonymous/policies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: policyToDelete,
            version: '2012-10-17',
            statement: [{ effect: 'Allow', action: ['s3:GetObject', 's3:ListBucket'], resource: [resource] }],
            policy: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: ['s3:GetObject', 's3:ListBucket'], Resource: [resource] }] },
          }),
        })
        if (!res.ok) throw new Error('Failed to apply public policy')
        toast.success(`"${bucket}" is now publicly accessible.`)
      }
      await fetchUsers()
    } catch (err: any) {
      toast.error(err?.message || 'Policy update failed.')
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

  const [syncing, setSyncing] = useState(false)

  async function handleSyncAll() {
    setSyncing(true)
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/buckets/sync`, { method: 'POST' })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        await fetchBuckets()
        return data
      },
      {
        loading: 'Synchronizing all buckets with filesystem...',
        success: (data: any) =>
          `Sync completed: ${data.synced ?? 0} indexed, ${data.pruned ?? 0} pruned (${data.duration ?? ''})`,
        error: (err: Error) => `Sync failed: ${err.message}`,
        finally: () => setSyncing(false),
      },
    )
  }

  async function handleSyncBucket(name: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/buckets/${name}/sync`, { method: 'POST' })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        await fetchBuckets()
        return data
      },
      {
        loading: `Synchronizing bucket "${name}"...`,
        success: (data: any) =>
          `Bucket "${name}" synchronized: ${data.synced ?? 0} indexed, ${data.pruned ?? 0} pruned`,
        error: (err: Error) => `Sync failed: ${err.message}`,
      },
    )
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
      <header className="min-h-14 sm:min-h-16 h-auto py-2.5 sm:py-0 border-b bg-card/50 backdrop-blur-md px-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 sticky top-0 z-10">
        <div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight">Buckets</h1>
          <p className="hidden sm:block text-xs text-muted-foreground">Manage your cloud storage infrastructure.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto" suppressHydrationWarning>
          <div className="relative flex-1 min-w-[140px] sm:flex-none" suppressHydrationWarning>
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text"
              autoComplete="off"
              data-protonpass-ignore="true"
              data-1p-ignore="true"
              suppressHydrationWarning
              placeholder="Filter buckets..."
              className="h-8 w-full sm:w-44 pl-8 pr-3 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAll}
            disabled={loading || syncing}
            aria-label="Sync Filesystem"
            className="h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 sm:mr-2 ${loading || syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Filesystem</span>
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} className="h-8">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Bucket
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-3.5 sm:p-6">
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
                          <BucketFederationBadge bucket={bucket} shares={shares} inboundShares={inboundShares} onDismissInbound={dismissInbound} />
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
                          <DropdownMenuItem onClick={() => handleSyncBucket(bucket)}>
                            <RefreshCw className="w-4 h-4 mr-2" /> Sync Filesystem
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

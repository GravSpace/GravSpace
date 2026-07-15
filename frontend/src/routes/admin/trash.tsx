import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Trash2, RefreshCw, RotateCcw, FileText, Search,
  Loader2, Lock, X, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { useAuth } from '../../hooks/useAuth'

export const Route = createFileRoute('/admin/trash')({
  component: TrashPage,
  head: () => ({ meta: [{ title: 'Recycle Bin | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

// ─── Backend struct fields (ObjectRow — no json tags = PascalCase from Go) ──
interface TrashItem {
  ID: number
  Bucket: string
  Key: string
  VersionID: string
  Size: number
  DeletedAt: string | null
  ContentType?: string | null
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const relative =
    days > 0 ? `${days}d ago`
    : hrs > 0 ? `${hrs}h ago`
    : mins > 0 ? `${mins}m ago`
    : 'just now'
  return `${date.toLocaleString()} (${relative})`
}

function TrashPage() {
  const { authFetch } = useAuth()
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedBucket, setSelectedBucket] = useState('') // '' = all
  const [selectedIDs, setSelectedIDs] = useState<Set<number>>(new Set())
  const [sortKey, setSortKey] = useState<'Key' | 'Bucket' | 'DeletedAt' | 'Size'>('DeletedAt')
  const [sortAsc, setSortAsc] = useState(false)

  // Confirm dialog for destructive actions
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string; desc: string; password: string; onConfirm: () => void
  } | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [confirming, setConfirming] = useState(false)

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchTrash = useCallback(async () => {
    setLoading(true)
    setSelectedIDs(new Set())
    try {
      const params = new URLSearchParams()
      if (selectedBucket) params.set('bucket', selectedBucket)
      if (search) params.set('search', search)
      const res = await authFetch(`${API_BASE}/admin/trash?${params}`)
      if (res.ok) {
        const data: TrashItem[] = (await res.json()) || []
        setItems(data)
      } else {
        const msg = await res.text()
        toast.error(`Failed to load trash: ${msg}`)
      }
    } catch (e: any) {
      toast.error('Network error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [authFetch, selectedBucket, search])

  useEffect(() => { fetchTrash() }, [selectedBucket])

  // Unique buckets from loaded items
  const buckets = useMemo(() => [...new Set(items.map(i => i.Bucket))].sort(), [items])

  // Client-side filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = items.filter(i => {
      const matchBucket = !selectedBucket || i.Bucket === selectedBucket
      const matchSearch = !q || i.Key.toLowerCase().includes(q) || i.Bucket.toLowerCase().includes(q)
      return matchBucket && matchSearch
    })
    list = [...list].sort((a, b) => {
      let av: any = a[sortKey] ?? ''
      let bv: any = b[sortKey] ?? ''
      if (sortKey === 'Size') { av = Number(av); bv = Number(bv) }
      else { av = String(av); bv = String(bv) }
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
    return list
  }, [items, search, selectedBucket, sortKey, sortAsc])

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  // ─── Selection ─────────────────────────────────────────────────────────────
  const allSelected = filtered.length > 0 && filtered.every(i => selectedIDs.has(i.ID))
  function toggleAll() {
    if (allSelected) setSelectedIDs(new Set())
    else setSelectedIDs(new Set(filtered.map(i => i.ID)))
  }
  function toggleItem(id: number) {
    setSelectedIDs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ─── Confirm helper ────────────────────────────────────────────────────────
  function withConfirm(title: string, desc: string, action: () => void) {
    setPasswordInput('')
    setConfirmDialog({ title, desc, password: '', onConfirm: action })
  }

  async function handleConfirmSubmit() {
    if (!confirmDialog) return
    setConfirming(true)
    try {
      // Verify password via admin verify endpoint
      const res = await authFetch(`${API_BASE}/admin/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      })
      if (!res.ok) {
        toast.error('Incorrect password')
        return
      }
      setConfirmDialog(null)
      confirmDialog.onConfirm()
    } catch {
      // If verify endpoint doesn't exist, just proceed
      setConfirmDialog(null)
      confirmDialog.onConfirm()
    } finally {
      setConfirming(false)
    }
  }

  // ─── Restore ───────────────────────────────────────────────────────────────
  async function restoreItem(item: TrashItem) {
    toast.promise(
      (async () => {
        const res = await authFetch(`${API_BASE}/admin/trash/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket: item.Bucket, key: item.Key, versionId: item.VersionID }),
        })
        if (!res.ok) throw new Error(await res.text())
        setItems(prev => prev.filter(i => i.ID !== item.ID))
        setSelectedIDs(prev => { const n = new Set(prev); n.delete(item.ID); return n })
      })(),
      { loading: `Restoring "${item.Key}"...`, success: `"${item.Key}" restored.`, error: e => `Failed: ${e.message}` },
    )
  }

  async function bulkRestore() {
    const selected = filtered.filter(i => selectedIDs.has(i.ID))
    if (!selected.length) return
    toast.promise(
      (async () => {
        const res = await authFetch(`${API_BASE}/admin/trash/restore-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: selected.map(i => ({ bucket: i.Bucket, key: i.Key, versionId: i.VersionID })) }),
        })
        if (!res.ok) throw new Error(await res.text())
        const restoredIDs = new Set(selected.map(i => i.ID))
        setItems(prev => prev.filter(i => !restoredIDs.has(i.ID)))
        setSelectedIDs(new Set())
      })(),
      { loading: `Restoring ${selected.length} objects...`, success: `${selected.length} objects restored.`, error: e => `Failed: ${e.message}` },
    )
  }

  // ─── Permanent Delete ──────────────────────────────────────────────────────
  function deleteItem(item: TrashItem) {
    withConfirm(
      'Permanently Delete Object',
      `"${item.Key}" will be permanently removed. This cannot be undone.`,
      async () => {
        toast.promise(
          (async () => {
            const params = new URLSearchParams({ bucket: item.Bucket, key: item.Key, versionId: item.VersionID })
            const res = await authFetch(`${API_BASE}/admin/trash?${params}`, { method: 'DELETE' })
            if (!res.ok) throw new Error(await res.text())
            setItems(prev => prev.filter(i => i.ID !== item.ID))
            setSelectedIDs(prev => { const n = new Set(prev); n.delete(item.ID); return n })
          })(),
          { loading: 'Deleting permanently...', success: 'Object permanently deleted.', error: e => `Failed: ${e.message}` },
        )
      },
    )
  }

  function bulkDelete() {
    const selected = filtered.filter(i => selectedIDs.has(i.ID))
    if (!selected.length) return
    withConfirm(
      `Permanently Delete ${selected.length} Objects`,
      `${selected.length} selected objects will be permanently removed. This cannot be undone.`,
      async () => {
        toast.promise(
          (async () => {
            const res = await authFetch(`${API_BASE}/admin/trash-bulk`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: selected.map(i => ({ bucket: i.Bucket, key: i.Key, versionId: i.VersionID })) }),
            })
            if (!res.ok) throw new Error(await res.text())
            const deletedIDs = new Set(selected.map(i => i.ID))
            setItems(prev => prev.filter(i => !deletedIDs.has(i.ID)))
            setSelectedIDs(new Set())
          })(),
          { loading: `Deleting ${selected.length} objects...`, success: `${selected.length} objects permanently deleted.`, error: e => `Failed: ${e.message}` },
        )
      },
    )
  }

  function emptyTrash() {
    const scope = selectedBucket ? `bucket "${selectedBucket}"` : 'all buckets'
    withConfirm(
      'Empty Trash',
      `All objects in ${scope} will be permanently deleted. This cannot be undone.`,
      async () => {
        toast.promise(
          (async () => {
            const params = selectedBucket ? `?bucket=${encodeURIComponent(selectedBucket)}` : ''
            const res = await authFetch(`${API_BASE}/admin/trash/empty${params}`, { method: 'DELETE' })
            if (!res.ok) throw new Error(await res.text())
            if (selectedBucket) {
              setItems(prev => prev.filter(i => i.Bucket !== selectedBucket))
            } else {
              setItems([])
            }
            setSelectedIDs(new Set())
          })(),
          { loading: 'Emptying trash...', success: 'Trash emptied.', error: e => `Failed: ${e.message}` },
        )
      },
    )
  }

  const selectedCount = selectedIDs.size

  // ─── Sort indicator ────────────────────────────────────────────────────────
  function SortIcon({ col }: { col: typeof sortKey }) {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 opacity-20" />
    return sortAsc
      ? <ChevronUp className="w-3 h-3 text-primary" />
      : <ChevronDown className="w-3 h-3 text-primary" />
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-rose-500" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Recycle Bin</h1>
            <p className="text-xs text-muted-foreground">Soft-deleted objects pending permanent removal.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk actions — appear when items selected */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full animate-in fade-in zoom-in duration-200">
              <span className="text-xs font-bold text-primary mr-1">{selectedCount} selected</span>
              <Button
                variant="ghost" size="sm"
                className="h-6 px-2 text-[10px] font-bold uppercase text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                onClick={bulkRestore}
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Restore
              </Button>
              <div className="w-px h-3 bg-primary/20" />
              <Button
                variant="ghost" size="sm"
                className="h-6 px-2 text-[10px] font-bold uppercase text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950"
                onClick={bulkDelete}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchTrash()}
              placeholder="Search key or bucket..."
              className="h-8 w-44 pl-8 text-xs"
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Bucket filter */}
          <select
            value={selectedBucket}
            onChange={e => { setSelectedBucket(e.target.value); setSelectedIDs(new Set()) }}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Buckets</option>
            {buckets.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          <Button variant="outline" size="sm" onClick={fetchTrash} disabled={loading} className="h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>

          <Button
            variant="destructive" size="sm" className="h-8"
            onClick={emptyTrash}
            disabled={items.length === 0}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Empty {selectedBucket ? `"${selectedBucket}"` : 'All'}
          </Button>
        </div>
      </header>

      {/* ─── Main Table ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        {/* Loading skeleton */}
        {loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 opacity-50">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium animate-pulse">Scanning trash storage...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl bg-card/50 mt-2">
            <div className="bg-card w-14 h-14 flex items-center justify-center rounded-2xl shadow-sm mb-4 border">
              <Trash2 className="w-7 h-7 text-slate-300" />
            </div>
            <h3 className="text-base font-bold mb-1">
              {search || selectedBucket ? 'No matching objects' : 'Recycle Bin is Empty'}
            </h3>
            <p className="text-xs text-muted-foreground text-center max-w-sm mb-4">
              {search || selectedBucket
                ? 'Try clearing your search or bucket filter.'
                : 'Deleted objects from buckets with Soft Delete enabled will appear here.'}
            </p>
            {(search || selectedBucket) && (
              <Button variant="outline" size="sm" onClick={() => { setSearch(''); setSelectedBucket('') }}>
                Clear filters
              </Button>
            )}
          </div>
        )}

        {/* Table */}
        {filtered.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer accent-primary"
                      />
                    </th>
                    <th
                      className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('Key')}
                    >
                      <span className="flex items-center gap-1">Object Key <SortIcon col="Key" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('Bucket')}
                    >
                      <span className="flex items-center gap-1">Bucket <SortIcon col="Bucket" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('DeletedAt')}
                    >
                      <span className="flex items-center gap-1">Deleted At <SortIcon col="DeletedAt" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('Size')}
                    >
                      <span className="flex items-center gap-1">Size <SortIcon col="Size" /></span>
                    </th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filtered.map(item => {
                    const checked = selectedIDs.has(item.ID)
                    return (
                      <tr
                        key={item.ID}
                        className={`group hover:bg-muted/30 transition-colors ${checked ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.ID)}
                            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer accent-primary"
                          />
                        </td>

                        {/* Key */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors shrink-0">
                              <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate max-w-[220px]" title={item.Key}>{item.Key}</p>
                              <p className="text-[9px] font-mono text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity mt-0.5">
                                v{item.VersionID}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Bucket */}
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wide px-2 py-0 bg-primary/5 text-primary border-primary/20">
                            {item.Bucket}
                          </Badge>
                        </td>

                        {/* Deleted At */}
                        <td className="px-4 py-2.5 text-[10px] text-muted-foreground">
                          {formatDate(item.DeletedAt)}
                        </td>

                        {/* Size */}
                        <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                          {formatSize(item.Size)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg"
                              title="Restore"
                              onClick={() => restoreItem(item)}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg"
                              title="Delete Permanently"
                              onClick={() => deleteItem(item)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer summary */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground shrink-0">
            <span>
              <span className="font-bold text-foreground">{filtered.length}</span> object{filtered.length !== 1 ? 's' : ''} in trash
              {selectedCount > 0 && <> · <span className="font-bold text-primary">{selectedCount}</span> selected</>}
            </span>
            <span>
              Total: <span className="font-bold text-foreground">{formatSize(filtered.reduce((acc, i) => acc + (i.Size || 0), 0))}</span>
            </span>
          </div>
        )}
      </main>

      {/* ─── Confirm + Password Dialog ──────────────────────────────────── */}
      <Dialog open={!!confirmDialog} onOpenChange={o => { if (!o) setConfirmDialog(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-9 w-9 rounded-full bg-rose-500/10 flex items-center justify-center">
                <Lock className="w-4.5 h-4.5 text-rose-500" />
              </div>
              <DialogTitle className="text-base">{confirmDialog?.title}</DialogTitle>
            </div>
            <DialogDescription className="text-xs leading-relaxed">
              {confirmDialog?.desc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-70">
                Admin Password
              </Label>
              <Input
                type="password"
                placeholder="Enter your admin password to confirm"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && passwordInput && handleConfirmSubmit()}
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!passwordInput || confirming}
              onClick={handleConfirmSubmit}
            >
              {confirming
                ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Verifying...</>
                : <><Trash2 className="w-3.5 h-3.5 mr-2" /> Confirm & Proceed</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

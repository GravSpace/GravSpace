import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Trash2, RefreshCw, RotateCcw, Search, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useAuth } from '../../hooks/useAuth'
import { type TrashItem, formatSize } from '../../components/trash/trashTypes'
import { TrashTable } from '../../components/trash/TrashTable'
import { TrashConfirmDialog } from '../../components/trash/TrashConfirmDialog'

export const Route = createFileRoute('/admin/trash')({
  component: TrashPage,
  head: () => ({ meta: [{ title: 'Recycle Bin | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

function TrashPage() {
  const { authFetch } = useAuth()
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedBucket, setSelectedBucket] = useState('')
  const [selectedIDs, setSelectedIDs] = useState<Set<number>>(new Set())
  const [sortKey, setSortKey] = useState<'key' | 'bucket' | 'deleted_at' | 'size'>('deleted_at')
  const [sortAsc, setSortAsc] = useState(false)

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    desc: string
    action: () => Promise<void>
  } | null>(null)

  const fetchTrash = useCallback(async () => {
    setLoading(true)
    setSelectedIDs(new Set())
    try {
      const params = new URLSearchParams()
      if (selectedBucket) params.set('bucket', selectedBucket)
      if (search) params.set('search', search)
      const res = await authFetch(`${API_BASE}/admin/trash?${params}`)
      if (res.ok) {
        const raw: any[] = (await res.json()) || []
        const data: TrashItem[] = raw.map((i) => ({
          id: i.id ?? i.ID ?? 0,
          bucket: i.bucket ?? i.Bucket ?? '',
          key: i.key ?? i.Key ?? '',
          version_id: i.version_id ?? i.VersionID ?? i.versionId ?? '',
          size: i.size ?? i.Size ?? 0,
          deleted_at: i.deleted_at ?? i.DeletedAt ?? null,
          content_type: i.content_type ?? i.ContentType ?? null,
        }))
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

  useEffect(() => {
    fetchTrash()
  }, [selectedBucket])

  const buckets = useMemo(() => [...new Set(items.map((i) => i.bucket))].filter(Boolean).sort(), [items])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = items.filter((i) => {
      const matchBucket = !selectedBucket || i.bucket === selectedBucket
      const matchSearch = !q || (i.key && i.key.toLowerCase().includes(q)) || (i.bucket && i.bucket.toLowerCase().includes(q))
      return matchBucket && matchSearch
    })
    list = [...list].sort((a, b) => {
      let av: any = a[sortKey] ?? ''
      let bv: any = b[sortKey] ?? ''
      if (sortKey === 'size') {
        av = Number(av)
        bv = Number(bv)
      } else {
        av = String(av)
        bv = String(bv)
      }
      return sortAsc ? (av > bv ? 1 : -1) : av < bv ? 1 : -1
    })
    return list
  }, [items, search, selectedBucket, sortKey, sortAsc])

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortAsc((a) => !a)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const allSelected = filtered.length > 0 && filtered.every((i) => selectedIDs.has(i.id))
  function toggleAll() {
    if (allSelected) setSelectedIDs(new Set())
    else setSelectedIDs(new Set(filtered.map((i) => i.id)))
  }
  function toggleItem(id: number) {
    setSelectedIDs((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleVerifyAndExecute(password: string) {
    if (!confirmDialog) return
    const res = await authFetch(`${API_BASE}/admin/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      toast.error('Incorrect password')
      throw new Error('Incorrect password')
    }
    await confirmDialog.action()
  }

  async function restoreItem(item: TrashItem) {
    toast.promise(
      (async () => {
        const res = await authFetch(`${API_BASE}/admin/trash/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket: item.bucket, key: item.key, version_id: item.version_id }),
        })
        if (!res.ok) throw new Error(await res.text())
        setItems((prev) => prev.filter((i) => i.id !== item.id))
        setSelectedIDs((prev) => {
          const n = new Set(prev)
          n.delete(item.id)
          return n
        })
      })(),
      { loading: `Restoring "${item.key}"...`, success: `"${item.key}" restored.`, error: (e) => `Failed: ${e.message}` },
    )
  }

  async function bulkRestore() {
    const selected = filtered.filter((i) => selectedIDs.has(i.id))
    if (!selected.length) return
    toast.promise(
      (async () => {
        const res = await authFetch(`${API_BASE}/admin/trash/restore-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: selected.map((i) => ({ bucket: i.bucket, key: i.key, version_id: i.version_id })) }),
        })
        if (!res.ok) throw new Error(await res.text())
        const restoredIDs = new Set(selected.map((i) => i.id))
        setItems((prev) => prev.filter((i) => !restoredIDs.has(i.id)))
        setSelectedIDs(new Set())
      })(),
      { loading: `Restoring ${selected.length} objects...`, success: `${selected.length} objects restored.`, error: (e) => `Failed: ${e.message}` },
    )
  }

  function deleteItem(item: TrashItem) {
    setConfirmDialog({
      title: 'Permanently Delete Object',
      desc: `"${item.key}" will be permanently removed. This cannot be undone.`,
      action: async () => {
        const params = new URLSearchParams({ bucket: item.bucket, key: item.key, version_id: item.version_id })
        const res = await authFetch(`${API_BASE}/admin/trash?${params}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(await res.text())
        setItems((prev) => prev.filter((i) => i.id !== item.id))
        setSelectedIDs((prev) => {
          const n = new Set(prev)
          n.delete(item.id)
          return n
        })
        toast.success('Object permanently deleted.')
      },
    })
  }

  function bulkDelete() {
    const selected = filtered.filter((i) => selectedIDs.has(i.id))
    if (!selected.length) return
    setConfirmDialog({
      title: `Permanently Delete ${selected.length} Objects`,
      desc: `${selected.length} selected objects will be permanently removed. This cannot be undone.`,
      action: async () => {
        const res = await authFetch(`${API_BASE}/admin/trash-bulk`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: selected.map((i) => ({ bucket: i.bucket, key: i.key, version_id: i.version_id })) }),
        })
        if (!res.ok) throw new Error(await res.text())
        const deletedIDs = new Set(selected.map((i) => i.id))
        setItems((prev) => prev.filter((i) => !deletedIDs.has(i.id)))
        setSelectedIDs(new Set())
        toast.success(`${selected.length} objects permanently deleted.`)
      },
    })
  }

  function emptyTrash() {
    const scope = selectedBucket ? `bucket "${selectedBucket}"` : 'all buckets'
    setConfirmDialog({
      title: 'Empty Trash',
      desc: `All objects in ${scope} will be permanently deleted. This cannot be undone.`,
      action: async () => {
        const params = selectedBucket ? `?bucket=${encodeURIComponent(selectedBucket)}` : ''
        const res = await authFetch(`${API_BASE}/admin/trash/empty${params}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(await res.text())
        if (selectedBucket) setItems((prev) => prev.filter((i) => i.bucket !== selectedBucket))
        else setItems([])
        setSelectedIDs(new Set())
        toast.success('Trash emptied.')
      },
    })
  }

  const selectedCount = selectedIDs.size

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-rose-500" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Recycle Bin</h1>
            <p className="text-xs text-muted-foreground">Soft-deleted objects pending permanent removal.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full animate-in fade-in zoom-in duration-200">
              <span className="text-xs font-bold text-primary mr-1">{selectedCount} selected</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] font-bold uppercase text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                onClick={bulkRestore}
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Restore
              </Button>
              <div className="w-px h-3 bg-primary/20" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] font-bold uppercase text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950"
                onClick={bulkDelete}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            </div>
          )}

          <div className="relative" suppressHydrationWarning>
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTrash()}
              placeholder="Search key or bucket..."
              autoComplete="off"
              data-protonpass-ignore="true"
              data-1p-ignore="true"
              className="h-8 w-44 pl-8 text-xs"
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch('')}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select
            value={selectedBucket}
            onChange={(e) => {
              setSelectedBucket(e.target.value)
              setSelectedIDs(new Set())
            }}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Buckets</option>
            {buckets.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={fetchTrash} disabled={loading} className="h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>

          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            onClick={emptyTrash}
            disabled={items.length === 0}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Empty {selectedBucket ? `"${selectedBucket}"` : 'All'}
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        {loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 opacity-50">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium animate-pulse">Scanning trash storage...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl bg-card/50 mt-2">
            <div className="bg-card w-14 h-14 flex items-center justify-center rounded-2xl shadow-xs mb-4 border">
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

        {filtered.length > 0 && (
          <TrashTable
            items={filtered}
            selectedIDs={selectedIDs}
            allSelected={allSelected}
            sortKey={sortKey}
            sortAsc={sortAsc}
            onToggleAll={toggleAll}
            onToggleItem={toggleItem}
            onToggleSort={toggleSort}
            onRestore={restoreItem}
            onDelete={deleteItem}
          />
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground shrink-0">
            <span>
              <span className="font-bold text-foreground">{filtered.length}</span> object{filtered.length !== 1 ? 's' : ''} in trash
              {selectedCount > 0 && <> · <span className="font-bold text-primary">{selectedCount}</span> selected</>}
            </span>
            <span>
              Total: <span className="font-bold text-foreground">{formatSize(filtered.reduce((acc, i) => acc + (i.size || 0), 0))}</span>
            </span>
          </div>
        )}
      </main>

      <TrashConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        desc={confirmDialog?.desc || ''}
        onClose={() => setConfirmDialog(null)}
        onConfirm={handleVerifyAndExecute}
      />
    </div>
  )
}

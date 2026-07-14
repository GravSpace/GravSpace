import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  ChevronLeft,
  Database,
  Search,
  FolderPlus,
  Upload,
  ChevronDown,
  Settings,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '../../../components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import { useAuth } from '../../../hooks/useAuth'
import { useTransfers } from '../../../hooks/useTransfers'
import { BucketObjectTable } from '../../../components/bucket/BucketObjectTable'
import { CreateFolderDialog } from '../../../components/bucket/CreateFolderDialog'
import { PreviewDialog } from '../../../components/bucket/PreviewDialog'
import { ShareDialog } from '../../../components/bucket/ShareDialog'
import { TagEditorDialog } from '../../../components/bucket/TagEditorDialog'
import { ObjectLockDialog } from '../../../components/bucket/ObjectLockDialog'
import { VersionExplorerDialog } from '../../../components/bucket/VersionExplorerDialog'
import { BucketSettingsDialog } from '../../../components/bucket/BucketSettingsDialog'

export const Route = createFileRoute('/admin/buckets/$bucket')({
  component: BucketDetailPage,
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export interface S3Object {
  Key: string
  Size: number
  LastModified?: string
  ModTime?: string
  ETag?: string
  ContentType?: string
  VersionID?: string
  LockMode?: string
  LockUntil?: string
}

export interface BucketInfo {
  VersioningEnabled?: boolean
  ObjectLockEnabled?: boolean
  CurrentSize?: number
  QuotaBytes?: number
  SoftDeleteEnabled?: boolean
  SoftDeleteRetention?: number
  DefaultRetentionMode?: string
  DefaultRetentionDays?: number
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function BucketDetailPage() {
  const { bucket: bucketName } = Route.useParams()
  const navigate = useNavigate()
  const { authFetch } = useAuth()
  const { activeTransfersCount, addTransfer, updateProgress, setError, setAbort, setPauseResume } =
    useTransfers()

  const [currentPrefix, setCurrentPrefix] = useState('')
  const [allItems, setAllItems] = useState<(string | S3Object)[]>([])
  const [loading, setLoading] = useState(false)
  const [bucketInfo, setBucketInfo] = useState<BucketInfo | null>(null)
  const [users, setUsers] = useState<Record<string, any>>({})
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // Dialog states
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false)
  const [previewObject, setPreviewObject] = useState<S3Object | null>(null)
  const [shareObject, setShareObject] = useState<S3Object | null>(null)
  const [tagObject, setTagObject] = useState<S3Object | null>(null)
  const [lockObject, setLockObject] = useState<S3Object | null>(null)
  const [explorerObject, setExplorerObject] = useState<S3Object | null>(null)
  const [showBucketSettings, setShowBucketSettings] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const fetchObjects = useCallback(async (prefix = currentPrefix) => {
    setLoading(true)
    try {
      const res = await authFetch(
        `${API_BASE}/admin/buckets/${bucketName}/objects?delimiter=/&prefix=${encodeURIComponent(prefix)}`,
      )
      if (res.ok) {
        const data = await res.json()
        const folders: string[] = (data.common_prefixes || []).filter((p: string) => p !== prefix)
        const objects: S3Object[] = (data.objects || []).filter((o: S3Object) => o.Key !== prefix)
        setAllItems([...folders, ...objects])
      }
    } finally {
      setLoading(false)
    }
  }, [bucketName, authFetch, currentPrefix])

  const fetchBucketInfo = useCallback(async () => {
    try {
      const [infoRes, usersRes] = await Promise.all([
        authFetch(`${API_BASE}/admin/buckets/${bucketName}/info`),
        authFetch(`${API_BASE}/admin/users`),
      ])
      if (infoRes.ok) setBucketInfo(await infoRes.json())
      if (usersRes.ok) setUsers(await usersRes.json())
    } catch {}
  }, [bucketName, authFetch])

  useEffect(() => {
    fetchObjects('')
    fetchBucketInfo()
  }, [bucketName])

  function navigateTo(prefix: string) {
    setCurrentPrefix(prefix)
    setSelectedItems(new Set())
    fetchObjects(prefix)
  }

  function navigateUp() {
    const parts = currentPrefix.split('/').filter(Boolean)
    parts.pop()
    const newPrefix = parts.length > 0 ? parts.join('/') + '/' : ''
    navigateTo(newPrefix)
  }

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems
    const q = searchQuery.toLowerCase()
    return allItems.filter((item) => {
      if (typeof item === 'string') return item.toLowerCase().includes(q)
      return item.Key.toLowerCase().includes(q)
    })
  }, [allItems, searchQuery])

  function isPublic(key: string): boolean {
    const anon = users['anonymous']
    if (!anon?.policies) return false
    const resource = `arn:aws:s3:::${bucketName}/${key}*`
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

  async function togglePublic(prefix = '') {
    const currentlyPublic = isPublic(prefix)

    // Exact resource matching S3 ARN logic
    const isDirectory = prefix.endsWith('/') || prefix === ''
    const resource = 'arn:aws:s3:::' + bucketName + (prefix ? '/' + prefix : '')
    const finalResource = isDirectory ? resource + '*' : resource

    // Deterministic policy name based on resource (stripped of trailing hyphens)
    const cleanPrefix = prefix.replace(/[\/\.]/g, '-').replace(/-+$/, '')
    const pName = `Public-${bucketName}-${cleanPrefix || 'Root'}`

    try {
      if (currentlyPublic) {
        await authFetch(`${API_BASE}/admin/users/anonymous/policies/${pName}`, { method: 'DELETE' })
        toast.success(`Public access removed.`)
      } else {
        await authFetch(`${API_BASE}/admin/users/anonymous/policies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: pName,
            version: '2012-10-17',
            statement: [
              {
                effect: 'Allow',
                action: ['s3:GetObject', 's3:ListBucket'],
                resource: [finalResource],
              },
            ],
          }),
        })
        toast.success(`Access set to public.`)
      }
      await fetchBucketInfo()
    } catch {
      toast.error('Failed to update public access.')
    }
  }

  async function downloadObject(key: string, versionId?: string) {
    const id = crypto.randomUUID()
    const fileName = key.split('/').pop() || key
    addTransfer({ id, name: fileName, bucket: bucketName, type: 'download', size: 0 })
    try {
      const url = versionId
        ? `${API_BASE}/admin/buckets/${bucketName}/objects/${encodeURIComponent(key)}?versionId=${versionId}`
        : `${API_BASE}/admin/buckets/${bucketName}/objects/${encodeURIComponent(key)}`
      const res = await authFetch(url)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = fileName
      a.click()
      URL.revokeObjectURL(objectUrl)
      updateProgress(id, 100)
    } catch (err) {
      setError(id, String(err))
      toast.error(`Download failed: ${err}`)
    }
  }

  async function deleteObject(key: string, versionId?: string) {
    const url = versionId
      ? `${API_BASE}/admin/buckets/${bucketName}/objects/${encodeURIComponent(key)}?versionId=${versionId}`
      : `${API_BASE}/admin/buckets/${bucketName}/objects/${encodeURIComponent(key)}`
    toast.promise(
      async () => {
        const res = await authFetch(url, { method: 'DELETE' })
        if (!res.ok) throw new Error('Delete failed')
        await fetchObjects()
      },
      {
        loading: `Deleting ${key}...`,
        success: `"${key}" has been removed.`,
        error: (e: Error) => `Delete failed: ${e.message}`,
      },
    )
  }

  async function uploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    for (const file of files) {
      const key = currentPrefix + file.name
      const id = crypto.randomUUID()
      addTransfer({ id, name: file.name, bucket: bucketName, type: 'upload', size: file.size })
      try {
        // Send raw file body — backend reads c.Request.Body directly, NOT multipart
        const res = await authFetch(
          `${API_BASE}/admin/buckets/${bucketName}/objects/${encodeURIComponent(key)}`,
          {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          },
        )
        if (!res.ok) throw new Error(await res.text())
        updateProgress(id, 100)
        toast.success(`"${file.name}" uploaded successfully.`)
      } catch (err) {
        setError(id, String(err))
        toast.error(`Failed to upload "${file.name}"`)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    await fetchObjects()
  }

  async function uploadFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    for (const file of files) {
      const relativePath = (file as any).webkitRelativePath || file.name
      const key = currentPrefix + relativePath
      const id = crypto.randomUUID()
      addTransfer({ id, name: relativePath, bucket: bucketName, type: 'upload', size: file.size })
      try {
        // Send raw file body — backend reads c.Request.Body directly, NOT multipart
        const res = await authFetch(
          `${API_BASE}/admin/buckets/${bucketName}/objects/${encodeURIComponent(key)}`,
          {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          },
        )
        if (!res.ok) throw new Error(await res.text())
        updateProgress(id, 100)
      } catch (err) {
        setError(id, String(err))
      }
    }
    if (folderInputRef.current) folderInputRef.current.value = ''
    toast.success('Folder uploaded successfully.')
    await fetchObjects()
  }

  const usagePercentage = bucketInfo?.QuotaBytes
    ? Math.min(100, Math.round(((bucketInfo.CurrentSize || 0) / bucketInfo.QuotaBytes) * 100))
    : 0

  const prefixParts = currentPrefix.split('/').filter(Boolean)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      {/* Header */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4 overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: '/admin/buckets' })}
            className="h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 overflow-hidden">
            <Database className="w-4 h-4 text-primary shrink-0" />
            <Breadcrumb className="overflow-hidden">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem>
                  <BreadcrumbLink
                    onClick={() => navigateTo('')}
                    className="cursor-pointer max-w-[120px] truncate font-semibold italic"
                  >
                    {bucketName}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {prefixParts.map((part, i) => (
                  <>
                    <BreadcrumbSeparator key={`sep-${i}`} className="shrink-0" />
                    <BreadcrumbItem key={part}>
                      <BreadcrumbLink
                        onClick={() =>
                          navigateTo(
                            prefixParts.slice(0, i + 1).join('/') + '/',
                          )
                        }
                        className="cursor-pointer max-w-[150px] truncate"
                      >
                        {part}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>

        <div className="flex items-center gap-3" suppressHydrationWarning>
          {/* Quota Usage Bar */}
          {!!(bucketInfo?.QuotaBytes && bucketInfo.QuotaBytes > 0) && (
            <div className="hidden md:flex flex-col gap-1 w-48 mr-2">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                <span className="text-slate-500">Usage</span>
                <span className={usagePercentage > 90 ? 'text-rose-500' : 'text-slate-600'}>
                  {formatSize(bucketInfo.CurrentSize || 0)} / {formatSize(bucketInfo.QuotaBytes)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-200/50 dark:bg-slate-800/50 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${usagePercentage > 90 ? 'bg-rose-500' : usagePercentage > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative w-64 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search objects..."
              className="h-9 pl-9 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateFolderDialog(true)}
            className="h-9 border-slate-200 dark:border-slate-800"
          >
            <FolderPlus className="w-3.5 h-3.5 mr-2" /> New Folder
          </Button>

          <input type="file" multiple onChange={uploadFiles} className="hidden" ref={fileInputRef} />
          <input type="file" onChange={uploadFolder} className="hidden" ref={folderInputRef} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                disabled={activeTransfersCount > 0}
                className="h-9 bg-primary hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-95"
              >
                {activeTransfersCount > 0 ? (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 mr-2" />
                )}
                {activeTransfersCount > 0 ? 'Transferring...' : 'Upload'}
                <ChevronDown className="w-3 h-3 ml-2 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                Upload Files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
                Upload Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowBucketSettings(true)}
            className="h-9 w-9 border-slate-200 dark:border-slate-800"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Table */}
      <main className="flex-1 overflow-auto p-6">
        <BucketObjectTable
          bucketName={bucketName}
          items={filteredItems}
          loading={loading}
          currentPrefix={currentPrefix}
          selectedItems={selectedItems}
          onSelectChange={setSelectedItems}
          onNavigate={navigateTo}
          onNavigateUp={navigateUp}
          onDownload={downloadObject}
          onDelete={deleteObject}
          onPreview={setPreviewObject}
          onShare={setShareObject}
          onTags={setTagObject}
          onLock={setLockObject}
          onVersionExplorer={setExplorerObject}
          isPublic={isPublic}
          onTogglePublic={togglePublic}
          authFetch={authFetch}
          apiBase={API_BASE}
          bucketInfo={bucketInfo}
        />
      </main>

      {/* Dialogs */}
      <CreateFolderDialog
        open={showCreateFolderDialog}
        onClose={() => setShowCreateFolderDialog(false)}
        onCreated={() => fetchObjects()}
        currentPrefix={currentPrefix}
        bucketName={bucketName}
        authFetch={authFetch}
        apiBase={API_BASE}
      />

      {previewObject && (
        <PreviewDialog
          object={previewObject}
          bucketName={bucketName}
          onClose={() => setPreviewObject(null)}
          onDownload={downloadObject}
          authFetch={authFetch}
          apiBase={API_BASE}
        />
      )}

      {shareObject && (
        <ShareDialog
          object={shareObject}
          bucketName={bucketName}
          onClose={() => setShareObject(null)}
          authFetch={authFetch}
          apiBase={API_BASE}
        />
      )}

      {tagObject && (
        <TagEditorDialog
          object={tagObject}
          bucketName={bucketName}
          onClose={() => setTagObject(null)}
          authFetch={authFetch}
          apiBase={API_BASE}
        />
      )}

      {lockObject && (
        <ObjectLockDialog
          object={lockObject}
          bucketName={bucketName}
          onClose={() => setLockObject(null)}
          onSaved={() => fetchObjects()}
          authFetch={authFetch}
          apiBase={API_BASE}
        />
      )}

      {explorerObject && (
        <VersionExplorerDialog
          object={explorerObject}
          bucketName={bucketName}
          onClose={() => setExplorerObject(null)}
          onDownload={downloadObject}
          authFetch={authFetch}
          apiBase={API_BASE}
        />
      )}

      <BucketSettingsDialog
        open={showBucketSettings}
        onClose={() => setShowBucketSettings(false)}
        bucketName={bucketName}
        bucketInfo={bucketInfo}
        onInfoUpdated={fetchBucketInfo}
        authFetch={authFetch}
        apiBase={API_BASE}
      />
    </div>
  )
}

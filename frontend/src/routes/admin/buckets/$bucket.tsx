import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
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
import { BucketHeader } from '../../../components/bucket/BucketHeader'
import { extractDroppedFiles, encKey } from '../../../components/bucket/bucketUploadHelpers'

interface BucketSearch {
  prefix?: string
}

export const Route = createFileRoute('/admin/buckets/$bucket')({
  component: BucketDetailPage,
  validateSearch: (search: Record<string, unknown>): BucketSearch => ({
    prefix: typeof search.prefix === 'string' ? search.prefix : undefined,
  }),
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

function BucketDetailPage() {
  const { bucket: bucketName } = Route.useParams()
  const navigate = useNavigate()
  const { authFetch } = useAuth()
  const { activeTransfersCount, addTransfer, updateProgress, setError } = useTransfers()

  const search = Route.useSearch()
  const searchPrefix = search.prefix || ''
  const [currentPrefix, setCurrentPrefix] = useState(searchPrefix)
  const [allItems, setAllItems] = useState<(string | S3Object)[]>([])
  const [loading, setLoading] = useState(false)
  const [bucketInfo, setBucketInfo] = useState<BucketInfo | null>(null)
  const [users, setUsers] = useState<Record<string, any>>({})
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false)
  const [previewObject, setPreviewObject] = useState<S3Object | null>(null)
  const [shareObject, setShareObject] = useState<S3Object | null>(null)
  const [tagObject, setTagObject] = useState<S3Object | null>(null)
  const [lockObject, setLockObject] = useState<S3Object | null>(null)
  const [explorerObject, setExplorerObject] = useState<S3Object | null>(null)
  const [showBucketSettings, setShowBucketSettings] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const fetchObjects = useCallback(
    async (prefix = currentPrefix) => {
      setLoading(true)
      try {
        const res = await authFetch(
          `${API_BASE}/admin/buckets/${bucketName}/objects?delimiter=/&prefix=${encodeURIComponent(prefix)}`,
        )
        if (res.ok) {
          const data = await res.json()
          const folders: string[] = (data.common_prefixes || []).filter((p: string) => p !== prefix)
          const rawList = Array.isArray(data) ? data : (data.objects || data.Contents || [])
          const objects: S3Object[] = rawList
            .map((o: any) => ({
              Key: o.Key || o.key || '',
              Size: Number(o.Size ?? o.size ?? 0),
              ModTime: o.ModTime || o.mod_time || o.ModifiedAt || o.modified_at,
              LastModified: o.LastModified || o.last_modified || o.ModTime || o.ModifiedAt,
              ETag: o.ETag || o.etag,
              ContentType: o.ContentType || o.content_type,
              VersionID: o.VersionID || o.version_id,
              LockMode: o.LockMode || o.lock_mode,
              LockUntil: o.LockUntil || o.lock_until || o.RetainUntilDate || o.retain_until_date,
            }))
            .filter((o: S3Object) => o.Key && o.Key !== prefix)
          setAllItems([...folders, ...objects])
        }
      } finally {
        setLoading(false)
      }
    },
    [bucketName, authFetch, currentPrefix],
  )

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

  const handleSyncBucket = async () => {
    setSyncing(true)
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName}/sync`, { method: 'POST' })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        await Promise.all([fetchObjects(), fetchBucketInfo()])
        return data
      },
      {
        loading: `Synchronizing bucket "${bucketName}" with filesystem...`,
        success: (data: any) =>
          `Bucket synchronized: ${data.synced ?? 0} indexed, ${data.pruned ?? 0} pruned (${data.duration ?? ''})`,
        error: (err: Error) => `Sync failed: ${err.message}`,
        finally: () => setSyncing(false),
      },
    )
  }

  useEffect(() => {
    setCurrentPrefix(searchPrefix)
    fetchObjects(searchPrefix)
    fetchBucketInfo()
  }, [bucketName, searchPrefix])

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

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const filesToUpload = await extractDroppedFiles(e.dataTransfer)
    if (filesToUpload.length === 0) return

    toast.info(`Starting upload of ${filesToUpload.length} file(s)...`)
    for (const item of filesToUpload) {
      const key = currentPrefix + item.path
      const id = crypto.randomUUID()
      addTransfer({ id, name: item.path, bucket: bucketName, type: 'upload', size: item.file.size })
      try {
        const res = await authFetch(
          `${API_BASE}/admin/buckets/${bucketName}/objects/${encodeURIComponent(key)}`,
          {
            method: 'PUT',
            body: item.file,
            headers: { 'Content-Type': item.file.type || 'application/octet-stream' },
          },
        )
        if (!res.ok) throw new Error(await res.text())
        updateProgress(id, 100)
      } catch (err) {
        setError(id, String(err))
      }
    }
    toast.success('Upload completed.')
    await fetchObjects()
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
          (r: string) => r === '*' || r === resource || (r.endsWith('*') && resource.startsWith(r.slice(0, -1))),
        )
      }),
    )
  }

  async function togglePublic(prefix = '') {
    const currentlyPublic = isPublic(prefix)
    const isDirectory = prefix.endsWith('/') || prefix === ''
    const resource = 'arn:aws:s3:::' + bucketName + (prefix ? '/' + prefix : '')
    const finalResource = isDirectory ? resource + '*' : resource
    const cleanPrefix = prefix.replace(/[\/\.]/g, '-').replace(/-+$/, '')
    const pName = `Public-${bucketName}-${cleanPrefix || 'Root'}`

    try {
      if (currentlyPublic) {
        await authFetch(`${API_BASE}/admin/users/anonymous/policies/${pName}`, { method: 'DELETE' })
        toast.success('Public access removed.')
      } else {
        await authFetch(`${API_BASE}/admin/users/anonymous/policies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: pName,
            version: '2012-10-17',
            statement: [{ effect: 'Allow', action: ['s3:GetObject', 's3:ListBucket'], resource: [finalResource] }],
          }),
        })
        toast.success('Access set to public.')
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
      const url = `${API_BASE}/admin/buckets/${bucketName}/objects/${encKey(key)}${versionId ? `?versionId=${versionId}` : ''}`
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
    const url = `${API_BASE}/admin/buckets/${bucketName}/objects/${encKey(key)}${versionId ? `?versionId=${versionId}` : ''}`
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
        const res = await authFetch(
          `${API_BASE}/admin/buckets/${bucketName}/objects/${encKey(key)}`,
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
        const res = await authFetch(
          `${API_BASE}/admin/buckets/${bucketName}/objects/${encKey(key)}`,
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

  const prefixParts = currentPrefix.split('/').filter(Boolean)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      <BucketHeader
        bucketName={bucketName}
        currentPrefix={currentPrefix}
        prefixParts={prefixParts}
        bucketInfo={bucketInfo}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNavigate={navigateTo}
        onBack={() => navigate({ to: '/admin/buckets' })}
        onNewFolder={() => setShowCreateFolderDialog(true)}
        onUploadFilesClick={() => fileInputRef.current?.click()}
        onUploadFolderClick={() => folderInputRef.current?.click()}
        onSync={handleSyncBucket}
        onOpenSettings={() => setShowBucketSettings(true)}
        loading={loading}
        syncing={syncing}
        activeTransfersCount={activeTransfersCount}
      />

      <input type="file" multiple onChange={uploadFiles} className="hidden" ref={fileInputRef} />
      <input type="file" multiple onChange={uploadFolder} className="hidden" ref={folderInputRef} {...({ webkitdirectory: '', directory: '' } as any)} />

      <main
        className="flex-1 overflow-auto p-6 relative"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        {dragActive && (
          <div className="absolute inset-0 bg-primary/5 backdrop-blur-[2px] border-2 border-dashed border-primary/40 m-6 rounded-xl z-50 flex flex-col items-center justify-center pointer-events-none transition-all duration-200">
            <div className="bg-background/95 p-6 rounded-2xl shadow-xl border flex flex-col items-center gap-3 animate-in zoom-in-95 duration-150">
              <Upload className="w-10 h-10 text-primary animate-bounce" />
              <p className="text-sm font-semibold tracking-tight">Drop files or folders to upload</p>
              <p className="text-xs text-muted-foreground">
                Uploading directly to <span className="font-mono font-bold">{currentPrefix || '/'}</span>
              </p>
            </div>
          </div>
        )}

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
          onPreview={(obj) => setPreviewObject(obj)}
          onShare={(obj) => setShareObject(obj)}
          onTags={(obj) => setTagObject(obj)}
          onLock={(obj) => setLockObject(obj)}
          onVersionExplorer={(obj) => setExplorerObject(obj)}
          isPublic={isPublic}
          onTogglePublic={togglePublic}
          authFetch={authFetch}
          apiBase={API_BASE}
          bucketInfo={bucketInfo}
        />
      </main>

      <CreateFolderDialog
        open={showCreateFolderDialog}
        onClose={() => setShowCreateFolderDialog(false)}
        bucketName={bucketName}
        currentPrefix={currentPrefix}
        onCreated={() => fetchObjects()}
        authFetch={authFetch}
        apiBase={API_BASE}
      />

      {previewObject && (
        <PreviewDialog
          onClose={() => setPreviewObject(null)}
          object={previewObject}
          bucketName={bucketName}
          onDownload={downloadObject}
          authFetch={authFetch}
          apiBase={API_BASE}
        />
      )}

      {shareObject && (
        <ShareDialog
          onClose={() => setShareObject(null)}
          object={shareObject}
          bucketName={bucketName}
          authFetch={authFetch}
          apiBase={API_BASE}
        />
      )}

      {tagObject && (
        <TagEditorDialog
          onClose={() => setTagObject(null)}
          object={tagObject}
          bucketName={bucketName}
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
          onClose={() => setExplorerObject(null)}
          bucketName={bucketName}
          object={explorerObject}
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
        onInfoUpdated={() => { fetchBucketInfo(); fetchObjects() }}
        authFetch={authFetch}
        apiBase={API_BASE}
      />
    </div>
  )
}

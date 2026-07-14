import { useState, useEffect } from 'react'
import { History, Download, Loader2, Clock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { S3Object } from '../../routes/admin/buckets/$bucket'

interface Props {
  object: S3Object
  bucketName: string
  onClose: () => void
  onDownload: (key: string, versionId?: string) => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

interface Version {
  VersionID: string
  LastModified?: string
  ModTime?: string
  Size: number
  IsLatest?: boolean
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function VersionExplorerDialog({ object, bucketName, onClose, onDownload, authFetch, apiBase }: Props) {
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(false)

  const name = object.Key.split('/').pop() || object.Key

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const res = await authFetch(
          `${apiBase}/admin/buckets/${bucketName}/objects?versions=true&prefix=${encodeURIComponent(object.Key)}`,
        )
        if (res.ok) {
          const data = await res.json()
          setVersions(Array.isArray(data.versions) ? data.versions : [])
        }
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [object.Key])

  async function deleteVersion(versionId: string) {
    toast.promise(
      async () => {
        const res = await authFetch(
          `${apiBase}/admin/buckets/${bucketName}/objects/${encodeURIComponent(object.Key)}?versionId=${versionId}`,
          { method: 'DELETE' },
        )
        if (!res.ok) throw new Error('Failed to delete version')
        setVersions((prev) => prev.filter((v) => v.VersionID !== versionId))
      },
      {
        loading: 'Deleting version...',
        success: 'Version deleted.',
        error: (e: Error) => `Delete failed: ${e.message}`,
      },
    )
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <DialogTitle>Version History</DialogTitle>
          </div>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0 mt-2">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {!loading && versions.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto opacity-20 mb-3" />
              <p className="text-sm">No versions found.</p>
            </div>
          )}

          {!loading && versions.length > 0 && (
            <div className="space-y-2.5">
              {versions.map((v, i) => (
                <div
                  key={v.VersionID}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    i === 0
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-card border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] font-mono text-muted-foreground truncate max-w-[220px]">
                          {v.VersionID}
                        </code>
                        {i === 0 && (
                          <Badge className="text-[8px] h-4 py-0 px-1.5 bg-primary text-primary-foreground shrink-0">
                            Latest
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span>{v.ModTime || v.LastModified ? new Date(v.ModTime || v.LastModified || '').toLocaleString() : '—'}</span>
                        <span className="font-mono">{formatSize(v.Size)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onDownload(object.Key, v.VersionID)}
                    >
                      <Download className="w-3 h-3 mr-1" /> Download
                    </Button>
                    {i !== 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteVersion(v.VersionID)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

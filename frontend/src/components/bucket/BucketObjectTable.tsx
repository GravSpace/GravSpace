import {
  Folder,
  File,
  Image,
  Music,
  Video,
  FileText,
  Download,
  Share2,
  Tag,
  Lock,
  Clock,
  Trash2,
  MoreHorizontal,
  ChevronUp,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Badge } from '../ui/badge'
import type { S3Object, BucketInfo } from '../../routes/admin/buckets/$bucket'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(d?: string): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getFileIcon(key: string) {
  const ext = key.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext))
    return <Image className="w-4 h-4 text-pink-500" />
  if (['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'].includes(ext))
    return <Music className="w-4 h-4 text-violet-500" />
  if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext))
    return <Video className="w-4 h-4 text-amber-500" />
  if (ext === 'pdf')
    return <FileText className="w-4 h-4 text-red-500" />
  if (['txt', 'md', 'json', 'csv', 'xml', 'yml', 'yaml', 'log', 'sh', 'py', 'js', 'ts', 'jsx', 'tsx', 'go', 'rs', 'sql'].includes(ext))
    return <FileText className="w-4 h-4 text-sky-500" />
  return <File className="w-4 h-4 text-slate-400" />
}

function isPreviewable(key: string): boolean {
  const ext = key.split('.').pop()?.toLowerCase() || ''
  return [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
    'mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a',
    'mp4', 'webm', 'mov',
    'pdf',
    'txt', 'md', 'json', 'csv', 'xml', 'log', 'yaml', 'yml',
    'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'go', 'sh', 'sql', 'rs'
  ].includes(ext)
}

function getDisplayName(key: string, prefix: string) {
  const relative = key.startsWith(prefix) ? key.slice(prefix.length) : key
  return relative.split('/').filter(Boolean).at(-1) || relative
}

interface Props {
  bucketName: string
  items: (string | S3Object)[]
  loading: boolean
  currentPrefix: string
  selectedItems: Set<string>
  onSelectChange: (s: Set<string>) => void
  onNavigate: (prefix: string) => void
  onNavigateUp: () => void
  onDownload: (key: string, versionId?: string) => void
  onDelete: (key: string, versionId?: string) => void
  onPreview: (obj: S3Object) => void
  onShare: (obj: S3Object) => void
  onTags: (obj: S3Object) => void
  onLock: (obj: S3Object) => void
  onVersionExplorer: (obj: S3Object) => void
  isPublic: (key: string) => boolean
  onTogglePublic: (prefix: string) => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
  bucketInfo: BucketInfo | null
}

export function BucketObjectTable({
  bucketName,
  items,
  loading,
  currentPrefix,
  selectedItems,
  onSelectChange,
  onNavigate,
  onNavigateUp,
  onDownload,
  onDelete,
  onPreview,
  onShare,
  onTags,
  onLock,
  onVersionExplorer,
  isPublic,
  onTogglePublic,
  bucketInfo,
}: Props) {
  const folders = items.filter((i) => typeof i === 'string') as string[]
  const objects = items.filter((i) => typeof i !== 'string') as S3Object[]

  function toggleAll(checked: boolean) {
    if (checked) {
      onSelectChange(new Set(objects.map((o) => o.Key)))
    } else {
      onSelectChange(new Set())
    }
  }

  function toggleItem(key: string) {
    const next = new Set(selectedItems)
    next.has(key) ? next.delete(key) : next.add(key)
    onSelectChange(next)
  }

  const allSelected = objects.length > 0 && objects.every((o) => selectedItems.has(o.Key))
  const anySelected = selectedItems.size > 0

  if (loading && items.length === 0) {
    return (
      <div className="flex-1 flex flex-col gap-3 animate-pulse">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 bg-slate-200/40 dark:bg-slate-800/40 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-card shadow-sm">
      {/* Bulk Action Bar */}
      {anySelected && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/10 animate-in fade-in duration-150">
          <span className="text-xs font-bold text-primary">{selectedItems.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                selectedItems.forEach((key) => onDownload(key))
              }}
            >
              <Download className="w-3 h-3 mr-1" /> Download All
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader className="bg-muted/20">
          <TableRow>
            <TableHead className="w-10">
              {objects.length > 0 && (
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              )}
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Name</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-right w-32 hidden md:table-cell">
              Size
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider w-48 hidden lg:table-cell">
              Last Modified
            </TableHead>
            <TableHead className="w-12 text-right" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {/* Back folder row */}
          {currentPrefix && (
            <TableRow
              onClick={onNavigateUp}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <TableCell />
              <TableCell className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                <ChevronUp className="w-4 h-4" />
                ..
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
            </TableRow>
          )}

          {/* Folders */}
          {folders.map((prefix) => {
            const folderName = prefix.replace(currentPrefix, '').replace(/\/$/, '')
            const pub = isPublic(prefix)
            return (
              <TableRow
                key={prefix}
                className="group hover:bg-muted/30 transition-colors"
              >
                <TableCell />
                <TableCell onClick={() => onNavigate(prefix)} className="cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-amber-500/10">
                      <Folder className="w-4 h-4 text-amber-500" />
                    </div>
                    <span className="font-medium text-sm">{folderName}/</span>
                    {pub && (
                      <Badge className="text-[8px] h-3.5 px-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 border-0">
                        public
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground hidden md:table-cell">—</TableCell>
                <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">—</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onTogglePublic(prefix)}>
                        {pub ? 'Make Private' : 'Make Public'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(prefix)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete Folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}

          {/* Objects */}
          {objects.map((obj) => {
            const name = getDisplayName(obj.Key, currentPrefix)
            const pub = isPublic(obj.Key)
            const isDir = obj.ContentType === 'application/x-directory' || obj.Key.endsWith('/')
            return (
              <TableRow
                key={obj.Key}
                className={`hover:bg-muted/30 transition-colors ${selectedItems.has(obj.Key) ? 'bg-primary/5' : ''}`}
              >
                <TableCell onClick={() => toggleItem(obj.Key)} className="cursor-pointer">
                  <Checkbox
                    checked={selectedItems.has(obj.Key)}
                    onCheckedChange={() => toggleItem(obj.Key)}
                    aria-label={`Select ${obj.Key}`}
                  />
                </TableCell>
                <TableCell
                  className="cursor-pointer"
                  onClick={() => {
                    if (isDir) {
                      onNavigate(obj.Key.endsWith('/') ? obj.Key : obj.Key + '/')
                    } else if (isPreviewable(obj.Key)) {
                      onPreview(obj)
                    }
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`h-8 w-8 flex items-center justify-center rounded-lg shrink-0 ${isDir ? 'bg-amber-500/10' : 'bg-muted'}`}>
                      {isDir ? <Folder className="w-4 h-4 text-amber-500" /> : getFileIcon(obj.Key)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        className={`text-sm font-medium truncate ${(isDir || isPreviewable(obj.Key)) ? 'hover:text-primary cursor-pointer' : ''}`}
                        title={obj.Key}
                      >
                        {name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {obj.ContentType && (
                          <span className="text-[9px] text-muted-foreground font-mono">{obj.ContentType}</span>
                        )}
                        {pub && (
                          <Badge className="text-[8px] h-3.5 px-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 border-0">
                            public
                          </Badge>
                        )}
                        {obj.LockMode && (
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-amber-500/30 text-amber-600">
                            <Lock className="w-2 h-2 mr-0.5" />
                            {obj.LockMode}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right text-xs font-mono text-muted-foreground hidden md:table-cell">
                  {formatSize(obj.Size)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                  {formatDate(obj.ModTime || obj.LastModified)}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {!isDir && isPreviewable(obj.Key) && (
                        <DropdownMenuItem onClick={() => onPreview(obj)}>
                          Preview
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onDownload(obj.Key, obj.VersionID)}>
                        <Download className="w-4 h-4 mr-2" /> Download
                      </DropdownMenuItem>
                      {!isDir && (
                        <DropdownMenuItem onClick={() => onShare(obj)}>
                          <Share2 className="w-4 h-4 mr-2" /> Share / Presign
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onTogglePublic(obj.Key)}>
                        {pub ? 'Make Private' : 'Make Public'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onTags(obj)}>
                        <Tag className="w-4 h-4 mr-2" /> Tags
                      </DropdownMenuItem>
                      {bucketInfo?.ObjectLockEnabled && (
                        <DropdownMenuItem onClick={() => onLock(obj)}>
                          <Lock className="w-4 h-4 mr-2" /> Object Lock
                        </DropdownMenuItem>
                      )}
                      {bucketInfo?.VersioningEnabled && (
                        <DropdownMenuItem onClick={() => onVersionExplorer(obj)}>
                          <Clock className="w-4 h-4 mr-2" /> Version History
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(obj.Key, obj.VersionID)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}

          {/* Empty state */}
          {folders.length === 0 && objects.length === 0 && !loading && (
            <TableRow>
              <TableCell colSpan={5}>
                <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground gap-3">
                  <div className="h-16 w-16 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center">
                    <File className="w-7 h-7 opacity-20" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Empty folder</p>
                    <p className="text-xs opacity-60 mt-1">Upload files or create a folder to get started</p>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

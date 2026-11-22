import { useState, useEffect, useRef } from 'react'
import { Download, Loader2, Copy, Check, FileText, Edit3, Save, X, ExternalLink, HardDrive } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useAuth } from '../../hooks/useAuth'
import type { S3Object } from '../../routes/admin/buckets/$bucket'
import { toast } from 'sonner'
import {
  PreviewContent,
  getPreviewKind,
  getFileName,
  formatPreviewFileSize,
  parseCSV,
} from './PreviewContent'
import { encKey } from './bucketUploadHelpers'

interface Props {
  object: S3Object
  bucketName: string
  onClose: () => void
  onDownload: (key: string) => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function PreviewDialog({ object, bucketName, onClose, onDownload, authFetch, apiBase }: Props) {
  const { authState } = useAuth()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const kind = getPreviewKind(object.Key)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)

  const token = authState?.token || ''
  const directUrl = `${apiBase}/admin/buckets/${bucketName}/objects/${encKey(object.Key)}${
    token ? `?token=${encodeURIComponent(token)}` : ''
  }`

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setBlobUrl(null)
      setTextContent(null)
      setIsEditing(false)
      try {
        const res = await authFetch(
          `${apiBase}/admin/buckets/${bucketName}/objects/${encKey(object.Key)}`,
        )
        if (!res.ok) {
          const errTxt = await res.text().catch(() => '')
          toast.error(`Preview failed (${res.status}): ${errTxt || res.statusText}`)
          return
        }
        if (kind === 'text' || kind === 'markdown' || kind === 'json' || kind === 'csv') {
          const text = await res.text()
          setTextContent(text)
        } else {
          const blob = await res.blob()
          const ext = object.Key.split('.').pop()?.toLowerCase() || ''
          const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            pdf: 'application/pdf',
            mp4: 'video/mp4',
            webm: 'video/webm',
            mp3: 'audio/mpeg',
          }
          const ct =
            res.headers.get('content-type') || mimeMap[ext] || blob.type || 'application/octet-stream'
          const typedBlob = new Blob([await blob.arrayBuffer()], { type: ct })
          setBlobUrl(URL.createObjectURL(typedBlob))
        }
      } catch (err) {
        console.error('Failed to load object for preview', err)
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [object.Key])

  const name = getFileName(object.Key)

  const formattedJson = (() => {
    if (!textContent) return ''
    try {
      return JSON.stringify(JSON.parse(textContent), null, 2)
    } catch {
      return textContent
    }
  })()

  const csvRows = kind === 'csv' && textContent ? parseCSV(textContent) : []

  const handleCopy = () => {
    if (!textContent) return
    const textToCopy = kind === 'json' ? formattedJson : textContent
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    toast.success('Content copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleStartEdit = () => {
    const initialText = kind === 'json' ? formattedJson : (textContent || '')
    setEditContent(initialText)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (kind === 'json') {
      try {
        JSON.parse(editContent)
      } catch (err) {
        toast.error(`Invalid JSON: ${err}`)
        return
      }
    }

    setSaving(true)
    try {
      const res = await authFetch(
        `${apiBase}/admin/buckets/${bucketName}/objects/${encodeURIComponent(object.Key)}`,
        {
          method: 'PUT',
          body: new Blob([editContent], { type: object.ContentType || 'text/plain' }),
          headers: {
            'Content-Type': object.ContentType || 'text/plain',
          },
        },
      )
      if (res.ok) {
        toast.success('File saved successfully')
        setTextContent(editContent)
        setIsEditing(false)
      } else {
        const txt = await res.text()
        toast.error(`Save failed: ${txt}`)
      }
    } catch (err) {
      toast.error(`Save failed: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  const handleTextareaScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const handlePreviewScroll = () => {
    if (previewScrollRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = previewScrollRef.current.scrollTop
    }
  }

  const isEditable = kind === 'text' || kind === 'markdown' || kind === 'json'

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className="w-[94vw] sm:max-w-5xl h-[84vh] max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden p-0 gap-0 border border-border/80 bg-background shadow-2xl rounded-2xl"
      >
        <DialogHeader className="px-4 sm:px-5 py-2.5 sm:py-3 border-b shrink-0 bg-background/95 backdrop-blur-xs">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
              <DialogTitle className="text-xs sm:text-sm font-semibold truncate max-w-[160px] sm:max-w-xs md:max-w-md" title={object.Key}>
                {name}
              </DialogTitle>
              <Badge variant="outline" className="text-[9px] sm:text-[10px] uppercase font-bold shrink-0">
                {kind}
              </Badge>
              {object.Size !== undefined && (
                <Badge variant="secondary" className="text-[9px] sm:text-[10px] font-mono font-medium shrink-0">
                  {formatPreviewFileSize(object.Size)}
                </Badge>
              )}
              {isEditing && (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-0 text-[8px] sm:text-[9px] font-bold">
                  Editing
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {isEditable && !isEditing && (
                <Button variant="outline" size="sm" className="h-7 sm:h-8 px-2 sm:px-2.5 text-xs gap-1 cursor-pointer" onClick={handleStartEdit}>
                  <Edit3 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
              {isEditing && (
                <>
                  <Button variant="outline" size="sm" className="h-7 sm:h-8 px-2 sm:px-2.5 text-xs gap-1 cursor-pointer" onClick={handleCancelEdit} disabled={saving}>
                    <X className="w-3.5 h-3.5" /> Cancel
                  </Button>
                  <Button size="sm" className="h-7 sm:h-8 px-2.5 text-xs gap-1 cursor-pointer" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </Button>
                </>
              )}
              {!isEditing && textContent && (
                <Button variant="outline" size="sm" className="h-7 sm:h-8 px-2 sm:px-2.5 text-xs gap-1 cursor-pointer" onClick={handleCopy}>
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Copy</span>
                </Button>
              )}
              {!isEditing && (
                <Button variant="outline" size="sm" className="h-7 sm:h-8 px-2 sm:px-2.5 text-xs gap-1 cursor-pointer" onClick={() => onDownload(object.Key)} title="Download file">
                  <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Download</span>
                </Button>
              )}
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 sm:h-8 px-2 text-xs cursor-pointer"
                  onClick={() => window.open(directUrl, '_blank')}
                  title="Open direct link in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}
              <div className="h-4 w-px bg-border mx-0.5 sm:mx-1" />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg shrink-0 cursor-pointer"
                onClick={onClose}
                title="Close (Esc)"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-0 bg-slate-50/50 dark:bg-slate-950/20 p-4 sm:p-5 flex flex-col">
          <PreviewContent
            kind={kind}
            loading={loading}
            name={name}
            blobUrl={blobUrl}
            textContent={textContent}
            isEditing={isEditing}
            editContent={editContent}
            setEditContent={setEditContent}
            saving={saving}
            csvRows={csvRows}
            formattedJson={formattedJson}
            textareaRef={textareaRef}
            lineNumbersRef={lineNumbersRef}
            previewScrollRef={previewScrollRef}
            onTextareaScroll={handleTextareaScroll}
            onPreviewScroll={handlePreviewScroll}
            onDownload={() => onDownload(object.Key)}
          />
        </div>

        <div className="px-5 py-2 border-t bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground shrink-0 select-none">
          <div className="flex items-center gap-2 truncate">
            <HardDrive className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
            <span className="truncate">Bucket: <strong className="text-foreground font-medium">{bucketName}</strong></span>
            <span>•</span>
            <span className="truncate font-mono">{object.Key}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono">
            {object.LastModified && <span>Modified: {new Date(object.LastModified).toLocaleDateString()}</span>}
            {object.ETag && <span>ETag: {object.ETag.replace(/"/g, '').slice(0, 10)}...</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

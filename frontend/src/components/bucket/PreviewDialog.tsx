import { useState, useEffect, useRef } from 'react'
import { Download, Loader2, Copy, Check, FileText, Edit3, Save, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { S3Object } from '../../routes/admin/buckets/$bucket'
import { toast } from 'sonner'

interface Props {
  object: S3Object
  bucketName: string
  onClose: () => void
  onDownload: (key: string) => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

type PreviewKind = 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'markdown' | 'csv' | 'json' | 'unknown'

function getPreviewKind(key: string): PreviewKind {
  const ext = key.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image'
  if (['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'].includes(ext)) return 'audio'
  if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'json') return 'json'
  if (ext === 'md') return 'markdown'
  if (ext === 'csv') return 'csv'
  if (['txt', 'xml', 'yml', 'yaml', 'log', 'sh', 'py', 'js', 'ts', 'jsx', 'tsx', 'go', 'rs', 'sql', 'css', 'html'].includes(ext)) return 'text'
  return 'unknown'
}

function getFileName(key: string) {
  return key.split('/').pop() || key
}

// Simple CSV Parser
function parseCSV(text: string) {
  return text.split('\n')
    .map(row => row.trim())
    .filter(Boolean)
    .map(row => {
      // Split by comma ignoring commas inside quotes
      const matches = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',')
      return matches.map(val => val.replace(/^"|"$/g, ''))
    })
}

export function PreviewDialog({ object, bucketName, onClose, onDownload, authFetch, apiBase }: Props) {
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

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setBlobUrl(null)
      setTextContent(null)
      setIsEditing(false)
      try {
        const res = await authFetch(
          `${apiBase}/admin/buckets/${bucketName}/objects/${encodeURIComponent(object.Key)}`,
        )
        if (!res.ok) return
        if (kind === 'text' || kind === 'markdown' || kind === 'json' || kind === 'csv') {
          const text = await res.text()
          setTextContent(text)
        } else {
          const blob = await res.blob()
          setBlobUrl(URL.createObjectURL(blob))
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

  const handleCopy = () => {
    if (!textContent) return
    let textToCopy = textContent
    if (kind === 'json') {
      try {
        textToCopy = JSON.stringify(JSON.parse(textContent), null, 2)
      } catch {}
    }
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    toast.success('Content copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  // Formatting JSON
  const getFormattedJson = () => {
    if (!textContent) return ''
    try {
      return JSON.stringify(JSON.parse(textContent), null, 2)
    } catch {
      return textContent
    }
  }

  // Parse CSV
  const csvRows = kind === 'csv' && textContent ? parseCSV(textContent) : []

  const handleStartEdit = () => {
    const initialText = kind === 'json' ? getFormattedJson() : (textContent || '')
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

  // Sync scrolling of textarea and line numbers
  const handleTextareaScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  // Sync scrolling of read-only pre and line numbers
  const handlePreviewScroll = () => {
    if (previewScrollRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = previewScrollRef.current.scrollTop
    }
  }

  const isEditable = kind === 'text' || kind === 'markdown' || kind === 'json'

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-4">
              <FileText className="w-5 h-5 text-primary shrink-0" />
              <DialogTitle className="text-sm font-semibold truncate" title={object.Key}>
                {name}
              </DialogTitle>
              <Badge variant="outline" className="text-[10px] uppercase font-bold shrink-0">
                {kind}
              </Badge>
              {isEditing && (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-0 text-[9px] font-bold">
                  Editing mode
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isEditable && !isEditing && (
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleStartEdit}>
                  <Edit3 className="w-3.5 h-3.5" /> Edit File
                </Button>
              )}
              {isEditing && (
                <>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleCancelEdit} disabled={saving}>
                    <X className="w-3.5 h-3.5" /> Cancel
                  </Button>
                  <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save to S3
                  </Button>
                </>
              )}
              {!isEditing && textContent && (
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleCopy}>
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Content
                </Button>
              )}
              {!isEditing && (
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onDownload(object.Key)}>
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0 bg-slate-50/50 dark:bg-slate-950/20 p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-2.5">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground animate-pulse">Loading preview...</span>
            </div>
          )}

          {!loading && kind === 'image' && blobUrl && (
            <div className="flex items-center justify-center p-4 bg-muted/20 border rounded-xl overflow-hidden">
              <img src={blobUrl} alt={name} className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm" />
            </div>
          )}

          {!loading && kind === 'audio' && blobUrl && (
            <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-xl shadow-xs gap-4 max-w-md mx-auto">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground text-center truncate w-full">{name}</span>
              <audio controls src={blobUrl} className="w-full mt-2" />
            </div>
          )}

          {!loading && kind === 'video' && blobUrl && (
            <div className="flex items-center justify-center bg-black rounded-xl border overflow-hidden shadow-md max-h-[60vh]">
              <video controls src={blobUrl} className="max-h-[60vh] max-w-full w-auto" />
            </div>
          )}

          {!loading && kind === 'pdf' && blobUrl && (
            <div className="w-full h-[65vh] border rounded-xl overflow-hidden bg-card shadow-xs">
              <iframe src={blobUrl} className="w-full h-full border-0" title={name} />
            </div>
          )}

          {!loading && isEditing && (
            <div className="border rounded-xl bg-slate-950 overflow-hidden">
              <div className="flex font-mono text-xs max-h-[65vh] overflow-hidden">
                {/* Editable Code Line Numbers */}
                <div
                  ref={lineNumbersRef}
                  className="select-none text-right px-3 py-4 bg-slate-900 border-r border-slate-800 text-slate-600 font-bold shrink-0 min-w-10 overflow-hidden"
                >
                  {(editContent.split('\n')).map((_, idx) => (
                    <div key={idx} className="h-5 leading-5">{idx + 1}</div>
                  ))}
                </div>
                {/* Editable Code Area */}
                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onScroll={handleTextareaScroll}
                  className="flex-1 p-4 py-4 bg-slate-950 text-emerald-300 font-mono text-xs leading-5 border-0 focus:outline-none focus:ring-0 resize-none h-[65vh] overflow-auto whitespace-pre tab-size-4"
                  spellCheck={false}
                  autoFocus
                />
              </div>
            </div>
          )}

          {!loading && !isEditing && kind === 'json' && textContent !== null && (
            <div className="relative border rounded-xl overflow-hidden bg-slate-950">
              <pre className="p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-[65vh] leading-relaxed whitespace-pre">
                {getFormattedJson()}
              </pre>
            </div>
          )}

          {!loading && !isEditing && kind === 'csv' && csvRows.length > 0 && (
            <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
              <div className="overflow-x-auto max-h-[65vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0 border-b">
                    <tr>
                      {csvRows[0].map((header, colIdx) => (
                        <th key={colIdx} className="px-4 py-2.5 text-left font-bold text-muted-foreground uppercase border-r last:border-0">
                          {header || `Column ${colIdx + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {csvRows.slice(1).map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-muted/20">
                        {csvRows[0].map((_, colIdx) => (
                          <td key={colIdx} className="px-4 py-2 border-r last:border-0 truncate max-w-xs font-medium">
                            {row[colIdx] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && !isEditing && (kind === 'text' || kind === 'markdown') && textContent !== null && (
            <div className="border rounded-xl bg-slate-950 overflow-hidden">
              <div className="flex font-mono text-xs max-h-[65vh] overflow-hidden">
                {/* Line Numbers Sidebar */}
                <div
                  ref={lineNumbersRef}
                  className="select-none text-right px-3 py-4 bg-slate-900 border-r border-slate-800 text-slate-600 font-bold shrink-0 min-w-10 overflow-hidden"
                >
                  {textContent.split('\n').map((_, idx) => (
                    <div key={idx} className="h-5 leading-5">{idx + 1}</div>
                  ))}
                </div>
                {/* Code Body */}
                <div
                  ref={previewScrollRef}
                  onScroll={handlePreviewScroll}
                  className="flex-1 p-4 py-4 text-emerald-300 overflow-auto whitespace-pre leading-5 h-[65vh]"
                >
                  {textContent.split('\n').map((line, idx) => (
                    <div key={idx} className="h-5 leading-5 hover:bg-slate-900/50 px-1">{line || ' '}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!loading && kind === 'unknown' && (
            <div className="text-center py-16 border border-dashed rounded-xl bg-card">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground opacity-30 mb-4" />
              <h3 className="text-sm font-bold">No Preview Available</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Previews are supported for images, audios, videos, PDFs, JSON, CSV, Markdown, and various text/code formats.
              </p>
              <Button className="mt-5" size="sm" onClick={() => onDownload(object.Key)}>
                <Download className="w-4 h-4 mr-2" /> Download to View
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

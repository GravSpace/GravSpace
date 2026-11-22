import type { RefObject } from 'react'
import { FileText, Loader2, Download, Music } from 'lucide-react'
import { Button } from '../ui/button'

export type PreviewKind = 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'markdown' | 'csv' | 'json' | 'unknown'

export function getPreviewKind(key: string): PreviewKind {
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

export function getFileName(key: string): string {
  return key.split('/').pop() || key
}

export function formatPreviewFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function parseCSV(text: string): string[][] {
  return text.split('\n')
    .map(row => row.trim())
    .filter(Boolean)
    .map(row => {
      const matches = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',')
      return matches.map(val => val.replace(/^"|"$/g, ''))
    })
}

export interface PreviewContentProps {
  kind: PreviewKind
  loading: boolean
  name: string
  blobUrl: string | null
  textContent: string | null
  isEditing: boolean
  editContent: string
  setEditContent: (val: string) => void
  saving: boolean
  csvRows: string[][]
  formattedJson: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  lineNumbersRef: RefObject<HTMLDivElement | null>
  previewScrollRef: RefObject<HTMLDivElement | null>
  onTextareaScroll: () => void
  onPreviewScroll: () => void
  onDownload: () => void
}

export function PreviewContent({
  kind,
  loading,
  name,
  blobUrl,
  textContent,
  isEditing,
  editContent,
  setEditContent,
  csvRows,
  formattedJson,
  textareaRef,
  lineNumbersRef,
  previewScrollRef,
  onTextareaScroll,
  onPreviewScroll,
  onDownload,
}: PreviewContentProps) {
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <span className="text-xs text-muted-foreground animate-pulse font-medium">Loading preview...</span>
      </div>
    )
  }

  if (kind === 'image' && blobUrl) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-6 bg-slate-900/10 dark:bg-slate-950/40 border border-border/60 rounded-xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08] bg-[radial-gradient(#888_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <img
          src={blobUrl}
          alt={name}
          className="max-h-full max-w-full object-contain rounded-lg shadow-sm select-none"
        />
      </div>
    )
  }

  if (kind === 'audio' && blobUrl) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 bg-card/60 border border-border/60 rounded-xl shadow-xs gap-5 max-w-md mx-auto my-auto w-full">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-xs ring-1 ring-primary/20">
          <Music className="w-8 h-8" />
        </div>
        <div className="text-center w-full px-4">
          <h4 className="text-sm font-semibold truncate text-foreground">{name}</h4>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">Audio / Media</p>
        </div>
        <audio controls src={blobUrl} className="w-full mt-2" />
      </div>
    )
  }

  if (kind === 'video' && blobUrl) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-black/90 rounded-xl border border-border/60 overflow-hidden shadow-lg p-2">
        <video controls src={blobUrl} className="max-h-full max-w-full w-auto rounded-lg shadow-sm" />
      </div>
    )
  }

  if (kind === 'pdf' && blobUrl) {
    return (
      <div className="w-full flex-1 min-h-0 border border-border/60 rounded-xl overflow-hidden bg-card shadow-xs">
        <iframe src={blobUrl} className="w-full h-full border-0" title={name} />
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-hidden flex-1 min-h-0 flex flex-col shadow-inner">
        <div className="flex font-mono text-xs flex-1 min-h-0 overflow-hidden">
          <div
            ref={lineNumbersRef}
            className="select-none text-right px-3 py-4 bg-slate-900 border-r border-slate-800 text-slate-500 font-bold shrink-0 min-w-10 overflow-hidden"
          >
            {editContent.split('\n').map((_, idx) => (
              <div key={idx} className="h-5 leading-5">{idx + 1}</div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onScroll={onTextareaScroll}
            className="flex-1 p-4 bg-slate-950 text-emerald-300 font-mono text-xs leading-5 border-0 focus:outline-none focus:ring-0 resize-none h-full overflow-auto whitespace-pre tab-size-4"
            spellCheck={false}
            autoFocus
          />
        </div>
      </div>
    )
  }

  if (kind === 'json' && textContent !== null) {
    return (
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 flex-1 min-h-0 flex flex-col shadow-inner">
        <pre className="p-4 text-xs font-mono text-emerald-400 overflow-auto flex-1 min-h-0 leading-relaxed whitespace-pre">
          {formattedJson}
        </pre>
      </div>
    )
  }

  if (kind === 'csv' && csvRows.length > 0) {
    return (
      <div className="border border-border/60 rounded-xl bg-card shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-xs">
            <thead className="bg-muted/80 backdrop-blur-xs sticky top-0 border-b z-10">
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
                <tr key={rowIdx} className="hover:bg-muted/30 transition-colors">
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
    )
  }

  if ((kind === 'text' || kind === 'markdown') && textContent !== null) {
    return (
      <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-hidden flex-1 min-h-0 flex flex-col shadow-inner">
        <div className="flex font-mono text-xs flex-1 min-h-0 overflow-hidden">
          <div
            ref={lineNumbersRef}
            className="select-none text-right px-3 py-4 bg-slate-900 border-r border-slate-800 text-slate-500 font-bold shrink-0 min-w-10 overflow-hidden"
          >
            {textContent.split('\n').map((_, idx) => (
              <div key={idx} className="h-5 leading-5">{idx + 1}</div>
            ))}
          </div>
          <div
            ref={previewScrollRef}
            onScroll={onPreviewScroll}
            className="flex-1 p-4 text-emerald-300 overflow-auto whitespace-pre leading-5 h-full"
          >
            {textContent.split('\n').map((line, idx) => (
              <div key={idx} className="h-5 leading-5 hover:bg-slate-900/50 px-1">{line || ' '}</div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center py-12 border border-dashed border-border/80 rounded-xl bg-card my-auto">
      <FileText className="w-12 h-12 mx-auto text-muted-foreground opacity-30 mb-3" />
      <h3 className="text-sm font-bold text-foreground">No Preview Available</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
        Previews are supported for images, audio, video, PDFs, JSON, CSV, Markdown, and text files.
      </p>
      <Button className="mt-4" size="sm" onClick={onDownload}>
        <Download className="w-4 h-4 mr-2" /> Download to View
      </Button>
    </div>
  )
}

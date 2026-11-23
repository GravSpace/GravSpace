import { useEffect } from 'react'
import { Download, Trash2, Globe, Lock, X, Layers, Folder, FileText } from 'lucide-react'
import { Button } from '../ui/button'
import type { BatchItemSummary } from './useBatchOperations'

interface BulkActionsBarProps {
  summary: BatchItemSummary
  onClear: () => void
  onDownload: () => void
  onDelete: () => void
  onTogglePublic?: (makePublic: boolean) => void
  disabled?: boolean
}

export function BulkActionsBar({
  summary,
  onClear,
  onDownload,
  onDelete,
  onTogglePublic,
  disabled = false,
}: BulkActionsBarProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClear()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClear])

  if (summary.count === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in-0 slide-in-from-bottom-5 duration-200">
      <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-2xl bg-slate-900/95 dark:bg-slate-950/95 text-white border border-slate-700/80 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl ring-1 ring-white/10 max-w-[94vw] sm:max-w-2xl overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2.5 pl-1 pr-3 border-r border-slate-700/80 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
            <Layers className="w-4 h-4" />
          </div>
          <div className="flex flex-col select-none">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-white font-mono font-bold">{summary.count}</span>
              <span className="text-slate-300">selected</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono leading-none">
              {summary.filesCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <FileText className="w-2.5 h-2.5 text-slate-300" />
                  {summary.filesCount} ({summary.formattedSize})
                </span>
              )}
              {summary.filesCount > 0 && summary.foldersCount > 0 && <span className="text-slate-600">•</span>}
              {summary.foldersCount > 0 && (
                <span className="flex items-center gap-0.5 text-amber-300">
                  <Folder className="w-2.5 h-2.5" />
                  {summary.foldersCount}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {summary.filesCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2.5 text-xs text-slate-200 hover:text-white hover:bg-slate-800/80 gap-1.5 cursor-pointer font-medium"
              onClick={onDownload}
              disabled={disabled}
              title={`Download ${summary.filesCount} files sequentially`}
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {summary.filesCount}
              </span>
            </Button>
          )}

          {onTogglePublic && (
            <div className="flex items-center bg-slate-800/60 rounded-xl p-0.5 border border-slate-700/60">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-slate-300 hover:text-white hover:bg-slate-700/60 gap-1 cursor-pointer rounded-lg"
                onClick={() => onTogglePublic(true)}
                disabled={disabled}
                title="Make selected items public"
              >
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Public</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-slate-300 hover:text-white hover:bg-slate-700/60 gap-1 cursor-pointer rounded-lg"
                onClick={() => onTogglePublic(false)}
                disabled={disabled}
                title="Make selected items private"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Private</span>
              </Button>
            </div>
          )}

          <Button
            size="sm"
            variant="destructive"
            className="h-8 px-3 text-xs gap-1.5 cursor-pointer font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-xs"
            onClick={onDelete}
            disabled={disabled}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete ({summary.count})
          </Button>

          <div className="h-4 w-px bg-slate-700/80 mx-0.5" />

          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl cursor-pointer gap-1"
            onClick={onClear}
            title="Deselect all (Esc)"
            aria-label="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Deselect</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Trash2, Loader2, AlertTriangle, Folder, FileText, Archive } from 'lucide-react'
import type { BatchItemSummary } from './useBatchOperations'

interface BulkDeleteDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  summary: BatchItemSummary
  isDeleting: boolean
  softDeleteEnabled?: boolean
}

export function BulkDeleteDialog({
  open,
  onClose,
  onConfirm,
  summary,
  isDeleting,
  softDeleteEnabled = false,
}: BulkDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isDeleting && onClose()}>
      <DialogContent className="sm:max-w-[460px] w-full p-0 gap-0 flex flex-col overflow-hidden rounded-2xl border-border/70 shadow-2xl bg-card min-w-0">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 bg-background border-b border-border/40 text-left pr-12 w-full min-w-0 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center shrink-0 shadow-sm shadow-destructive/10 mt-0.5">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold text-foreground tracking-tight truncate">
                Delete {summary.count} Selected {summary.count === 1 ? 'Item' : 'Items'}
              </DialogTitle>
              <DialogDescription className="text-xs mt-1.5 flex flex-wrap items-center gap-1.5">
                {summary.filesCount > 0 && (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-foreground bg-muted px-2 py-0.5 rounded-md border border-border/60">
                    <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span>{summary.filesCount} {summary.filesCount === 1 ? 'file' : 'files'} &middot; {summary.formattedSize}</span>
                  </span>
                )}
                {summary.foldersCount > 0 && (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                    <Folder className="w-3 h-3 shrink-0" />
                    <span>{summary.foldersCount} {summary.foldersCount === 1 ? 'folder' : 'folders'}</span>
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="p-5 space-y-3 bg-card/50 w-full min-w-0 flex-1 overflow-hidden">
          {/* Recursive warning for folders */}
          {summary.hasFolders && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs w-full min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="text-[11px] leading-relaxed break-words min-w-0 flex-1">
                <strong className="font-semibold text-amber-800 dark:text-amber-300">Recursive Folder Deletion</strong>: All nested files and sub-folders inside selected directories will be deleted.
              </div>
            </div>
          )}

          {/* Soft Delete vs Permanent Deletion Notice */}
          {softDeleteEnabled ? (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-foreground text-xs w-full min-w-0">
              <Archive className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
              <div className="text-[11px] leading-relaxed break-words min-w-0 flex-1">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">Recycle Bin (Soft Delete Enabled)</p>
                <p className="text-muted-foreground mt-0.5 break-words">
                  Selected items will be safely moved to the <strong>Recycle Bin</strong> and can be restored or purged later.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-foreground text-xs w-full min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
              <div className="text-[11px] leading-relaxed break-words min-w-0 flex-1">
                <p className="font-semibold text-destructive">Permanent Deletion Warning</p>
                <p className="text-foreground/80 dark:text-muted-foreground mt-0.5 break-words">
                  Soft Delete is not enabled for this bucket. Selected items will be deleted immediately and <strong>cannot be recovered</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Selected Items List Box */}
          <div className="border border-border/70 rounded-xl overflow-hidden bg-background shadow-xs w-full min-w-0">
            <div className="px-3.5 py-2 bg-muted/40 border-b border-border/40 flex items-center justify-between text-[11px] w-full min-w-0">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <span>Items to delete</span>
                <span className="px-1.5 py-0.2 bg-muted-foreground/15 text-muted-foreground rounded-full text-[10px] font-mono font-medium">
                  {summary.keys.length}
                </span>
              </div>
              <div className="text-muted-foreground text-[10px] font-mono">
                Total: {summary.formattedSize}
              </div>
            </div>

            <div className="max-h-44 overflow-y-auto overflow-x-hidden divide-y divide-border/30 text-xs w-full min-w-0">
              {(summary.items || summary.keys.map((k) => ({
                key: k,
                isFolder: k.endsWith('/'),
                prefix: k.includes('/') ? k.slice(0, k.lastIndexOf('/') + 1) : '',
                name: k.includes('/') ? k.slice(k.lastIndexOf('/') + 1) : k,
              }))).map((item) => (
                <div
                  key={item.key}
                  className="px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors group w-full min-w-0"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                    {item.isFolder ? (
                      <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                    <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden" title={item.key}>
                      {item.prefix && (
                        <span className="text-muted-foreground/70 text-[11px] font-mono shrink-0 max-w-[90px] truncate">
                          {item.prefix}
                        </span>
                      )}
                      <span className="font-medium text-foreground text-xs truncate min-w-0 flex-1 block">
                        {item.name}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center">
                    {item.isFolder ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        Folder
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/40">
                        {item.formattedSize || '—'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3.5 bg-muted/30 border-t border-border/40 flex flex-row items-center justify-between gap-2 w-full min-w-0 shrink-0">
          <span className="text-[11px] text-muted-foreground hidden sm:inline-flex items-center gap-1 shrink-0">
            Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 text-[10px] font-mono">Esc</kbd> to cancel
          </span>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isDeleting}
              className="cursor-pointer text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onConfirm}
              disabled={isDeleting}
              className="gap-1.5 cursor-pointer font-medium text-xs h-8 shadow-sm shadow-destructive/20 min-w-[110px]"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete {summary.count === 1 ? 'Item' : `${summary.count} Items`}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

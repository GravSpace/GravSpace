import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@ui-sdk/react/alert-dialog'
import { AlertTriangle } from 'lucide-react'

interface ConfirmActionDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  confirmAgentHint: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete permanently',
  confirmAgentHint,
  onConfirm,
  onCancel,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen) {
          if (details?.returnValue === 'confirm') {
            onConfirm()
          } else {
            onCancel()
          }
        }
      }}
    >
      <AlertDialogBackdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150" />
      <AlertDialogContent className="w-[min(26rem,calc(100%-2rem))] p-5 gap-3.5 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 transition-all duration-150">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <AlertDialogTitle className="text-sm font-bold text-foreground">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {description}
            </AlertDialogDescription>
          </div>
        </div>

        <div className="pt-2.5 border-t border-border/50 flex items-center justify-end gap-2">
          <AlertDialogClose className="h-8 px-3 rounded-lg border border-border/70 bg-background hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer">
            Cancel
          </AlertDialogClose>
          <AlertDialogClose
            value="confirm"
            data-agent-confirm={confirmAgentHint}
            className="h-8 px-3.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            {confirmLabel}
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

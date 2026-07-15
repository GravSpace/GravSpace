import {
  CheckCircle,
  AlertCircle,
  Trash2,
  X,
  ArrowUp,
  ArrowDown,
  Pause,
  Play,
} from 'lucide-react'
import { useTransfers, type TransferItem } from '../hooks/useTransfers'

export function TransferManager() {
  const {
    transfers,
    removeTransfer,
    clearCompleted,
    activeTransfersCount,
    showTransferManager,
    setShowTransferManager,
    pauseTransfer,
    resumeTransfer,
  } = useTransfers()

  if (!showTransferManager || transfers.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 w-96 max-h-[500px] flex flex-col bg-[#1e2329] border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden z-50 transition-all duration-300">
      {/* HEADER */}
      <header className="h-14 px-4 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
        <h2 className="text-sm font-bold text-slate-100 tracking-wide uppercase">
          Transfers
        </h2>
        <div className="flex items-center gap-1">
          {transfers.some(
            (t) => t.status === 'completed' || t.status === 'cancelled',
          ) && (
            <button
              onClick={clearCompleted}
              className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all"
              title="Clear Completed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowTransferManager(false)}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {transfers.map((transfer) => (
          <TransferRow
            key={transfer.id}
            transfer={transfer}
            onRemove={() => removeTransfer(transfer.id)}
            onPause={() => pauseTransfer(transfer.id)}
            onResume={() => resumeTransfer(transfer.id)}
          />
        ))}
      </div>

      {/* FOOTER */}
      {activeTransfersCount > 0 && (
        <footer className="px-4 py-2 bg-primary/10 border-t border-primary/20">
          <p className="text-[10px] font-bold text-primary uppercase text-center tracking-widest animate-pulse">
            Processing {activeTransfersCount} active transfer
            {activeTransfersCount > 1 ? 's' : ''}...
          </p>
        </footer>
      )}
    </div>
  )
}

function TransferRow({
  transfer,
  onRemove,
  onPause,
  onResume,
}: {
  transfer: TransferItem
  onRemove: () => void
  onPause: () => void
  onResume: () => void
}) {
  const isActive =
    transfer.status === 'uploading' ||
    transfer.status === 'downloading' ||
    transfer.status === 'paused'

  return (
    <div className="group relative">
      <div className="flex items-start gap-3">
        {/* STATUS ICON */}
        <div className="mt-0.5 shrink-0">
          {transfer.status === 'completed' ? (
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          ) : transfer.status === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-500" />
          ) : transfer.status === 'paused' ? (
            <div className="relative w-5 h-5">
              <div className="w-5 h-5 rounded-full border-2 border-amber-500/30 border-t-amber-500" />
              <Pause className="absolute inset-0 m-auto w-2 h-2 text-amber-500" />
            </div>
          ) : (
            <div className="relative w-5 h-5">
              <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              {transfer.type === 'upload' ? (
                <ArrowUp className="absolute inset-0 m-auto w-2.5 h-2.5 text-primary" />
              ) : (
                <ArrowDown className="absolute inset-0 m-auto w-2.5 h-2.5 text-primary" />
              )}
            </div>
          )}
        </div>

        {/* INFO */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3
              className="text-sm font-bold text-slate-100 truncate pr-4"
              title={transfer.name}
            >
              {transfer.name}
            </h3>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
              {transfer.status === 'uploading' && transfer.isMultipart && (
                <button
                  onClick={onPause}
                  className="p-1 rounded hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 transition-all"
                  title="Pause"
                >
                  <Pause className="w-3.5 h-3.5" />
                </button>
              )}
              {transfer.status === 'paused' && (
                <button
                  onClick={onResume}
                  className="p-1 rounded hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition-all"
                  title="Resume"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              )}
              {isActive ? (
                <button
                  onClick={onRemove}
                  className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-all"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={onRemove}
                  className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
            {transfer.type}:{' '}
            <span className="text-slate-400">{transfer.bucket}</span>
          </p>

          {/* PROGRESS */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  transfer.status === 'completed'
                    ? 'bg-emerald-500'
                    : transfer.status === 'error'
                      ? 'bg-rose-500'
                      : transfer.status === 'cancelled'
                        ? 'bg-slate-500'
                        : transfer.status === 'paused'
                          ? 'bg-amber-500'
                          : transfer.type === 'download'
                            ? 'bg-blue-400'
                            : 'bg-primary'
                }`}
                style={{ width: `${transfer.progress}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-bold text-slate-300 w-10 text-right">
              {Math.round(transfer.progress)}%
            </span>
          </div>

          {transfer.error && (
            <p className="text-[10px] text-rose-400 mt-1 font-medium truncate">
              {transfer.error}
            </p>
          )}
          {transfer.status === 'cancelled' && (
            <p className="text-[10px] text-slate-400 mt-1 font-medium italic">
              Transfer cancelled
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

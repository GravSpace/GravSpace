export interface PeerTestResult {
  success: boolean
  latency?: number
  msg: string
  admin?: { success: boolean; latency_ms: number; message: string }
  s3?: { success: boolean; latency_ms: number; message: string; authenticated: boolean }
}

interface PeerTestStatusBannerProps {
  result: PeerTestResult
}

export function PeerTestStatusBanner({ result }: PeerTestStatusBannerProps) {
  return (
    <div className="space-y-1.5 pt-1">
      {result.admin && (
        <div
          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-mono tabular-nums border ${
            result.admin.success
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
          }`}
        >
          <span className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full ${result.admin.success ? 'bg-emerald-500' : 'bg-rose-500'}`}
              aria-hidden="true"
            />
            <span>Admin API</span>
          </span>
          <span className="truncate">{result.admin.message}</span>
        </div>
      )}

      {result.s3 && (
        <div
          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-mono tabular-nums border ${
            result.s3.success
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
          }`}
        >
          <span className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full ${result.s3.success ? 'bg-emerald-500' : 'bg-amber-500'}`}
              aria-hidden="true"
            />
            <span>S3 Storage</span>
          </span>
          <span className="truncate">{result.s3.message}</span>
        </div>
      )}

      {!result.admin && !result.s3 && (
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border ${
            result.success
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${result.success ? 'bg-emerald-500' : 'bg-amber-500'}`}
            aria-hidden="true"
          />
          <span className="truncate">{result.msg}</span>
        </div>
      )}
    </div>
  )
}

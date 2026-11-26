import { useMemo, useState } from 'react'
import { CheckCircle2, Code2, Copy, Download, Eye, EyeOff, FileText, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { detectSecretFileExt, formatSecretFileSize } from './vaultDownload'
import type { VaultSecret } from './vaultTypes'

interface SecretFileOverviewProps {
  secret: VaultSecret
  revealedValue: string | null
  revealing: boolean
  onReveal: () => void
  onDownload?: (s: VaultSecret, mode?: 'file' | 'bundle') => void
}

export function SecretFileOverview({
  secret,
  revealedValue,
  revealing,
  onReveal,
  onDownload,
}: SecretFileOverviewProps) {
  const [prettyJson, setPrettyJson] = useState(true)
  const isFile = secret.secret_type === 'file'
  const meta = secret.metadata || {}
  const ext = detectSecretFileExt(meta.file_name || secret.name, meta)
  const isBinaryFile = isFile && meta.encoding === 'base64'
  const isJsonFile = isFile && ext === 'json' && !isBinaryFile

  const formattedDisplay = useMemo(() => {
    if (!revealedValue) return null
    if (!isJsonFile || !prettyJson) return revealedValue
    try {
      return JSON.stringify(JSON.parse(revealedValue), null, 2)
    } catch {
      return revealedValue
    }
  }, [revealedValue, isJsonFile, prettyJson])

  const shaShort = typeof meta.sha256 === 'string' && meta.sha256.length >= 12
    ? `${meta.sha256.slice(0, 12)}…`
    : null

  return (
    <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          {isFile && <FileText className="w-3.5 h-3.5 text-emerald-500" />}
          {isFile ? 'Secret File (AES-256-GCM)' : 'Secret Value (AES-256-GCM)'}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onReveal} disabled={revealing} className="h-7 text-[11px] gap-1">
            {revealedValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {revealedValue ? 'Hide' : 'Reveal'}
          </Button>
          {isJsonFile && revealedValue && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPrettyJson((prev) => !prev)}
              className="h-7 text-[11px] gap-1"
            >
              <Code2 className="w-3.5 h-3.5" />
              {prettyJson ? 'Raw' : 'Pretty'}
            </Button>
          )}
          {revealedValue && !isBinaryFile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(revealedValue)
                toast.success('Copied value to clipboard')
              }}
              className="h-7 text-[11px] gap-1"
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </Button>
          )}
          {onDownload && (
            secret.secret_type === 'keystore' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(secret, 'bundle')}
                className="h-7 text-[11px] gap-1 text-primary hover:text-primary font-semibold"
                title="Download binary .jks and companion credentials file in a single .zip bundle"
              >
                <Download className="w-3.5 h-3.5" /> Download Bundle (.zip)
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(secret, 'file')}
                className="h-7 text-[11px] gap-1 text-primary hover:text-primary"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
            )
          )}
        </div>
      </div>

      {isFile && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <Badge variant="outline" className="font-mono uppercase text-[10px] py-0 h-5">
            .{ext}
          </Badge>
          {meta.file_category && (
            <Badge variant="outline" className="text-[10px] py-0 h-5 capitalize">
              {String(meta.file_category)}
            </Badge>
          )}
          {typeof meta.size_bytes === 'number' && (
            <span className="px-1.5 py-0.5 rounded bg-background border border-border/50 font-mono text-muted-foreground">
              {formatSecretFileSize(meta.size_bytes)}
            </span>
          )}
          {typeof meta.line_count === 'number' && meta.line_count > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-background border border-border/50 font-mono text-muted-foreground">
              {meta.line_count} lines
            </span>
          )}
          {typeof meta.json_valid === 'boolean' && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${
              meta.json_valid
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400'
            }`}>
              {meta.json_valid ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {meta.json_valid ? 'Valid JSON' : 'JSON Note'}
            </span>
          )}
          {shaShort && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(String(meta.sha256))
                toast.success('SHA-256 digest copied')
              }}
              title={`SHA-256: ${meta.sha256}`}
              className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background border border-border/50 font-mono text-muted-foreground hover:text-foreground cursor-pointer"
            >
              sha256:{shaShort}
              <Copy className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}

      <div className="font-mono text-xs p-2.5 rounded-lg bg-background border border-border/40 select-all">
        {!revealedValue ? (
          <span className="text-muted-foreground tracking-widest">
            ••••••••••••••••••••••••••••••••
          </span>
        ) : isBinaryFile ? (
          <span className="text-muted-foreground font-sans text-[11px]">
            Binary payload stored securely ({formatSecretFileSize(meta.size_bytes)}). Use Download to export the original file.
          </span>
        ) : isFile ? (
          <pre className="text-foreground whitespace-pre-wrap break-words max-h-[240px] overflow-auto leading-relaxed font-mono text-xs">
            {formattedDisplay}
          </pre>
        ) : (
          <span className="text-foreground break-all whitespace-pre-wrap">{formattedDisplay}</span>
        )}
      </div>
    </div>
  )
}

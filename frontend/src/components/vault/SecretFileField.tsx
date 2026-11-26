import { useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ClipboardPaste,
  Code2,
  FileCode,
  FileText,
  Upload,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import { Tabs, TabsList, TabsTab } from '@ui-sdk/react/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  SECRET_FILE_ACCEPT,
  VAULT_MAX_FILE_BYTES,
  detectSecretFileExt,
  formatSecretFileSize,
  readSecretUploadFile,
} from './vaultDownload'

interface SecretFileFieldProps {
  fileName: string
  value: string
  encoding: 'utf8' | 'base64'
  onChange: (next: {
    value: string
    encoding: 'utf8' | 'base64'
    fileName?: string
  }) => void
  showTemplates?: boolean
  disabled?: boolean
  onLoadCurrent?: () => void
  loadingCurrent?: boolean
}

const FILE_TEMPLATES = [
  {
    label: '.json',
    fileName: 'service-credentials.json',
    content: '{\n  "type": "service_account",\n  "project_id": "",\n  "private_key_id": "",\n  "client_email": ""\n}\n',
  },
  {
    label: '.md',
    fileName: 'RECOVERY_RUNBOOK.md',
    content: '# Security Recovery Notes\n\n- Key Owner:\n- Rotation Cadence: 90 days\n- Emergency Steps:\n',
  },
  {
    label: '.txt',
    fileName: 'recovery-codes.txt',
    content: '# One-time backup recovery codes (store securely)\n',
  },
  {
    label: '.pem',
    fileName: 'signing-key.pem',
    content: '-----BEGIN PRIVATE KEY-----\n\n-----END PRIVATE KEY-----\n',
  },
] as const

function computeStats(value: string, encoding: 'utf8' | 'base64') {
  if (!value) return { bytes: 0, lines: 0 }
  if (encoding === 'base64') {
    const clean = value.replace(/\s+/g, '')
    const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
    return { bytes: Math.max(0, Math.floor((clean.length * 3) / 4) - padding), lines: 0 }
  }
  const bytes = new TextEncoder().encode(value).length
  const lines = value.split(/\r\n|\r|\n/).length
  return { bytes, lines }
}

export function SecretFileField({
  fileName,
  value,
  encoding,
  onChange,
  showTemplates = true,
  disabled = false,
  onLoadCurrent,
  loadingCurrent = false,
}: SecretFileFieldProps) {
  const [mode, setMode] = useState<'upload' | 'edit'>(value && encoding === 'utf8' ? 'edit' : 'upload')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const ext = detectSecretFileExt(fileName)
  const isJsonFile = ext === 'json'
  const stats = useMemo(() => computeStats(value, encoding), [value, encoding])

  const jsonState = useMemo(() => {
    if (!isJsonFile || encoding !== 'utf8' || !value.trim()) return null
    try {
      JSON.parse(value)
      return { valid: true as const, error: null }
    } catch (err: unknown) {
      return { valid: false as const, error: err instanceof Error ? err.message : 'Invalid JSON syntax' }
    }
  }, [isJsonFile, encoding, value])

  async function processFile(file: File) {
    try {
      const parsed = await readSecretUploadFile(file)
      onChange({
        value: parsed.content,
        encoding: parsed.encoding,
        fileName: file.name,
      })
      if (parsed.encoding === 'utf8') {
        setMode('edit')
      }
      toast.success(`Loaded "${file.name}" (${formatSecretFileSize(parsed.sizeBytes)}, ${parsed.encoding.toUpperCase()})`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file.')
    }
  }

  function handleFormatJson() {
    try {
      const formatted = JSON.stringify(JSON.parse(value), null, 2) + '\n'
      onChange({ value: formatted, encoding: 'utf8' })
      toast.success('Formatted JSON content')
    } catch {
      toast.error('Cannot format invalid JSON — check syntax first.')
    }
  }

  async function handlePaste() {
    try {
      const clip = await navigator.clipboard.readText()
      if (clip) {
        onChange({ value: clip, encoding: 'utf8' })
        toast.success('Pasted text from clipboard')
      }
    } catch {
      toast.error('Clipboard access denied')
    }
  }

  return (
    <div className="space-y-2.5 p-3 rounded-xl bg-muted/20 border border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={mode} onValueChange={(v) => { if (v) setMode(v as 'upload' | 'edit') }}>
          <TabsList aria-label="Secret file input mode" className="inline-flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border/60">
            <TabsTab
              value="upload"
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground data-selected:bg-primary/10 data-selected:text-primary data-selected:font-semibold cursor-pointer inline-flex items-center gap-1"
            >
              <Upload className="w-3 h-3" /> Upload File
            </TabsTab>
            <TabsTab
              value="edit"
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground data-selected:bg-primary/10 data-selected:text-primary data-selected:font-semibold cursor-pointer inline-flex items-center gap-1"
            >
              <FileCode className="w-3 h-3" /> Paste / Edit Text
            </TabsTab>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          {value && (
            <>
              <span className="px-1.5 py-0.5 rounded bg-background border border-border/60 text-foreground">
                {encoding === 'base64' ? 'BASE64 BIN' : 'UTF-8'}
              </span>
              <span>{formatSecretFileSize(stats.bytes)}</span>
              {stats.lines > 0 && <span>· {stats.lines} lines</span>}
            </>
          )}
          {!value && <span>Max {formatSecretFileSize(VAULT_MAX_FILE_BYTES)}</span>}
        </div>
      </div>

      {mode === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (disabled) return
            const f = e.dataTransfer.files?.[0]
            if (f) void processFile(f)
          }}
          className={`rounded-xl border border-dashed p-4 text-center transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-border/80 bg-background/60 hover:bg-background/90'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={SECRET_FILE_ACCEPT}
            disabled={disabled}
            aria-label="Upload secret file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void processFile(f)
              e.target.value = ''
            }}
            className="hidden"
          />
          <FileText className="w-5 h-5 mx-auto text-primary/80 mb-1.5" />
          <p className="text-xs font-medium text-foreground">
            Drop key, config, markdown, or JSON file here
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            .txt, .md, .json, .pem, .key, .pub, .env, .yaml, .toml, .conf, .asc (max 2 MiB)
          </p>
          <div className="mt-2.5 flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="h-7 text-[11px] gap-1"
            >
              <Upload className="w-3 h-3" /> Choose File
            </Button>
            {onLoadCurrent && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || loadingCurrent}
                onClick={onLoadCurrent}
                className="h-7 text-[11px]"
              >
                {loadingCurrent ? 'Loading...' : 'Load Current Content'}
              </Button>
            )}
          </div>
          {encoding === 'base64' && value && (
            <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 font-mono">
              Binary file staged in Base64 ({formatSecretFileSize(stats.bytes)}).
            </p>
          )}
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 flex-wrap">
              <Label className="text-[11px] font-semibold text-foreground mr-1">
                File Content <span className="text-rose-500">*</span>
              </Label>
              {showTemplates && FILE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange({
                      value: tpl.content,
                      encoding: 'utf8',
                      fileName: fileName.trim() ? undefined : tpl.fileName,
                    })
                  }}
                  className="px-1.5 py-0.5 rounded border border-border/60 bg-background hover:border-primary/40 hover:text-primary text-[10px] font-mono transition-colors cursor-pointer"
                >
                  {tpl.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              {isJsonFile && encoding === 'utf8' && value.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={handleFormatJson}
                  className="h-6 px-2 text-[10px] gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Format JSON
                </Button>
              )}
              {onLoadCurrent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || loadingCurrent}
                  onClick={onLoadCurrent}
                  className="h-6 px-2 text-[10px]"
                >
                  {loadingCurrent ? 'Loading...' : 'Load Current'}
                </Button>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => void handlePaste()}
                className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ClipboardPaste className="w-3 h-3" /> Paste
              </button>
            </div>
          </div>

          {encoding === 'base64' ? (
            <div className="p-3 rounded-lg bg-background border border-amber-500/30 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
              <span>Binary Base64 payload loaded ({formatSecretFileSize(stats.bytes)}). Switch to text or upload another file to replace.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ value: '', encoding: 'utf8' })}
                className="h-6 text-[10px] shrink-0"
              >
                Switch to Text
              </Button>
            </div>
          ) : (
            <Textarea
              value={value}
              onChange={(e) => onChange({ value: e.target.value, encoding: 'utf8' })}
              disabled={disabled}
              placeholder={isJsonFile ? '{\n  "key": "value"\n}' : 'Paste key file, Markdown runbook, JSON credentials, or config text...'}
              className="min-h-[135px] max-h-[260px] font-mono text-xs bg-background/90 border-border/70 leading-relaxed resize-y"
            />
          )}

          {jsonState && (
            <div className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border ${
              jsonState.valid
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400'
            }`}>
              {jsonState.valid ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
              {jsonState.valid ? (
                <span className="inline-flex items-center gap-1"><Code2 className="w-3 h-3" /> Valid JSON syntax</span>
              ) : (
                <span className="truncate">JSON note: {jsonState.error} (still savable as template/JSONC)</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

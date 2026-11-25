import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Upload, Download, Copy, Check, FileText, Clipboard, Trash2, FileUp, Sparkles, ChevronDown } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { toast } from 'sonner'
import { type VaultEnvironment, type VaultProject, getEnvTheme } from './vaultTypes'

interface Props {
  open: boolean
  onClose: () => void
  projects?: VaultProject[]
  currentProject?: string
  environments: VaultEnvironment[]
  currentEnv: string
  mode: 'import' | 'export'
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  onImportComplete: () => void
}

export function ImportExportDialog({
  open,
  onClose,
  projects,
  currentProject,
  environments,
  currentEnv,
  mode,
  apiBase,
  authFetch,
  onImportComplete,
}: Props) {
  const [targetEnv, setTargetEnv] = useState<string>(
    currentEnv === 'all' ? environments[0]?.slug || 'development' : currentEnv
  )
  const [targetProject, setTargetProject] = useState<string>(
    currentProject === 'all' ? (projects?.[0]?.slug || 'default') : (currentProject || 'default')
  )
  const [rawEnv, setRawEnv] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTargetEnv(currentEnv === 'all' ? environments[0]?.slug || 'development' : currentEnv)
      setTargetProject(currentProject === 'all' ? (projects?.[0]?.slug || 'default') : (currentProject || 'default'))
    }
  }, [open, currentEnv, currentProject, environments, projects])

  const envObj = environments.find((e) => e.slug === targetEnv)
  const envTheme = getEnvTheme(envObj?.color)

  // Parsed variables keys for live preview
  const parsedKeys = useMemo(() => {
    return rawEnv
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const idx = l.indexOf('=')
        return l.slice(0, idx).trim()
      })
      .filter(Boolean)
  }, [rawEnv])

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (text) {
        setRawEnv(text)
        toast.success(`Loaded ${file.name}`)
      }
    }
    reader.readAsText(file)
  }

  async function handlePasteClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setRawEnv(text)
        toast.success('Pasted from clipboard')
      }
    } catch {
      toast.error('Unable to access clipboard')
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!rawEnv.trim()) return

    setSubmitting(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment: targetEnv,
          project_id: targetProject,
          raw_env: rawEnv,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(`Successfully imported ${data.imported_count ?? 0} secrets into ${envObj?.name || targetEnv}.`)
        setRawEnv('')
        onImportComplete()
        onClose()
      } else {
        throw new Error(data.message || 'Import failed')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error importing .env file.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleExportDownload() {
    try {
      const projParam = targetProject && targetProject !== 'all' ? `&project=${targetProject}` : ''
      const res = await authFetch(`${apiBase}/admin/vault/export?env=${targetEnv}${projParam}`)
      if (!res.ok) throw new Error('Export failed')
      const text = await res.text()

      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `.env.${targetEnv}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Downloaded .env.${targetEnv}`)
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Error exporting .env')
    }
  }

  async function handleExportCopy() {
    try {
      const projParam = targetProject && targetProject !== 'all' ? `&project=${targetProject}` : ''
      const res = await authFetch(`${apiBase}/admin/vault/export?env=${targetEnv}${projParam}`)
      if (!res.ok) throw new Error('Export failed')
      const text = await res.text()
      navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Exported .env copied to clipboard.')
      setTimeout(() => setCopied(false), 2000)
    } catch (err: any) {
      toast.error(err.message || 'Error copying .env')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-xl rounded-2xl border border-border/80 bg-card p-0 overflow-hidden shadow-2xl max-h-[92vh] flex flex-col text-xs">
        {/* Header with safe pr-14 for X close button */}
        <DialogHeader className="px-5 py-3.5 border-b border-border/50 bg-muted/20 flex flex-row items-start gap-3 shrink-0 pr-14">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
            {mode === 'import' ? <Upload className="w-4 h-4 text-primary" /> : <Download className="w-4 h-4 text-primary" />}
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
              {mode === 'import' ? 'Import Environment Variables (.env)' : 'Export Environment (.env)'}
            </DialogTitle>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground font-medium">Target:</span>
              {projects && projects.length > 0 && (
                <div className="relative inline-flex items-center">
                  <select
                    value={targetProject}
                    onChange={(e) => setTargetProject(e.target.value)}
                    className="h-5 pl-2 pr-5 rounded-full text-[10px] font-semibold border border-border/80 bg-muted/60 text-foreground appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                    title="Target Project"
                  >
                    {projects.map((p) => (
                      <option key={p.slug} value={p.slug} className="bg-popover text-popover-foreground">
                        📁 {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-2.5 h-2.5 absolute right-1.5 pointer-events-none opacity-60" />
                </div>
              )}
              {environments.length > 1 && (
                <div className="relative inline-flex items-center">
                  <select
                    value={targetEnv}
                    onChange={(e) => setTargetEnv(e.target.value)}
                    className={`h-5 pl-2 pr-5 rounded-full text-[10px] font-semibold font-mono border appearance-none cursor-pointer transition-colors ${envTheme.badge} focus:outline-none focus:ring-1 focus:ring-primary`}
                    title="Target Environment"
                  >
                    {environments.map((e) => (
                      <option key={e.slug} value={e.slug} className="bg-popover text-popover-foreground font-sans">
                        ● {e.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-2.5 h-2.5 absolute right-1.5 pointer-events-none opacity-60" />
                </div>
              )}
            </div>
            <DialogDescription className="text-[11px] text-muted-foreground mt-1 truncate">
              {mode === 'import'
                ? `Bulk encrypt and insert secrets into ${envObj?.name || targetEnv}.`
                : `Download or copy decrypted variables for ${envObj?.name || targetEnv}.`}
            </DialogDescription>
          </div>
        </DialogHeader>

        {mode === 'import' ? (
          <form onSubmit={handleImport} className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <div className="p-5 space-y-3.5 flex-1 min-w-0 overflow-y-auto">
              {/* Quick Actions Toolbar */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <input
                    type="file"
                    accept=".env,.txt"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-[11px] gap-1 px-2.5 border-border/70 hover:bg-muted"
                  >
                    <FileUp className="w-3 h-3 text-muted-foreground" />
                    Upload File
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePasteClipboard}
                    className="h-7 text-[11px] gap-1 px-2.5 border-border/70 hover:bg-muted"
                  >
                    <Clipboard className="w-3 h-3 text-muted-foreground" />
                    Paste
                  </Button>
                  {rawEnv && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRawEnv('')}
                      className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-rose-500"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear
                    </Button>
                  )}
                </div>

                {parsedKeys.length > 0 && (
                  <Badge variant="outline" className="text-[10px] h-6 px-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 font-mono shrink-0 gap-1 flex items-center">
                    <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                    <span>{parsedKeys.length} {parsedKeys.length === 1 ? 'key' : 'keys'} found</span>
                  </Badge>
                )}
              </div>

              {/* Code Editor Box */}
              <div className="relative rounded-xl border border-border/70 bg-zinc-950/40 overflow-hidden focus-within:border-primary/50 transition-colors w-full min-w-0">
                <Textarea
                  value={rawEnv}
                  onChange={(e) => setRawEnv(e.target.value)}
                  placeholder={"# Paste .env or drop file\nAPI_KEY=xyz_secret_token\nDATABASE_URL=postgres://...\nPORT=8080"}
                  className="min-h-[160px] max-h-[260px] w-full min-w-0 font-mono text-[11px] border-0 bg-transparent resize-none p-3 leading-relaxed placeholder:text-muted-foreground/40 focus-visible:ring-0 break-all whitespace-pre-wrap"
                  required
                />
              </div>

              {/* Live Detected Keys Chips */}
              {parsedKeys.length > 0 && (
                <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50 space-y-1.5 w-full min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                      Detected Variables ({parsedKeys.length}):
                    </span>
                    {parsedKeys.length > 8 && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        showing first 8
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto scrollbar-none w-full min-w-0">
                    {parsedKeys.slice(0, 8).map((k) => (
                      <span
                        key={k}
                        title={k}
                        className="px-2 py-0.5 rounded-md bg-background border border-border/60 text-[10px] font-mono text-foreground font-medium truncate max-w-[200px]"
                      >
                        {k}
                      </span>
                    ))}
                    {parsedKeys.length > 8 && (
                      <span className="px-2 py-0.5 rounded-md bg-muted/80 text-[10px] font-mono text-muted-foreground font-semibold">
                        +{parsedKeys.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky dialog footer with background */}
            <DialogFooter className="px-5 py-3 border-t border-border/50 bg-muted/20 flex flex-row items-center justify-end gap-2 shrink-0 sm:space-x-0 w-full">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting} className="h-8 text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting || parsedKeys.length === 0} className="h-8 gap-1.5 text-xs font-semibold shadow-2xs">
                <Upload className="w-3.5 h-3.5" />
                {submitting ? 'Encrypting & Storing...' : `Import ${parsedKeys.length} Secrets`}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="p-6 space-y-4 text-center">
            <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-left space-y-1.5">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Target: .env.{targetEnv}
              </span>
              <p className="text-[11px] text-muted-foreground">
                All KV secrets belonging to <strong>{envObj?.name || targetEnv}</strong> will be decrypted and formatted into standard KEY="VALUE" lines.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={handleExportCopy} className="gap-1.5 h-9 text-xs">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy to Clipboard
              </Button>
              <Button size="sm" onClick={handleExportDownload} className="gap-1.5 h-9 text-xs shadow-2xs">
                <Download className="w-3.5 h-3.5" />
                Download File
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

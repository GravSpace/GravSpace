import { useState, useEffect, useCallback } from 'react'
import { Download, Copy, Check, FileText, Code2, Table, ShieldAlert, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { type VaultEnvironment, type VaultProject, type ExportFormat, type SecretType, TYPE_CONFIG } from './vaultTypes'

interface ExportSecretsDialogProps {
  open: boolean
  onClose: () => void
  projects?: VaultProject[]
  currentProject?: string
  environments: VaultEnvironment[]
  currentEnv: string
  apiBase: string
  authFetch: (url: string, options?: RequestInit) => Promise<Response>
}

const ALL_TYPES: SecretType[] = ['kv', 'agent_token', 'keystore', 'certificate', 'file']

export function ExportSecretsDialog({
  open,
  onClose,
  projects,
  currentProject,
  environments,
  currentEnv,
  apiBase,
  authFetch,
}: ExportSecretsDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('dotenv')
  const [selectedEnv, setSelectedEnv] = useState<string>(currentEnv === 'all' ? 'all' : currentEnv)
  const [selectedProject, setSelectedProject] = useState<string>(currentProject || 'all')
  const [selectedTypes, setSelectedTypes] = useState<SecretType[]>(ALL_TYPES)
  const [includePam, setIncludePam] = useState(false)

  const [previewContent, setPreviewContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedEnv(currentEnv === 'all' ? 'all' : currentEnv)
      setSelectedProject(currentProject || 'all')
    }
  }, [open, currentEnv, currentProject])

  const fetchExportData = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (selectedProject && selectedProject !== 'all') q.set('project', selectedProject)
      if (selectedEnv) q.set('env', selectedEnv)
      q.set('format', format)
      q.set('types', selectedTypes.join(','))
      q.set('include_pam', includePam ? 'true' : 'false')

      const res = await authFetch(`${apiBase}/admin/vault/export?${q.toString()}`)
      if (res.ok) {
        const text = await res.text()
        setPreviewContent(text)
      } else {
        setPreviewContent('# Error fetching export data')
      }
    } catch {
      setPreviewContent('# Network error generating export')
    } finally {
      setLoading(false)
    }
  }, [open, selectedProject, selectedEnv, format, selectedTypes, includePam, apiBase, authFetch])

  useEffect(() => {
    fetchExportData()
  }, [fetchExportData])

  function handleTypeToggle(t: SecretType) {
    if (selectedTypes.includes(t)) {
      if (selectedTypes.length === 1) {
        toast.warning('Select at least one secret type')
        return
      }
      setSelectedTypes(selectedTypes.filter((x) => x !== t))
    } else {
      setSelectedTypes([...selectedTypes, t])
    }
  }

  async function handleCopy() {
    if (!previewContent) return
    try {
      await navigator.clipboard.writeText(previewContent)
      setCopied(true)
      toast.success('Export content copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  function handleDownload() {
    if (!previewContent) return

    const ext = format === 'dotenv' ? 'env' : format
    const envLabel = selectedEnv === 'all' ? 'all-environments' : selectedEnv
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `vault-${envLabel}-${dateStr}.${ext}`

    const mime =
      format === 'json'
        ? 'application/json'
        : format === 'csv'
        ? 'text/csv'
        : 'text/plain'

    const blob = new Blob([previewContent], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(`Export downloaded: ${filename}`)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-0 overflow-hidden shadow-2xl text-xs">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-border/50 bg-muted/20 flex flex-row items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle className="text-sm font-semibold tracking-tight">
              Export Vault & Secrets
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
              Download or copy decrypted credentials in standard format.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Format Selector Tabs */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold">Export Format</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormat('dotenv')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  format === 'dotenv'
                    ? 'border-primary bg-primary/5 text-primary shadow-2xs font-semibold'
                    : 'border-border/60 hover:border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <div>
                  <div className="text-xs">.env (Shell)</div>
                  <div className="text-[10px] opacity-70">KEY="VALUE" lines</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  format === 'json'
                    ? 'border-primary bg-primary/5 text-primary shadow-2xs font-semibold'
                    : 'border-border/60 hover:border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code2 className="w-4 h-4 shrink-0" />
                <div>
                  <div className="text-xs">JSON Backup</div>
                  <div className="text-[10px] opacity-70">Full schema & metadata</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  format === 'csv'
                    ? 'border-primary bg-primary/5 text-primary shadow-2xs font-semibold'
                    : 'border-border/60 hover:border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Table className="w-4 h-4 shrink-0" />
                <div>
                  <div className="text-xs">CSV Spreadsheet</div>
                  <div className="text-[10px] opacity-70">Tabular export</div>
                </div>
              </button>
            </div>
          </div>

          {/* Scope and Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {/* Target Project */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold">Project Scope</Label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full h-8 px-2 rounded-lg border border-border bg-background text-xs font-medium cursor-pointer"
              >
                <option value="all">📁 All Projects</option>
                {projects?.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} ({p.secrets_count ?? 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Environment */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold">Environment Scope</Label>
              <select
                value={selectedEnv}
                onChange={(e) => setSelectedEnv(e.target.value)}
                className="w-full h-8 px-2 rounded-lg border border-border bg-background text-xs font-medium cursor-pointer"
              >
                <option value="all">🌐 All Envs</option>
                {environments.map((e) => (
                  <option key={e.slug} value={e.slug}>
                    {e.name} ({e.secrets_count ?? 0})
                  </option>
                ))}
              </select>
            </div>

            {/* PAM Guard Options */}
            <div className="space-y-1.5 flex flex-col justify-end">
              <div className="flex items-center justify-between p-1.5 rounded-lg border border-border/60 bg-muted/20 h-8">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-amber-500" />
                    <span>Include PAM</span>
                  </div>
                </div>
                <Switch checked={includePam} onCheckedChange={setIncludePam} />
              </div>
            </div>
          </div>

          {/* Secret Types Filter */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold">Include Secret Types</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TYPES.map((t) => {
                const conf = TYPE_CONFIG[t]
                const Icon = conf.icon
                const isSelected = selectedTypes.includes(t)

                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeToggle(t)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary/10 text-primary border-primary/30 font-semibold'
                        : 'bg-muted/40 text-muted-foreground border-transparent hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{conf.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Live Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                <span>Output Preview</span>
                {loading && <RefreshCw className="w-3 h-3 animate-spin text-primary" />}
              </Label>
              <span className="text-[10px] text-muted-foreground font-mono">
                {previewContent ? `${previewContent.split('\n').length} lines` : '0 lines'}
              </span>
            </div>

            <div className="relative rounded-xl border border-border/60 bg-muted/40 overflow-hidden font-mono text-[11px]">
              <textarea
                readOnly
                value={previewContent}
                rows={7}
                className="w-full p-3 bg-transparent text-foreground resize-none focus:outline-hidden leading-relaxed"
                placeholder="Preview will appear here..."
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3.5 border-t border-border/50 bg-muted/20 flex flex-row items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={loading || !previewContent}
              className="gap-1.5 text-xs h-8"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              Copy to Clipboard
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleDownload}
              disabled={loading || !previewContent}
              className="gap-1.5 text-xs h-8"
            >
              <Download className="w-3.5 h-3.5" />
              Download File
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

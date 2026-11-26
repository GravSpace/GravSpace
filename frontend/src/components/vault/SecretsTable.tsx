import { useState, useEffect, useMemo } from 'react'
import {
  Lock,
  Eye,
  EyeOff,
  Copy,
  Download,
  History,
  Trash2,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Upload,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { Button } from '../ui/button'
import {
  TYPE_CONFIG,
  type VaultSecret,
  type VaultProject,
  getEnvTheme,
  getProjectTheme,
  getProjectIcon,
} from './vaultTypes'
import { detectSecretFileExt, formatSecretFileSize } from './vaultDownload'
import { toast } from 'sonner'

interface Props {
  secrets: VaultSecret[]
  projects?: VaultProject[]
  currentProject?: string
  revealedMap: Record<string, string>
  revealingId: string | null
  currentEnv: string
  envLabel: string
  onToggleReveal: (s: VaultSecret) => void
  onCopy: (s: VaultSecret) => void
  onDownload: (s: VaultSecret, mode?: 'file' | 'bundle') => void
  onSelectDetail: (s: VaultSecret) => void
  onDelete: (id: string) => void
  onOpenCreate: () => void
  onOpenImport: () => void
}

export function SecretsTable({
  secrets,
  projects,
  currentProject,
  revealedMap,
  revealingId,
  currentEnv,
  envLabel,
  onToggleReveal,
  onCopy,
  onDownload,
  onSelectDetail,
  onDelete,
  onOpenCreate,
  onOpenImport,
}: Props) {
  function copyKeyName(name: string) {
    navigator.clipboard.writeText(name)
    toast.success(`Secret name "${name}" copied`)
  }

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setPage(1)
  }, [secrets.length, currentEnv, currentProject])

  const totalPages = Math.max(1, Math.ceil(secrets.length / pageSize))
  const paginatedSecrets = useMemo(() => {
    const start = (page - 1) * pageSize
    return secrets.slice(start, start + pageSize)
  }, [secrets, page, pageSize])

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/35 border-b border-border/50 text-muted-foreground font-medium text-[11px]">
            <tr className="whitespace-nowrap">
              <th className="py-2 px-3.5">Key / Secret Name</th>
              {currentProject === 'all' && <th className="py-2 px-3">Project</th>}
              {currentEnv === 'all' && <th className="py-2 px-3">Environment</th>}
              <th className="py-2 px-3">Type</th>
              <th className="py-2 px-3">Value</th>
              <th className="py-2 px-3">PAM Security</th>
              <th className="py-2 px-3">Version</th>
              <th className="py-2 px-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {secrets.length === 0 ? (
              <tr>
                <td colSpan={(currentEnv === 'all' ? 1 : 0) + (currentProject === 'all' ? 1 : 0) + 6} className="py-12 px-4 text-center">
                  <div className="max-w-sm mx-auto p-6 rounded-2xl border border-dashed border-border/80 bg-muted/20 text-center space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-muted/60 border border-border/60 flex items-center justify-center mx-auto text-muted-foreground">
                      <Lock className="w-5 h-5 opacity-50" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">
                        No secrets found in {envLabel}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-normal">
                        Store API keys, credentials, certificates, or tokens encrypted with AES-256-GCM.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <Button size="sm" onClick={onOpenCreate} className="h-7 text-xs gap-1.5 shadow-2xs">
                        <Plus className="w-3 h-3" />
                        <span>Add Secret</span>
                      </Button>
                      <Button variant="outline" size="sm" onClick={onOpenImport} className="h-7 text-xs gap-1.5">
                        <Upload className="w-3 h-3 text-muted-foreground" />
                        <span>Import .env</span>
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedSecrets.map((s) => {
                const typeConf = TYPE_CONFIG[s.secret_type]
                const TypeIcon = typeConf?.icon || KeyRound
                const isRevealed = Boolean(revealedMap[s.id])
                const isRevealing = revealingId === s.id
                const envTheme = getEnvTheme(s.environment)

                return (
                  <tr key={s.id} className="hover:bg-muted/25 transition-colors group">
                    {/* Key Name, Description & Tags */}
                    <td className="py-2 px-3.5 max-w-[230px] sm:max-w-[320px] lg:max-w-[380px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 border border-border/50">
                          <TypeIcon className={`w-3.5 h-3.5 ${typeConf?.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => copyKeyName(s.name)}
                              className="font-mono font-semibold text-foreground text-xs hover:text-primary transition-colors text-left inline-flex items-center gap-1.5 min-w-0 max-w-full group/btn cursor-pointer"
                              title={`${s.name} (click to copy)`}
                            >
                              <span className="truncate">{s.name}</span>
                              <Copy className="w-3 h-3 shrink-0 opacity-0 group-hover/btn:opacity-70 transition-opacity" />
                            </button>
                          </div>
                          {(s.description || (s.tags && s.tags.length > 0)) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 min-w-0">
                              {s.description && (
                                <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                                  {s.description}
                                </span>
                              )}
                              {s.tags?.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center text-[10px] leading-tight py-0.5 px-1.5 rounded-md bg-muted/60 border border-border/50 text-muted-foreground font-mono"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Project Pill if viewing All Projects */}
                    {currentProject === 'all' && (
                      <td className="py-2 px-3 whitespace-nowrap">
                        {(() => {
                          const proj = projects?.find((p) => p.slug === s.project_id)
                          const theme = getProjectTheme(proj?.color)
                          const IconComp = getProjectIcon(proj?.icon)
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${theme.badge}`}>
                              <IconComp className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate max-w-[90px]">{proj?.name || s.project_id}</span>
                            </span>
                          )
                        })()}
                      </td>
                    )}

                    {/* Environment Pill if viewing All */}
                    {currentEnv === 'all' && (
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${envTheme.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${envTheme.dot}`} />
                          <span className="capitalize">{s.environment}</span>
                        </span>
                      </td>
                    )}

                    {/* Type & File Meta */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[11px] text-foreground/85 font-medium">
                          {typeConf?.label || s.secret_type}
                        </span>
                        {s.secret_type === 'file' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-[10px] font-mono font-medium text-sky-600 dark:text-sky-400">
                            .{detectSecretFileExt(s.name, s.metadata)}
                            {s.metadata?.size_bytes ? ` · ${formatSecretFileSize(s.metadata.size_bytes)}` : ''}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Masked / Revealed Value */}
                    <td className="py-2 px-3">
                      <div className="font-mono text-[11px] h-7 px-2.5 rounded-md bg-muted/35 border border-border/50 inline-flex items-center max-w-[180px] select-all truncate">
                        {isRevealed ? (
                          <span className="text-foreground truncate">{revealedMap[s.id]}</span>
                        ) : (
                          <span className="text-muted-foreground tracking-widest text-[10px]">••••••••••••</span>
                        )}
                      </div>
                    </td>

                    {/* PAM Status */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {s.requires_approval ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <ShieldAlert className="w-3 h-3 text-amber-500" />
                          PAM Guarded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-muted-foreground bg-muted/30 border border-border/50">
                          <ShieldCheck className="w-3 h-3 opacity-60" />
                          Direct
                        </span>
                      )}
                    </td>

                    {/* Version */}
                    <td className="py-2 px-3 font-mono text-[11px] whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectDetail(s)}
                        className="h-6 px-2 rounded-md border border-border/60 bg-background/50 hover:bg-muted font-mono text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="Click to view version history"
                      >
                        v{s.current_version}
                      </button>
                    </td>

                    {/* Grouped Compact Actions */}
                    <td className="py-2 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border/60 bg-muted/25">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onToggleReveal(s)}
                          disabled={isRevealing}
                          aria-label={isRevealed ? `Hide ${s.name}` : `Reveal ${s.name}`}
                          title={isRevealed ? 'Hide value' : 'Reveal value'}
                          className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onCopy(s)}
                          aria-label={`Copy ${s.name} value`}
                          title="Copy decrypted value"
                          className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDownload(s, s.secret_type === 'keystore' ? 'bundle' : 'file')}
                          aria-label={`Download ${s.name}`}
                          title={s.secret_type === 'keystore' ? 'Download keystore & credentials bundle (.zip)' : 'Download secret file / key'}
                          className="h-6 w-6 rounded-md text-muted-foreground hover:text-primary hover:bg-background"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onSelectDetail(s)}
                          aria-label={`Details and versions for ${s.name}`}
                          title="Details, rotate, and version rollback"
                          className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
                        >
                          <History className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(s.id)}
                          aria-label={`Delete ${s.name}`}
                          title="Delete secret"
                          className="h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Compact Pagination Footer */}
      {secrets.length > 0 && (
        <div className="px-3.5 py-2 border-t border-border/50 bg-muted/20 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-foreground">{Math.min(secrets.length, (page - 1) * pageSize + 1)}</strong>–
              <strong className="text-foreground">{Math.min(secrets.length, page * pageSize)}</strong> of{' '}
              <strong className="text-foreground">{secrets.length}</strong> secrets
            </span>
            <div className="h-3 w-[1px] bg-border/60 mx-1 hidden sm:block" />
            <div className="flex items-center gap-1.5 hidden sm:flex">
              <span className="text-[11px]">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="h-6 px-1.5 rounded-md border border-border/60 bg-background text-foreground text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                {[5, 10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="h-7 w-7 text-xs disabled:opacity-40"
                title="First Page"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 w-7 text-xs disabled:opacity-40"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>

              <span className="px-2 text-[11px] font-medium text-foreground">
                {page} / {totalPages}
              </span>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-7 w-7 text-xs disabled:opacity-40"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="h-7 w-7 text-xs disabled:opacity-40"
                title="Last Page"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

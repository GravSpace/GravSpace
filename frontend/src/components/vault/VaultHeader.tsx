import { KeyRound, ShieldAlert, Upload, Download, Plus, RefreshCw, ShieldCheck, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VaultHeaderProps {
  activeTab: 'secrets' | 'pam'
  onTabChange: (tab: 'secrets' | 'pam') => void
  totalSecrets: number
  pamGuardedCount: number
  pendingRequestsCount: number
  onOpenCreate: () => void
  onOpenImport: () => void
  onOpenExport: () => void
  onRefresh: () => void
  loading?: boolean
}

export function VaultHeader({
  activeTab,
  onTabChange,
  totalSecrets,
  pamGuardedCount,
  pendingRequestsCount,
  onOpenCreate,
  onOpenImport,
  onOpenExport,
  onRefresh,
  loading = false,
}: VaultHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border/40">
      {/* Title & Security Status */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
            <KeyRound className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Secrets & Agent Vault
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3 h-3" />
              AES-256-GCM AEAD
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-10.5">
          <span>
            <strong className="text-foreground font-semibold">{totalSecrets}</strong> secrets stored
          </span>
          <span className="text-border">•</span>
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-amber-500" />
            <strong className="text-foreground font-semibold">{pamGuardedCount}</strong> guarded with PAM
          </span>
        </div>
      </div>

      {/* Navigation Tabs & Primary Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Segmented View Switcher */}
        <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/50 text-xs">
          <button
            type="button"
            onClick={() => onTabChange('secrets')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'secrets'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Secrets Explorer
          </button>
          <button
            type="button"
            onClick={() => onTabChange('pam')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'pam'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>PAM Requests</span>
            {pendingRequestsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-bold animate-pulse">
                {pendingRequestsCount}
              </span>
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenImport}
            className="h-8 px-2.5 text-xs gap-1.5 bg-card hover:bg-muted/60"
            title="Import secrets from .env"
          >
            <Upload className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Import</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onOpenExport}
            className="h-8 px-2.5 text-xs gap-1.5 bg-card hover:bg-muted/60 border-primary/30 text-primary hover:text-primary"
            title="Export secrets to .env, JSON, or CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </Button>

          <Button
            size="sm"
            onClick={onOpenCreate}
            className="h-8 px-3 text-xs gap-1.5 shadow-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Secret</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Refresh vault"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
    </div>
  )
}

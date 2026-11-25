import React from 'react'
import { Plus, Settings2, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type VaultEnvironment, getEnvTheme } from './vaultTypes'

interface EnvironmentBarProps {
  environments: VaultEnvironment[]
  currentEnv: string
  onSelectEnv: (slug: string) => void
  onOpenManageEnv: () => void
  totalCount?: number
  counts?: Record<string, number>
}

export function EnvironmentBar({
  environments,
  currentEnv,
  onSelectEnv,
  onOpenManageEnv,
  totalCount = 0,
  counts,
}: EnvironmentBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 overflow-x-auto py-1 scrollbar-none">
      <div className="flex items-center gap-1.5 min-w-max">
        {/* All Environments Tab */}
        <button
          type="button"
          onClick={() => onSelectEnv('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            currentEnv === 'all'
              ? 'bg-primary/10 text-primary border border-primary/30 shadow-2xs font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>All Environments</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted/80 text-muted-foreground font-mono">
            {totalCount}
          </span>
        </button>

        {/* Separator */}
        <div className="h-4 w-[1px] bg-border/60 mx-1" />

        {/* Dynamic Environment Tabs */}
        {environments.map((env) => {
          const theme = getEnvTheme(env.color)
          const isSelected = currentEnv === env.slug
          const count = counts && counts[env.slug] !== undefined ? counts[env.slug] : env.secrets_count ?? 0

          return (
            <button
              key={env.id || env.slug}
              type="button"
              onClick={() => onSelectEnv(env.slug)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                isSelected
                  ? 'bg-card text-foreground border border-border shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${theme.dot} shrink-0`} />
              <span>{env.name}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono transition-colors ${
                  isSelected
                    ? `${theme.badge} border`
                    : 'bg-muted/70 text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}

        {/* Manage Environments Trigger */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenManageEnv}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 ml-1"
          title="Manage, create, or reorder environments"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add / Manage</span>
          <Settings2 className="w-3 h-3 ml-0.5 opacity-60" />
        </Button>
      </div>
    </div>
  )
}

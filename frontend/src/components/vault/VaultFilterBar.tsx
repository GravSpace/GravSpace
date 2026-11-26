import { Search, X, Filter } from 'lucide-react'
import { Tabs, TabsList, TabsTab } from '@ui-sdk/react/tabs'
import { Input } from '@/components/ui/input'
import { TYPE_CONFIG, type SecretType } from './vaultTypes'

interface VaultFilterBarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  selectedType: string
  onSelectType: (value: string) => void
}

const FILTER_TYPES = ['all', 'kv', 'agent_token', 'file', 'keystore', 'certificate'] as const

export function VaultFilterBar({
  searchQuery,
  onSearchChange,
  selectedType,
  onSelectType,
}: VaultFilterBarProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 p-2 rounded-xl bg-card border border-border/50 shadow-2xs">
      <div className="relative flex-1 max-w-md">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search secrets or files by name, description, or #tag..."
          aria-label="Search secrets"
          className="h-8 pl-8 pr-7 text-xs bg-background/80"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 shrink-0">
          <Filter className="w-3 h-3" />
          Type:
        </span>
        <Tabs value={selectedType} onValueChange={(v) => { if (v) onSelectType(v) }}>
          <TabsList aria-label="Filter secrets by category" className="flex items-center gap-1">
            {FILTER_TYPES.map((t) => (
              <TabsTab
                key={t}
                value={t}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40 data-selected:bg-primary/10 data-selected:text-primary data-selected:border-primary/25 data-selected:font-semibold data-selected:shadow-2xs"
              >
                {t === 'all' ? 'All Types' : TYPE_CONFIG[t as SecretType]?.label || t}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}

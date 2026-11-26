import { ArrowLeftRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SecretVersion } from './vaultTypes'

interface SecretVersionsTabProps {
  currentVersion: number
  versions: SecretVersion[]
  loading: boolean
  onRollback: (version: number) => void
}

export function SecretVersionsTab({
  currentVersion,
  versions,
  loading,
  onRollback,
}: SecretVersionsTabProps) {
  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading versions...</div>
  }
  if (versions.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">No historical versions found</div>
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => {
        const isCurrent = v.version === currentVersion
        return (
          <div
            key={v.version}
            className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
              isCurrent ? 'bg-primary/5 border-primary/40' : 'bg-muted/20 border-border/40 hover:bg-muted/40'
            }`}
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs">v{v.version}</span>
                {isCurrent && (
                  <Badge className="text-[9px] bg-primary/20 text-primary border-primary/30 py-0 h-4">
                    Current
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground font-mono">{v.created_at.slice(0, 16)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground italic">
                {v.comment || 'No comment provided'}
              </p>
            </div>

            {!isCurrent && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRollback(v.version)}
                className="h-7 text-[10px] gap-1 hover:bg-primary hover:text-primary-foreground"
              >
                <ArrowLeftRight className="w-3 h-3" /> Rollback
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

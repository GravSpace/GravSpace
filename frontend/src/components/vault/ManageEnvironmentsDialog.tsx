import React, { useState } from 'react'
import { Plus, Trash2, Check, Layers } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { type VaultEnvironment, ENV_COLOR_MAP, getEnvTheme } from './vaultTypes'

interface ManageEnvironmentsDialogProps {
  open: boolean
  onClose: () => void
  environments: VaultEnvironment[]
  apiBase: string
  authFetch: (url: string, options?: RequestInit) => Promise<Response>
  onEnvironmentsUpdated: () => void
}

const COLOR_OPTIONS = Object.keys(ENV_COLOR_MAP)

export function ManageEnvironmentsDialog({
  open,
  onClose,
  environments,
  apiBase,
  authFetch,
  onEnvironmentsUpdated,
}: ManageEnvironmentsDialogProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [color, setColor] = useState('sky')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function handleNameChange(val: string) {
    setName(val)
    const autoSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    setSlug(autoSlug)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/environments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          color,
          description: description.trim() || undefined,
          position: environments.length + 1,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(`Environment "${name}" created.`)
        setName('')
        setSlug('')
        setDescription('')
        setColor('sky')
        onEnvironmentsUpdated()
      } else {
        toast.error(data.error || data.message || 'Failed to create environment.')
      }
    } catch {
      toast.error('Network error creating environment.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(env: VaultEnvironment) {
    if (env.secrets_count && env.secrets_count > 0) {
      toast.error(`Cannot delete "${env.name}" because it still contains ${env.secrets_count} secrets.`)
      return
    }

    if (!confirm(`Are you sure you want to delete environment "${env.name}"?`)) {
      return
    }

    setDeletingId(env.id)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/environments/${env.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success(`Environment "${env.name}" removed.`)
        onEnvironmentsUpdated()
      } else {
        const data = await res.json()
        toast.error(data.error || data.message || 'Failed to delete.')
      }
    } catch {
      toast.error('Error deleting environment.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-0 overflow-hidden shadow-2xl text-xs">
        <DialogHeader className="px-6 py-4 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold tracking-tight">
                Manage Vault Environments
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
                Configure environments, display colors, and custom namespaces.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Environment List */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">Existing Environments</Label>
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden bg-background">
              {environments.map((env) => {
                const theme = getEnvTheme(env.color)
                const isSystem = ['env_dev', 'env_staging', 'env_prod'].includes(env.id)

                return (
                  <div key={env.id} className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${theme.dot} shrink-0`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-foreground">{env.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">slug: {env.slug}</span>
                        </div>
                        {env.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{env.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${theme.badge}`}>
                        {env.secrets_count ?? 0} secrets
                      </span>

                      {!isSystem ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(env)}
                          disabled={deletingId === env.id || (env.secrets_count ?? 0) > 0}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title={(env.secrets_count ?? 0) > 0 ? "Cannot delete environment with secrets" : "Delete environment"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic px-2">Default</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Add New Environment Form */}
          <form onSubmit={handleCreate} className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-primary" />
                Add New Environment
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Environment Name</Label>
                <Input
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Testing, QA, UAT"
                  className="h-8 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Slug (Identifier)</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. testing"
                  className="h-8 text-xs font-mono"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Theme Color</Label>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_OPTIONS.map((c) => {
                  const t = ENV_COLOR_MAP[c]
                  const isSelected = color === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full ${t.dot} flex items-center justify-center transition-all cursor-pointer ${
                        isSelected ? 'ring-2 ring-foreground ring-offset-2 scale-110 shadow-xs' : 'opacity-80 hover:opacity-100'
                      }`}
                      title={c}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Description (Optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief purpose of this environment"
                className="h-8 text-xs"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" size="sm" disabled={submitting || !name.trim()} className="h-8 px-3 text-xs gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {submitting ? 'Creating...' : 'Create Environment'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

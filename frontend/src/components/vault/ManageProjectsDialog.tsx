import { useState, useEffect } from 'react'
import {
  Folder,
  Plus,
  Trash2,
  Edit2,
  Check,
  Sparkles,
  Bot,
  Smartphone,
  Globe,
  Server,
  Cpu,
  Shield,
  Box,
  Layers,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { toast } from 'sonner'
import {
  type VaultProject,
  getProjectTheme,
  getProjectIcon,
} from './vaultTypes'

const COLOR_OPTIONS = [
  { key: 'indigo', label: 'Indigo', dot: 'bg-indigo-500' }, { key: 'sky', label: 'Sky', dot: 'bg-sky-500' },
  { key: 'emerald', label: 'Emerald', dot: 'bg-emerald-500' }, { key: 'amber', label: 'Amber', dot: 'bg-amber-500' },
  { key: 'rose', label: 'Rose', dot: 'bg-rose-500' }, { key: 'purple', label: 'Purple', dot: 'bg-purple-500' },
  { key: 'cyan', label: 'Cyan', dot: 'bg-cyan-500' },
]

const ICON_OPTIONS = [
  { key: 'folder', icon: Folder, label: 'Folder' }, { key: 'bot', icon: Bot, label: 'Bot' },
  { key: 'smartphone', icon: Smartphone, label: 'Mobile' }, { key: 'globe', icon: Globe, label: 'Web' },
  { key: 'server', icon: Server, label: 'Server' }, { key: 'cpu', icon: Cpu, label: 'AI/Chip' },
  { key: 'shield', icon: Shield, label: 'Security' }, { key: 'box', icon: Box, label: 'Package' },
]

interface Props {
  open: boolean
  onClose: () => void
  projects: VaultProject[]
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  onProjectsUpdated: () => void
  initialTab?: 'list' | 'create'
}

export function ManageProjectsDialog({
  open,
  onClose,
  projects,
  apiBase,
  authFetch,
  onProjectsUpdated,
  initialTab = 'list',
}: Props) {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('indigo')
  const [icon, setIcon] = useState('folder')
  const [submitting, setSubmitting] = useState(false)

  // Edit inline state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editColor, setEditColor] = useState('indigo')
  const [editIcon, setEditIcon] = useState('folder')

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab)
      resetForm()
    }
  }, [open, initialTab])

  function resetForm() {
    setName('')
    setSlug('')
    setDescription('')
    setColor('indigo')
    setIcon('folder')
    setEditingId(null)
  }

  function handleNameChange(val: string) {
    setName(val)
    const generated = val
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    setSlug(generated)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Project name is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
          color,
          icon,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to create project')
      }

      toast.success(`Project "${name}" created`)
      resetForm()
      setActiveTab('list')
      onProjectsUpdated()
    } catch (err: any) {
      toast.error(err.message || 'Error creating project')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) {
      toast.error('Project name is required')
      return
    }

    try {
      const res = await authFetch(`${apiBase}/admin/vault/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || undefined,
          color: editColor,
          icon: editIcon,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to update project')
      }

      toast.success('Project updated')
      setEditingId(null)
      onProjectsUpdated()
    } catch (err: any) {
      toast.error(err.message || 'Error updating project')
    }
  }

  async function handleDelete(p: VaultProject) {
    if (p.slug === 'default') {
      toast.error('Cannot delete the default project')
      return
    }

    if (!confirm(`Are you sure you want to delete project "${p.name}"?`)) {
      return
    }

    try {
      const res = await authFetch(`${apiBase}/admin/vault/projects/${p.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to delete project')
      }

      toast.success(`Project "${p.name}" deleted`)
      onProjectsUpdated()
    } catch (err: any) {
      toast.error(err.message || 'Error deleting project')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-xl rounded-2xl border border-border/80 bg-card p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col text-xs">
        <DialogHeader className="px-5 py-3.5 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between shrink-0 pr-12">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
                Vault Projects
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
                Organize secrets by project workspace to prevent clutter
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-2 border-b border-border/40 bg-muted/10 shrink-0">
            <TabsList className="h-8 bg-transparent p-0 gap-2">
              <TabsTrigger
                value="list"
                className="h-7 text-xs px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary cursor-pointer font-medium"
              >
                All Projects ({projects.length})
              </TabsTrigger>
              <TabsTrigger
                value="create"
                className="h-7 text-xs px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary cursor-pointer font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Project
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <TabsContent value="list" className="mt-0 space-y-2">
              {projects.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No projects found</div>
              ) : (
                projects.map((p) => {
                  const Icon = getProjectIcon(p.icon)
                  const theme = getProjectTheme(p.color)
                  const isEditing = editingId === p.id

                  if (isEditing) {
                    return (
                      <div key={p.id} className="p-3.5 rounded-xl border border-primary/40 bg-card space-y-3 shadow-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px]">Project Name</Label>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-8 text-xs font-semibold"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">Description</Label>
                            <Input
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              placeholder="Project description..."
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        {/* Colors & Icons */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1">
                            {COLOR_OPTIONS.map((c) => (
                              <button
                                key={c.key}
                                type="button"
                                onClick={() => setEditColor(c.key)}
                                className={`w-5 h-5 rounded-full ${c.dot} border transition-all ${editColor === c.key ? 'ring-2 ring-primary scale-110' : 'opacity-70 hover:opacity-100'
                                  }`}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                              className="h-7 text-xs"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleUpdate(p.id)}
                              className="h-7 text-xs gap-1 font-semibold"
                            >
                              <Check className="w-3 h-3" /> Save
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg ${theme.bg} border ${theme.border} flex items-center justify-center shrink-0`}
                        >
                          <Icon className={`w-4 h-4 ${theme.dot.replace('bg-', 'text-')}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-foreground truncate">{p.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground px-1.5 py-0.2 rounded-md bg-muted/60">
                              {p.slug}
                            </span>
                            {p.slug === 'default' && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                                System Default
                              </span>
                            )}
                          </div>
                          {p.description && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{p.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-muted/80 text-muted-foreground font-mono">
                          {p.secrets_count ?? 0} secret(s)
                        </span>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingId(p.id)
                            setEditName(p.name)
                            setEditDesc(p.description || '')
                            setEditColor(p.color)
                            setEditIcon(p.icon)
                          }}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Edit project"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>

                        {p.slug !== 'default' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(p)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Delete project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </TabsContent>

            <TabsContent value="create" className="mt-0">
              <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">
                      Project Name <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. Example Mobile"
                      className="h-8 text-xs font-medium"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Project Identifier (Slug)</Label>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="example"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Description (Optional)</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description of this project scope..."
                    className="h-8 text-xs"
                  />
                </div>

                {/* Color Selector */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Badge Color Theme
                  </Label>
                  <div className="flex items-center gap-2">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setColor(c.key)}
                        className={`w-6 h-6 rounded-full ${c.dot} border transition-all cursor-pointer ${color === c.key ? 'ring-2 ring-primary scale-110 shadow-xs' : 'opacity-70 hover:opacity-100'
                          }`}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Icon Selector */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Project Icon
                  </Label>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    {ICON_OPTIONS.map((item) => {
                      const IconComp = item.icon
                      const isSelected = icon === item.key
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setIcon(item.key)}
                          className={`p-2 rounded-lg border text-center flex flex-col items-center gap-1 transition-all cursor-pointer ${isSelected
                              ? 'bg-primary/10 border-primary text-primary font-semibold shadow-2xs'
                              : 'bg-muted/30 border-border/60 hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                            }`}
                        >
                          <IconComp className="w-3.5 h-3.5" />
                          <span className="text-[9px] truncate w-full">{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-border/50">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('list')}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting}
                    className="h-8 text-xs gap-1.5 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {submitting ? 'Creating...' : 'Create Project'}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

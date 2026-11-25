import { useState, useMemo } from 'react'
import {
  Folder,
  Globe,
  Plus,
  Settings2,
  Check,
  ChevronsUpDown,
  Search,
  Sparkles,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import {
  type VaultProject,
  getProjectTheme,
  getProjectIcon,
} from './vaultTypes'

interface ProjectSwitcherProps {
  projects: VaultProject[]
  currentProject: string
  onSelectProject: (slugOrId: string) => void
  onOpenCreateProject: () => void
  onOpenManageProjects: () => void
  totalAllSecrets?: number
}

export function ProjectSwitcher({
  projects,
  currentProject,
  onSelectProject,
  onOpenCreateProject,
  onOpenManageProjects,
  totalAllSecrets = 0,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const activeProjectObj = useMemo(() => {
    if (currentProject === 'all') return null
    return projects.find((p) => p.slug === currentProject || p.id === currentProject)
  }, [projects, currentProject])

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.toLowerCase().trim()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    )
  }, [projects, search])

  const ActiveIcon = activeProjectObj ? getProjectIcon(activeProjectObj.icon) : Globe
  const activeTheme = activeProjectObj ? getProjectTheme(activeProjectObj.color) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="h-8 px-2.5 rounded-lg border border-border/70 bg-card hover:bg-muted/40 transition-all flex items-center justify-between gap-2 text-xs font-medium cursor-pointer shadow-2xs group focus:outline-none focus:ring-1 focus:ring-primary min-w-[170px] max-w-[240px]"
        >
          <div className="flex items-center gap-2 truncate">
            {currentProject === 'all' ? (
              <div className="w-5 h-5 rounded-md bg-muted/80 border border-border/60 flex items-center justify-center shrink-0 text-muted-foreground">
                <Globe className="w-3 h-3 text-sky-500" />
              </div>
            ) : (
              <div
                className={`w-5 h-5 rounded-md ${activeTheme?.bg || 'bg-indigo-500/10'} border ${activeTheme?.border || 'border-indigo-500/20'} flex items-center justify-center shrink-0`}
              >
                <ActiveIcon className={`w-3 h-3 ${activeTheme?.dot.replace('bg-', 'text-') || 'text-indigo-500'}`} />
              </div>
            )}
            <span className="truncate font-semibold text-foreground text-xs">
              {currentProject === 'all' ? 'All Projects' : activeProjectObj?.name || currentProject}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted font-mono">
              {currentProject === 'all'
                ? totalAllSecrets
                : activeProjectObj?.secrets_count ?? 0}
            </span>
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[280px] p-1.5 shadow-xl bg-card border border-border/80 rounded-xl" align="start">
        {/* Search header */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/50 mb-1">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 text-foreground"
            autoFocus
          />
        </div>

        {/* Project options list */}
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {/* All Projects Option */}
          <button
            type="button"
            onClick={() => {
              onSelectProject('all')
              setOpen(false)
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
              currentProject === 'all'
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-foreground hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <Globe className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span className="truncate">All Projects</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-muted-foreground font-mono">
                {totalAllSecrets}
              </span>
              {currentProject === 'all' && <Check className="w-3.5 h-3.5 text-primary" />}
            </div>
          </button>

          <div className="h-[1px] bg-border/40 my-1" />

          {/* Project Items */}
          {filteredProjects.length === 0 ? (
            <p className="text-[11px] text-muted-foreground p-3 text-center">No projects found</p>
          ) : (
            filteredProjects.map((p) => {
              const Icon = getProjectIcon(p.icon)
              const theme = getProjectTheme(p.color)
              const isSelected = currentProject === p.slug || currentProject === p.id

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(p.slug)
                    setOpen(false)
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <div
                      className={`w-5 h-5 rounded-md ${theme.bg} border ${theme.border} flex items-center justify-center shrink-0`}
                    >
                      <Icon className={`w-3 h-3 ${theme.dot.replace('bg-', 'text-')}`} />
                    </div>
                    <div className="truncate min-w-0">
                      <span className="truncate block font-medium leading-tight">{p.name}</span>
                      {p.description && (
                        <span className="text-[10px] text-muted-foreground truncate block font-sans opacity-70">
                          {p.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {p.secrets_count ?? 0}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-1.5 border-t border-border/50 mt-1 flex items-center justify-between gap-1 text-[11px]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false)
              onOpenCreateProject()
            }}
            className="h-7 px-2 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/10 flex-1 justify-center"
          >
            <Plus className="w-3 h-3" /> New Project
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false)
              onOpenManageProjects()
            }}
            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground flex-1 justify-center"
          >
            <Settings2 className="w-3 h-3" /> Manage
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

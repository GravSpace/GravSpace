import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Database,
  User as UserIcon,
  Shield,
  UploadCloud,
  ScrollText,
  Trash2,
  Link2 as LinkIcon,
  Settings,
  LogOut,
  Search,
  Sparkles,
  FileText,
} from 'lucide-react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Dialog, DialogContent } from './ui/dialog'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Button } from './ui/button'
import { useAuth } from '../hooks/useAuth'
import { useTransfers } from '../hooks/useTransfers'

const navItems = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/buckets', label: 'Buckets', icon: Database },
  { path: '/admin/presigns', label: 'Presigned Links', icon: LinkIcon },
  { path: '/admin/users', label: 'IAM Engine', icon: UserIcon },
  { path: '/admin/policies', label: 'Security Policies', icon: Shield },
  { path: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
  { path: '/admin/trash', label: 'Recycle Bin', icon: Trash2 },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
]

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function AppSidebar() {
  const { authState, logout } = useAuth()
  const { activeTransfersCount, setShowTransferManager, showTransferManager } =
    useTransfers()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
  const { authFetch } = useAuth()
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setShowSearch((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Run search when query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const delayDebounce = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await authFetch(`${API_BASE}/admin/search?q=${encodeURIComponent(searchQuery)}`)
        if (res.ok) {
          setSearchResults((await res.json()) || [])
        }
      } catch (err) {
        console.error('Failed to search objects', err)
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(delayDebounce)
  }, [searchQuery, authFetch])

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  function handleLogout() {
    logout()
    navigate({ to: '/login' })
  }

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 w-9 h-9 flex items-center justify-center rounded-lg p-1.5 shrink-0">
              <img src="/logo.png" alt="GravSpace" className="w-full h-full object-contain" />
            </div>
            <span className="text-lg font-bold tracking-tight">GravSpace</span>
          </div>
          <div className="px-2 mb-2 mt-1">
            <button
              onClick={() => setShowSearch(true)}
              className="w-full flex items-center justify-between h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-background/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs transition-colors focus:outline-none"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Search S3 objects...</span>
              </div>
              <kbd className="pointer-events-none select-none flex items-center gap-0.5 rounded bg-muted px-1.5 font-mono text-[9px] font-medium text-muted-foreground border shrink-0">
                <span>⌘</span><span>K</span>
              </kbd>
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive =
                    currentPath === item.path ||
                    (item.path !== '/admin/dashboard' && currentPath.startsWith(item.path))
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => navigate({ to: item.path })}
                        tooltip={item.label}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="space-y-2 px-2">
            {/* Transfer manager toggle */}
            <Button
              variant="ghost"
              size="sm"
              className={`w-full justify-start gap-2 text-xs ${
                mounted && activeTransfersCount > 0
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'text-muted-foreground'
              }`}
              onClick={() => setShowTransferManager(!showTransferManager)}
            >
              <div className="relative">
                <UploadCloud className="w-4 h-4" />
                {mounted && activeTransfersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 border border-background rounded-full animate-pulse" />
                )}
              </div>
              <span>Transfers</span>
              {mounted && activeTransfersCount > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                  {activeTransfersCount}
                </span>
              )}
            </Button>

            {/* User info */}
            <div className="flex items-center gap-3 px-1 py-1">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarFallback className="text-[10px]">
                  {mounted ? (authState.username?.substring(0, 2).toUpperCase() || 'AD') : 'AD'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-xs font-semibold truncate">
                  {mounted ? (authState.username || 'Admin') : 'Admin'}
                </span>
                <span className="text-[10px] text-muted-foreground">Authenticated</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Smart Global Search Dialog */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border border-slate-200 dark:border-slate-800 rounded-2xl bg-card">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b">
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files across all S3 buckets..."
              className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-sm h-8 pl-0 placeholder:text-muted-foreground"
              autoFocus
            />
            {searching ? (
              <span className="text-[10px] font-bold text-indigo-500 animate-pulse uppercase tracking-wider shrink-0 mr-2">Searching...</span>
            ) : null}
            <kbd className="pointer-events-none select-none flex items-center gap-0.5 rounded bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground border shrink-0">
              <span>ESC</span>
            </kbd>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y font-medium text-xs">
            {searchQuery.trim() === '' ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground select-none gap-2">
                <Sparkles className="w-8 h-8 text-indigo-500/40 animate-pulse" />
                <p className="text-sm font-semibold tracking-tight text-foreground/80">Smart S3 Indexer</p>
                <p className="text-xs max-w-xs leading-normal opacity-60">Type a file name, prefix, or suffix to search across all S3 buckets instantly.</p>
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((item, idx) => {
                const pathParts = item.Key.split('/')
                const fileName = pathParts.pop() || item.Key
                const folderPath = pathParts.join('/')
                
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setShowSearch(false)
                      setSearchQuery('')
                      // Extract folder prefix
                      const prefix = folderPath ? folderPath + '/' : ''
                      navigate({
                        to: `/admin/buckets/${item.Bucket}`,
                        search: { prefix },
                      })
                    }}
                    className="w-full text-left p-3.5 px-4 hover:bg-muted/30 flex items-center justify-between group transition-colors focus:outline-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-indigo-500/10 shrink-0">
                        <FileText className="w-4 h-4 text-indigo-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors truncate">
                          {fileName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate font-mono opacity-80 mt-0.5">
                          arn:aws:s3:::{item.Bucket}/{item.Key}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[9px] font-bold py-0.5 px-1.5 uppercase shrink-0">
                        {item.Bucket}
                      </Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatSize(item.Size)}
                      </span>
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                No matching S3 objects found.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

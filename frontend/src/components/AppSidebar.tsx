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
} from 'lucide-react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
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

export function AppSidebar() {
  const { authState, logout } = useAuth()
  const { activeTransfersCount, setShowTransferManager, showTransferManager } =
    useTransfers()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  function handleLogout() {
    logout()
    navigate({ to: '/login' })
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 w-9 h-9 flex items-center justify-center rounded-lg p-1.5 shrink-0">
            <img src="/logo.png" alt="GravSpace" className="w-full h-full object-contain" />
          </div>
          <span className="text-lg font-bold tracking-tight">GravSpace</span>
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
  )
}

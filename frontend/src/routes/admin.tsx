import { createFileRoute, redirect, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getAuthState } from '../hooks/useAuth'
import { useAuth } from '../hooks/useAuth'
import { AppSidebar } from '../components/AppSidebar'
import { MobileTopBar } from '../components/MobileTopBar'
import { TransferManager } from '../components/TransferManager'
import { PasswordOnboardingModal } from '../components/PasswordOnboardingModal'
import { SidebarProvider, SidebarInset } from '../components/ui/sidebar'

export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    // Prevent SSR from redirecting to login on browser refresh before client-side hydration
    if (typeof window === 'undefined') return
    const auth = getAuthState()
    if (!auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  component: AdminLayout,
})

function AdminLayout() {
  const { authState } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authState.isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [authState.isAuthenticated, navigate])

  return (
    <SidebarProvider>
      <div className="flex h-dvh w-full bg-background text-foreground overflow-hidden">
        <AppSidebar />

        <SidebarInset className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <MobileTopBar />
          <Outlet />
        </SidebarInset>

        {/* Floating Transfer Manager */}
        <TransferManager />

        {/* Password Onboarding Modal */}
        <PasswordOnboardingModal isOpen={!!authState.isDefaultPassword} />
      </div>
    </SidebarProvider>
  )
}

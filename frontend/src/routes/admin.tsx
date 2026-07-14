import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getAuthState } from '../hooks/useAuth'
import { useAuth } from '../hooks/useAuth'
import { AppSidebar } from '../components/AppSidebar'
import { TransferManager } from '../components/TransferManager'
import { PasswordOnboardingModal } from '../components/PasswordOnboardingModal'
import { SidebarProvider, SidebarInset } from '../components/ui/sidebar'

export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      const auth = getAuthState()
      if (!auth.isAuthenticated) {
        throw redirect({ to: '/login' })
      }
    }
  },
  component: AdminLayout,
})

function AdminLayout() {
  const { authState } = useAuth()

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
        <AppSidebar />

        <SidebarInset className="flex flex-col flex-1 overflow-hidden">
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
